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

## Authentication Flow (Secure Device Code Binding)

```
┌─────────────────┐                           ┌─────────────────┐
│   MCP Client    │ ─── 1. Generate ──────────│  device_code    │
│  (Claude Code)  │     device_code           │  (64 char hex)  │
└─────────────────┘                           └─────────────────┘
        │                                             │
        │ 2. /auth/initiate?device_code=xxx&user_email=yyy
        ▼                                             │
┌─────────────────┐                           ┌─────────────────┐
│   KOI Server    │ ─── 3. Store in ──────────│  auth_requests  │
│                 │     database              │  (device_code   │
│                 │                           │   + status)     │
└─────────────────┘                           └─────────────────┘
        │
        │ 4. Return auth_url with device_code in state
        ▼
┌─────────────────┐                           ┌─────────────────┐
│   User Browser  │ ──── 5. Google OAuth ────▶│  Google OAuth   │
│                 │                           │                 │
└─────────────────┘                           └─────────────────┘
                                                      │
                                                      │ 6. access_token
                                                      │    (ya29.xxx)
                                                      ▼
                                              ┌─────────────────┐
                                              │   KOI Server    │
                                              │ 7. Verify email │
                                              │    @regen.net   │
                                              │ 8. Generate     │
                                              │    session_tok  │
                                              │ 9. Store HASH   │
                                              └─────────────────┘
        │                                             │
        │ 10. Poll /auth/status?device_code=xxx       │
        │     (ONLY device_code holder can retrieve)  │
        ▼                                             │
┌─────────────────┐                           ┌─────────────────┐
│   MCP Client    │ ◄── 11. session_token ────│   Response      │
│                 │     (returned ONCE,       │   (marks auth   │
│ Stores:         │      marked as 'used')    │   as 'used')    │
│ fb93a489-c1f5.. │                           │                 │
└─────────────────┘                           └─────────────────┘
```

## Security Improvements (December 2025)

### 1. IDOR Prevention with Device Code Binding

**The Problem (Fixed):**
Previously, the `/auth/status?user_email=xxx` endpoint allowed anyone to poll with any known @regen.network email. An attacker could:
1. Know a legitimate user's email (easily discoverable)
2. Poll `/auth/status?user_email=victim@regen.network`
3. Steal the session token when the victim authenticated

**The Solution:**
We now use a device code binding pattern (similar to OAuth 2.0 Device Authorization Grant, RFC 8628):

1. MCP client generates a cryptographically random `device_code` (64 hex chars)
2. Client sends `device_code` + `user_email` to `/auth/initiate`
3. Server stores the binding in `auth_requests` table
4. `device_code` is embedded in OAuth state parameter
5. After OAuth, only the client with the original `device_code` can retrieve the session token
6. Session token is returned ONCE and marked as 'used'

### 2. Token Hashing

**The Problem (Fixed):**
Session tokens were stored in plain text in the database. If the database was compromised:
- All session tokens would be exposed
- Attackers could impersonate any authenticated user

**The Solution:**
- Session tokens are now SHA-256 hashed before storage
- Plain token is sent to client ONCE during retrieval
- Validation compares hashes, never exposes stored tokens
- Even database compromise doesn't reveal usable tokens

### 3. Identity-Only Google OAuth

**The Problem (Fixed):**
Google OAuth tokens were being stored long-term, even though they're only needed for identity verification.

**The Solution:**
- Google tokens are used ONLY to verify the user's email is @regen.network
- Tokens are NOT stored after identity verification
- Only our own session tokens are stored (and hashed)

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
| Stored in DB | Never | **Hash only** |
| Lifetime | ~1 hour | 1 hour |

## Database Schema

### auth_requests (Device code binding)
```sql
CREATE TABLE auth_requests (
    id SERIAL PRIMARY KEY,
    device_code VARCHAR(64) NOT NULL UNIQUE,  -- MCP client's binding code
    user_email VARCHAR(255),                   -- Set after OAuth callback
    status VARCHAR(20) DEFAULT 'pending',      -- pending, authenticated, used, rejected, expired
    session_token_hash VARCHAR(64),            -- SHA-256 hash of session token
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '10 minutes',
    authenticated_at TIMESTAMP WITH TIME ZONE,
    used_at TIMESTAMP WITH TIME ZONE
);
```

