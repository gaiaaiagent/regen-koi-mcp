# Personalized AI Assistance Based on User Profiles

**Status:** Draft
**Author:** Claude (planning)
**Date:** 2026-01-21
**Version:** 1.0

## Overview

This specification describes how to implement personalized AI assistance based on user profiles stored in the KOI knowledge graph. The goal is to allow team leads (like Marie) to set up profiles for their team members so that the AI automatically adapts its teaching style, verbosity, and explanation depth based on the user's experience level and preferences.

## Background

### Current State

1. **Authentication exists**: KOI MCP already has Google OAuth authentication (`regen_koi_authenticate`) for @regen.network emails
2. **Backend knows the user**: `koi-query-api.ts` validates session tokens and extracts `user_email` from the `session_tokens` table
3. **Entity registry exists**: PostgreSQL `entity_registry` table with extensible `metadata` JSONB field
4. **Person entities exist**: The knowledge graph already has `PERSON` entity types

### Gap

Currently, authentication only gates access to private data. There is no mechanism to:
- Store user preferences and experience levels
- Inject these preferences into AI responses
- Allow admins to manage profiles for their team

---

## 1. Person Entity Schema Extension

### New Fields in entity_registry.metadata

For entities where `entity_type = 'PERSON'` and the person has a `@regen.network` email, we add a `user_profile` object to the `metadata` JSONB field:

```json
{
  "user_profile": {
    "email": "junior.dev@regen.network",
    "experience_level": "junior",
    "role": "frontend",
    "preferences": {
      "explain_before_code": true,
      "verbosity": "detailed",
      "show_related_patterns": true,
      "include_architecture_context": true,
      "preferred_examples": "typescript"
    },
    "learning_areas": ["react", "cosmos-sdk", "testing"],
    "managed_by": "marie@regen.network",
    "profile_version": 1,
    "created_at": "2026-01-21T10:00:00Z",
    "updated_at": "2026-01-21T10:00:00Z"
  }
}
```

### Field Definitions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | The user's @regen.network email (links to session_tokens) |
| `experience_level` | enum | Yes | `junior`, `mid`, `senior`, `staff`, `principal` |
| `role` | enum | Yes | `frontend`, `backend`, `full-stack`, `devops`, `data`, `product`, `design` |
| `preferences.explain_before_code` | boolean | No | Show conceptual explanation before code samples (default: true for junior) |
| `preferences.verbosity` | enum | No | `concise`, `balanced`, `detailed` (default based on experience_level) |
| `preferences.show_related_patterns` | boolean | No | Include related design patterns and best practices |
| `preferences.include_architecture_context` | boolean | No | Explain where code fits in the larger system |
| `preferences.preferred_examples` | string | No | Language/framework for code examples |
| `learning_areas` | string[] | No | Topics the user is actively trying to improve |
| `managed_by` | string | No | Email of the person who can edit this profile (team lead) |
| `profile_version` | integer | No | Schema version for migrations |
| `created_at` | ISO8601 | Auto | Profile creation timestamp |
| `updated_at` | ISO8601 | Auto | Last modification timestamp |

### Default Preferences by Experience Level

```typescript
const DEFAULT_PREFERENCES = {
  junior: {
    explain_before_code: true,
    verbosity: 'detailed',
    show_related_patterns: true,
    include_architecture_context: true
  },
  mid: {
    explain_before_code: true,
    verbosity: 'balanced',
    show_related_patterns: true,
    include_architecture_context: false
  },
  senior: {
    explain_before_code: false,
    verbosity: 'concise',
    show_related_patterns: false,
    include_architecture_context: false
  },
  staff: {
    explain_before_code: false,
    verbosity: 'concise',
    show_related_patterns: false,
    include_architecture_context: false
  },
  principal: {
    explain_before_code: false,
    verbosity: 'concise',
    show_related_patterns: false,
    include_architecture_context: false
  }
};
```

---

## 2. Backend Changes (koi-query-api.ts)

### New Endpoint: GET /api/koi/user/profile

