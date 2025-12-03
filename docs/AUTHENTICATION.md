# Authentication & Security

This document explains the authentication system for accessing private data in the KOI MCP server, and the security design decisions behind it.

## Overview

The KOI system has two tiers of data access:

1. **Public Data** - Available without authentication
   - GitHub documentation
   - Forum posts (Discourse)
   - Medium articles
   - Podcast transcripts
   - Regentokenomics Notion workspace

2. **Private Data** - Requires authentication with @regen.network email
   - Main Regen Notion workspace (strategy docs, meeting notes, internal specs)

## Authentication Flow

```
┌─────────────────┐                           ┌─────────────────┐
│   User Browser  │ ──── Google OAuth ─────── │  Google OAuth   │
└─────────────────┘                           └─────────────────┘
                                                      │
                                                      │ access_token
                                                      │ (ya29.xxx)
                                                      ▼
┌─────────────────┐                           ┌─────────────────┐
│   MCP Client    │ ◄── session_token ─────── │   KOI Server    │
│  (Claude Code)  │     (UUID format)         │                 │
│                 │                           │ ┌─────────────┐ │
│ Stores:         │                           │ │oauth_tokens │ │
│ fb93a489-c1f5.. │                           │ │(Google tok) │ │
│                 │                           │ └─────────────┘ │
│ NOT:            │                           │ ┌─────────────┐ │
│ ya29.a0ATi6K... │                           │ │session_tkns │ │
└─────────────────┘                           │ │(UUID→email) │ │
        │                                     │ └─────────────┘ │
        │ Authorization: Bearer <session_tok> └─────────────────┘
        │                                             │
        └─────────────────────────────────────────────┘
                    API calls with session token
```

## Why Session Tokens?

### The Problem

Initially, the system passed Google OAuth access tokens (`ya29.xxx`) to MCP clients. This created a security concern:

1. **Claude Code stores session history** in `~/.claude/projects/.../*.jsonl`
2. **OAuth tokens were visible** in these history files
3. **Risk if history accessed**: Though scoped to our app, leaked tokens could:
   - Read basic Google profile info (email, name)
   - Access private KOI data until expiry

### The Solution: Session Tokens

We implemented our own session tokens that:

| Property | Google OAuth Token | Session Token |
|----------|-------------------|---------------|
| Format | `ya29.a0ATi6K2so0f...` | `fb93a489-c1f5-4a00-9bf2-...` |
| Can access Google APIs | Yes | **No** |
| Can access other OAuth apps | No | **No** |
| Can access KOI private data | Yes | Yes |
| Safe if leaked | Moderate risk | **Minimal risk** |
| Revocable | No | **Yes** |
| Lifetime | ~1 hour | 1 hour |

**Key insight**: Session tokens only work with our API. Even if someone obtains a session token from Claude history, they cannot:
- Access any Google services
- Impersonate the user elsewhere
- Do anything except query KOI (which requires @regen.network email anyway)

## Database Schema

### oauth_tokens (Google tokens - server only)
```sql
CREATE TABLE oauth_tokens (
    id SERIAL PRIMARY KEY,
    user_email VARCHAR(255) NOT NULL UNIQUE,
    access_token TEXT NOT NULL,      -- Google OAuth token (never sent to client)
    refresh_token TEXT,
    token_expiry TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### session_tokens (Safe for clients)
```sql
CREATE TABLE session_tokens (
    id SERIAL PRIMARY KEY,
    session_token VARCHAR(64) NOT NULL UNIQUE,  -- UUID, safe to expose
    user_email VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    client_info TEXT
);
```

## API Endpoints

### POST /api/koi/auth/initiate
Start OAuth flow. Returns URL for user to authenticate.

```bash
curl 'https://regen.gaiaai.xyz/api/koi/auth/initiate?user_email=user@regen.network'
```

Response:
```json
{
  "auth_url": "https://accounts.google.com/o/oauth2/v2/auth?...",
  "state": "abc123"
}
```

### GET /api/koi/auth/status
Check auth status or get session token.

**Get new session token (after OAuth):**
```bash
curl 'https://regen.gaiaai.xyz/api/koi/auth/status?user_email=user@regen.network'
```

Response:
```json
{
  "authenticated": true,
  "user_email": "user@regen.network",
  "session_token": "fb93a489-c1f5-4a00-9bf2-...",
  "token_expiry": "2025-12-03T05:33:07.606Z"
}
```

**Validate existing session token:**
```bash
curl -H 'Authorization: Bearer <session_token>' \
  'https://regen.gaiaai.xyz/api/koi/auth/status'
```

## MCP Client Implementation

The MCP server (regen-koi-mcp) handles authentication:

```typescript
// src/auth.ts - Session token storage
export function getSessionToken(): string | null {
  // Returns stored session token if not expired
}

export function setSessionToken(token: string, expiresAt?: number): void {
  // Stores session token in memory (safe - not a Google token)
}

// src/index.ts - API calls include session token
apiClient.interceptors.request.use((config) => {
  const token = getAccessToken();  // Actually getSessionToken via alias
  if (token && config.headers) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});
```

## Security Considerations

### What's Protected
- Google OAuth tokens never leave the server
- Session tokens are short-lived (1 hour)
- Session tokens can be revoked server-side
- Only @regen.network emails can authenticate

### What's NOT Protected
- Session tokens appear in Claude session history (but this is acceptable - they're just UUIDs)
- Anyone with a valid session token can access private KOI data (but tokens expire quickly)

### Threat Model

| Threat | Mitigation |
|--------|------------|
| Token in Claude history | Session tokens can't access Google or other services |
| Token intercepted in transit | HTTPS encryption |
| Token stolen from memory | 1-hour expiry, revocable |
| Unauthorized user | Must complete OAuth with @regen.network email |

## Usage in Claude Code

1. **Authenticate** (once per session or when token expires):
   ```
   Use the regen_koi_authenticate tool
   ```

2. **Query private data** (automatic after auth):
   ```
   Search for internal meeting notes
   What AI strategy documents exist in the Regen workspace?
   ```

3. **Session token stored in memory** - survives for the Claude Code session
4. **Re-authenticate if needed** - tokens expire after 1 hour

## Revoking Sessions

To revoke all sessions for a user (e.g., if compromised):

```sql
UPDATE session_tokens
SET revoked_at = NOW()
WHERE user_email = 'user@regen.network';
```

To clean up expired tokens:

```sql
DELETE FROM session_tokens
WHERE expires_at < NOW() OR revoked_at IS NOT NULL;
```

## Related Files

- `koi-processor/koi-query-api.ts` - Server-side token generation/validation
- `koi-processor/migrations/016_add_session_tokens.sql` - Database schema
- `regen-koi-mcp/src/auth.ts` - Client-side token storage
- `regen-koi-mcp/src/index.ts` - OAuth flow and API calls