### session_tokens (Safe for clients - hashed storage)
```sql
CREATE TABLE session_tokens (
    id SERIAL PRIMARY KEY,
    session_token VARCHAR(64) NOT NULL,        -- Plain token (for one-time retrieval)
    token_hash VARCHAR(64) NOT NULL,           -- SHA-256 hash (for validation)
    user_email VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    client_info TEXT
);

CREATE INDEX idx_session_tokens_hash ON session_tokens(token_hash);
```

## API Endpoints

### GET /api/koi/auth/initiate
Start OAuth flow with device code binding.

```bash
# Generate device_code client-side (64 hex chars)
DEVICE_CODE=$(openssl rand -hex 32)

curl "https://regen.gaiaai.xyz/api/koi/auth/initiate?user_email=user@regen.network&device_code=$DEVICE_CODE"
```

Response:
```json
{
  "auth_url": "https://accounts.google.com/o/oauth2/v2/auth?...&state=<device_code>:<email>",
  "state": "<device_code>:<email>"
}
```

### GET /api/koi/auth/status
Poll auth status using device_code (SECURE - prevents IDOR).

**Poll with device_code (recommended):**
```bash
curl "https://regen.gaiaai.xyz/api/koi/auth/status?device_code=$DEVICE_CODE"
```

Response (when authenticated - token returned ONCE):
```json
{
  "status": "authenticated",
  "authenticated": true,
  "user_email": "user@regen.network",
  "session_token": "fb93a489-c1f5-4a00-9bf2-...",
  "token_expiry": "2025-12-03T05:33:07.606Z"
}
```

Response (if polled again - token NOT returned):
```json
{
  "status": "already_retrieved",
  "authenticated": true,
  "user_email": "user@regen.network",
  "reason": "Session token was already retrieved. Use the token you received earlier."
}
```

**Validate existing session token:**
```bash
curl -H 'Authorization: Bearer <session_token>' \
  'https://regen.gaiaai.xyz/api/koi/auth/status'
```

## MCP Client Implementation

The MCP server (regen-koi-mcp) handles authentication with device code binding:

```typescript
// src/index.ts - Device code generation
private generateDeviceCode(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Authentication with device code binding
private async authenticateUser() {
  const deviceCode = this.generateDeviceCode();  // 64 hex chars

  // Call initiate with device_code
  const response = await axios.get(`${API}/auth/initiate`, {
    params: { user_email: userEmail, device_code: deviceCode }
  });

  // Open browser for OAuth
  await open(response.data.auth_url);

  // Poll using device_code (SECURE - only we know it)
  const pollUrl = `${API}/auth/status?device_code=${deviceCode}`;
  // ... poll until authenticated or timeout
}
```

## Security Considerations

### What's Protected
- Google OAuth tokens never leave the server
- Session tokens are stored as SHA-256 hashes
- Device code binding prevents IDOR attacks
- Session tokens can only be retrieved ONCE
- Session tokens are short-lived (1 hour)
- Session tokens can be revoked server-side
- Only @regen.network emails can authenticate

### What's NOT Protected
- Session tokens appear in Claude session history (but this is acceptable - they're just UUIDs that only work with our API)
- Anyone with a valid session token can access private KOI data (but tokens expire quickly and can be revoked)

### Threat Model

| Threat | Mitigation |
|--------|------------|
| IDOR attack on /auth/status | Device code binding - only initiator can retrieve |
| Database compromise | Tokens stored as SHA-256 hashes |
| Token in Claude history | Session tokens can't access Google or other services |
| Token intercepted in transit | HTTPS encryption |
| Token stolen from memory | 1-hour expiry, revocable |
| Unauthorized user | Must complete OAuth with @regen.network email |
| Replay attack | Token marked as 'used' after first retrieval |

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

To clean up expired tokens and auth requests:

```sql
DELETE FROM session_tokens
WHERE expires_at < NOW() OR revoked_at IS NOT NULL;

DELETE FROM auth_requests
WHERE expires_at < NOW() OR status IN ('used', 'rejected', 'expired');
```

## Related Files

- `koi-processor/src/services/auth_service.py` - Server-side auth endpoints
- `koi-processor/koi-query-api.ts` - Token validation and API endpoints
- `koi-processor/migrations/016_add_session_tokens.sql` - Original schema
- `koi-processor/migrations/017_secure_auth_flow.sql` - Security improvements
- `regen-koi-mcp/src/auth.ts` - Client-side token storage
- `regen-koi-mcp/src/index.ts` - OAuth flow with device code binding