```typescript
// GET /api/koi/user/profile
app.get('/api/koi/user/profile', async (req, res) => {
  const requestId = generateRequestId();
  res.setHeader('X-Request-ID', requestId);

  try {
    // Extract and validate session token
    const authHeader = req.headers['authorization'] as string | undefined;
    const sessionToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    const userEmail = await validateSessionToken(sessionToken);

    if (!userEmail) {
      return res.status(401).json(createErrorEnvelope(requestId, {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
        retryable: false
      }));
    }

    // Look up user profile from entity_registry
    const result = await pool.query(
      `SELECT entity_text, metadata
       FROM entity_registry
       WHERE entity_type = 'PERSON'
       AND metadata->'user_profile'->>'email' = $1`,
      [userEmail]
    );

    if (result.rows.length === 0) {
      // User not in system - return default profile
      return res.json(createSuccessEnvelope(requestId, {
        email: userEmail,
        name: userEmail.split('@')[0],
        has_profile: false,
        profile: null,
        defaults: DEFAULT_PREFERENCES.mid // Default to mid-level
      }));
    }

    const row = result.rows[0];
    const profile = row.metadata?.user_profile || {};
    const level = profile.experience_level || 'mid';

    // Merge stored preferences with defaults
    const effectivePreferences = {
      ...DEFAULT_PREFERENCES[level],
      ...(profile.preferences || {})
    };

    return res.json(createSuccessEnvelope(requestId, {
      email: userEmail,
      name: row.entity_text,
      has_profile: true,
      profile: {
        ...profile,
        preferences: effectivePreferences
      }
    }));

  } catch (error) {
    console.error('Profile lookup error:', error);
    return res.status(500).json(createErrorEnvelope(requestId, {
      code: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error',
      retryable: true
    }));
  }
});
```

### Profile Update Endpoint (Admin Only)

```typescript
// PUT /api/koi/user/profile/:email
// Requires: authenticated user must be profile owner OR managed_by match
app.put('/api/koi/user/profile/:email', async (req, res) => {
  const requestId = generateRequestId();
  const targetEmail = req.params.email;

  // Validate auth
  const authHeader = req.headers['authorization'] as string | undefined;
  const sessionToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
  const editorEmail = await validateSessionToken(sessionToken);

  if (!editorEmail) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Authorization check: can only edit own profile or profiles you manage
  const existingProfile = await pool.query(
    `SELECT metadata->'user_profile' as profile
     FROM entity_registry
     WHERE entity_type = 'PERSON'
     AND metadata->'user_profile'->>'email' = $1`,
    [targetEmail]
  );

  if (existingProfile.rows.length > 0) {
    const profile = existingProfile.rows[0].profile;
    const managedBy = profile?.managed_by;

    if (targetEmail !== editorEmail && managedBy !== editorEmail) {
      return res.status(403).json({
        error: 'Can only edit your own profile or profiles you manage',
        managed_by: managedBy
      });
    }
  }

  // Validate and update profile
  const { experience_level, role, preferences, learning_areas } = req.body;

  const newProfile = {
    email: targetEmail,
    experience_level: experience_level || 'mid',
    role: role || 'full-stack',
    preferences: preferences || {},
    learning_areas: learning_areas || [],
    managed_by: existingProfile.rows[0]?.profile?.managed_by || editorEmail,
    profile_version: 1,
    updated_at: new Date().toISOString()
  };

  // Upsert into entity_registry
  await pool.query(
    `UPDATE entity_registry
     SET metadata = metadata || jsonb_build_object('user_profile', $2::jsonb),
         last_seen_at = NOW()
     WHERE entity_type = 'PERSON'
     AND metadata->'user_profile'->>'email' = $1`,
    [targetEmail, JSON.stringify(newProfile)]
  );

  return res.json({ success: true, profile: newProfile });
});
```

---

## 3. MCP Tool Changes (regen-koi-mcp)

### New Tool: `get_my_profile`

Add to `src/tools.ts`:

```typescript
{
  name: 'get_my_profile',
  description: 'Get your personalized profile including experience level, preferences, and learning areas. This profile is used to customize AI responses to your skill level.',
  inputSchema: {
    type: 'object',
    properties: {}
  }
}
```

### Automatic Profile Context Injection

Modify the `search` and other query tools to include profile context in responses:

```typescript
private formatSearchResults(results: any[], query: string, sortBy: string, profile?: any): string {
  let output = '';

  // Add profile context hint at the top (for the LLM to use)
  if (profile) {
    output += `<!-- User Profile Context:\n`;
    output += `Experience: ${profile.experience_level}\n`;
    output += `Preferences: ${JSON.stringify(profile.preferences)}\n`;
    output += `Learning Areas: ${profile.learning_areas?.join(', ') || 'none'}\n`;
    output += `-->\n\n`;
  }

  // ... rest of formatting ...
}
```

---

## 4. Admin Workflow

### Option A: Obsidian Vault Integration (Recommended)

Profiles can be managed via Obsidian notes with frontmatter:

**File: `People/Jane Junior.md`**
```markdown
---
"@type": schema:Person
name: Jane Junior
email: jane@regen.network
user_profile:
  experience_level: junior
  role: frontend
  preferences:
    explain_before_code: true
    verbosity: detailed
    show_related_patterns: true
  learning_areas:
    - react
    - typescript
    - testing
  managed_by: marie@regen.network
---

# Jane Junior

Frontend developer on the Web team.
```

### Option B: CLI Tool

```bash
# Set profile for a team member
koi-admin profile set jane@regen.network \
  --level junior \
  --role frontend \
  --explain-before-code true \
  --verbosity detailed \
  --learning-areas "react,typescript,testing" \
  --managed-by marie@regen.network

# View a profile
koi-admin profile get jane@regen.network

# List all profiles managed by a team lead
koi-admin profile list --managed-by marie@regen.network
```

---

## 5. Example User Journeys

### Junior Developer Asks a Technical Question

**User:** Alex (junior, frontend, learning React)
**Query:** "How do I add a new page to regen-web?"

**AI Response (with profile context):**

> ## Adding a New Page to regen-web
>
> Before diving into the code, let me explain how the routing system works in regen-web.
>
> ### Architecture Overview
>
> regen-web uses Next.js with a file-based routing system. Each file in the `pages/` directory automatically becomes a route...
>
> ### Step-by-Step Guide
> [Detailed steps with explanations]
>
> ### Related Patterns You Should Know
> [Additional context about layouts, data fetching, testing]

### Senior Developer Asks the Same Question

**User:** Sarah (senior, full-stack)
**Query:** "How do I add a new page to regen-web?"

**AI Response (concise):**

> Create a file in `web-marketplace/src/pages/`:
>
> ```typescript
> const MyPage: NextPage = () => <div>Content</div>;
> export default MyPage;
> ```
>
> Reference: `pages/projects/index.tsx` for patterns.

---

## 6. Implementation Plan

| Phase | Description | Timeline |
|-------|-------------|----------|
| 1 | Backend profile endpoints | Week 1 |
| 2 | MCP `get_my_profile` tool | Week 1-2 |
| 3 | Profile context in responses | Week 2 |
| 4 | Admin tooling (Obsidian/CLI) | Week 3 |
| 5 | Testing & rollout | Week 3-4 |

---

## 7. Database Migration

```sql
-- Add index for user profile email lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_entity_registry_user_profile_email
ON entity_registry ((metadata->'user_profile'->>'email'))
WHERE entity_type = 'PERSON'
  AND metadata->'user_profile' IS NOT NULL;

-- View for quick profile lookups
CREATE OR REPLACE VIEW user_profiles AS
SELECT
    entity_text as name,
    metadata->'user_profile'->>'email' as email,
    metadata->'user_profile'->>'experience_level' as experience_level,
    metadata->'user_profile'->>'role' as role,
    metadata->'user_profile'->'preferences' as preferences,
    metadata->'user_profile'->'learning_areas' as learning_areas,
    metadata->'user_profile'->>'managed_by' as managed_by
FROM entity_registry
WHERE entity_type = 'PERSON'
  AND metadata->'user_profile' IS NOT NULL;
```

---

## Critical Files for Implementation

1. **koi-query-api.ts** - Add profile endpoints
2. **regen-koi-mcp/src/tools.ts** - Add `get_my_profile` tool
3. **regen-koi-mcp/src/index.ts** - Add handler and profile context injection
4. **Database migration** - Add email index
