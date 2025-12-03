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

## Authentication Flow (RFC 8628 Device Authorization Grant)

This implementation follows [RFC 8628](https://datatracker.ietf.org/doc/html/rfc8628) to prevent phishing attacks.

```
┌─────────────────┐
│   MCP Client    │ 1. POST /auth/device/code
│  (Claude Code)  │    (no parameters needed)
└────────┬────────┘
         │
         ▼
┌─────────────────┐      2. Generate &       ┌─────────────────┐
│   KOI Server    │ ────────────────────────▶│  auth_requests  │
│                 │      store codes         │  device_code    │
│                 │                          │  user_code      │
│                 │                          │  state_id       │
└────────┬────────┘                          └─────────────────┘
         │
         │ 3. Return: device_code, user_code, verification_uri
         ▼
┌─────────────────┐
│   MCP Client    │ 4. Display to user:
│                 │    "Go to https://regen.gaiaai.xyz/activate"
│                 │    "Enter code: WDJB-QK4Z"
│                 │
│ 5. Start polling│                      ┌─────────────────┐
│    POST /auth/  │                      │   User Browser  │
│    token        │                      │                 │
│    (loop)       │                      │ 6. User goes to │
│         │       │                      │    /activate    │
│         │       │                      │                 │
│         │       │                      │ 7. Types code   │
│         │       │                      │    WDJB-QK4Z    │
│         │       │                      │                 │
│         │       │                      │ 8. Clicks       │
│         │       │                      │    "Continue"   │
│         │       │                      └────────┬────────┘
│         │       │                               │
│         │       │                      ┌────────▼────────┐
│         │       │                      │   KOI Server    │
│         │       │                      │ 9. Validate     │
│         │       │                      │    user_code    │
│         │       │                      │10. Redirect to  │
│         │       │                      │    Google OAuth │
│         │       │                      │    (state_id)   │
│         │       │                      └────────┬────────┘
│         │       │                               │
│         │       │                      ┌────────▼────────┐
│         │       │                      │  Google OAuth   │
│         │       │                      │11. User signs in│
│         │       │                      │    @regen.net   │
│         │       │                      └────────┬────────┘
│         │       │                               │
│         │       │                      ┌────────▼────────┐
│         │       │                      │   KOI Server    │
│         │       │                      │12. Verify email │
│         │       │                      │13. Gen session  │
│         │       │                      │14. Store HASH   │
│         │       │                      │15. Mark status= │
│         │       │                      │    authenticated│
│         │       │                      └────────┬────────┘
│         │       │                               │
│         ▼       │     16. Return session_token  │
│ ◄───────────────┼───────────────────────────────┘
│ (returned ONCE, │     (only to device_code holder)
│  marked 'used') │
│                 │
│ Stores token    │
└─────────────────┘
```

## Security Features (December 2025)

### 1. Phishing Prevention with User Code

**The Problem (Fixed):**
Previously, an attacker could send a victim a link containing the attacker's `device_code`. When the victim clicked the link and authenticated, the attacker would receive the session token.

**The Solution (RFC 8628):**
- Server generates a short `user_code` (e.g., "WDJB-QK4Z")
- User must **manually type** this code at the activation page
- Attacker cannot force victim to type an unknown code
- User sees the code on their own device, preventing impersonation

### 2. Secrets in POST Body, Not URL

**The Problem (Fixed):**
GET requests with `device_code` in the URL could be logged by:
- Web server access logs
- Proxy servers
- Browser history

**The Solution:**
- `POST /auth/device/code` - No secrets in request
- `POST /auth/token` - device_code in request body
- `POST /activate` - user_code in form body

### 3. Opaque State ID

**The Problem (Fixed):**
The OAuth state parameter previously contained the `device_code`, exposing it to Google's servers.

**The Solution:**
- Generate separate `state_id` (opaque identifier)
- Only `state_id` is sent to Google
- `device_code` never leaves our infrastructure
- Lookup by `state_id` on callback

### 4. Token Hashing

- `session_tokens` table stores **ONLY hashes**, never plain tokens
- `auth_requests` table stores plain token temporarily (10 min max)
- After retrieval, plain token is immediately NULLed
- Database compromise reveals no usable tokens

### 5. Identity-Only Google OAuth

- Google tokens used ONLY to verify @regen.network email
- Tokens are NOT stored after identity verification
- Only our own session tokens are stored (and hashed)

## API Endpoints

### POST /api/koi/auth/device/code
Request a new device code (RFC 8628 Device Authorization Request).

```bash
curl -X POST https://regen.gaiaai.xyz/api/koi/auth/device/code \
  -H "Content-Type: application/json" \
  -d '{}'
```

Response:
```json
{
  "device_code": "059ac1405309f877e3c218dca66354513a40885fbef1eff7fffc187bce3a8cd8",
  "user_code": "V3RY-URN7",
  "verification_uri": "https://regen.gaiaai.xyz/activate",
  "expires_in": 600,
  "interval": 5
}
```

### POST /api/koi/auth/token
Poll for session token (RFC 8628 Device Access Token Request).

```bash
curl -X POST https://regen.gaiaai.xyz/api/koi/auth/token \
  -H "Content-Type: application/json" \
  -d '{"device_code": "059ac140...", "grant_type": "urn:ietf:params:oauth:grant-type:device_code"}'
```

Response (pending):
```json
{
  "error": "authorization_pending",
  "error_description": "User has not yet completed authorization"
}
```

Response (success - returned ONCE):
```json
{
  "access_token": "fb93a489-c1f5-4a00-9bf2-...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

Response (already retrieved):
```json
{
  "error": "invalid_grant",
  "error_description": "Token has already been retrieved"
}
```

### GET /activate
User-facing HTML page for entering the device code.

### POST /activate
Validates user_code and redirects to Google OAuth.

## Database Schema

### auth_requests
```sql
CREATE TABLE auth_requests (
    id SERIAL PRIMARY KEY,
    device_code VARCHAR(64) NOT NULL UNIQUE,  -- Secret: MCP client keeps this
    user_code VARCHAR(12),                     -- Public: User types this (e.g., "WDJB-QK4Z")
    state_id VARCHAR(64),                      -- Opaque ID sent to Google (not device_code!)
    user_email VARCHAR(255),                   -- Set after OAuth callback
    status VARCHAR(20) DEFAULT 'pending',      -- pending, authorizing, authenticated, used, rejected
    session_token VARCHAR(64),                 -- Plain token (temporary, NULLed after retrieval)
    session_token_hash VARCHAR(64),            -- SHA-256 hash (for linking to session_tokens)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '10 minutes',
    authenticated_at TIMESTAMP WITH TIME ZONE,
    used_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_auth_requests_user_code ON auth_requests(user_code);
CREATE INDEX idx_auth_requests_state_id ON auth_requests(state_id);
```

### session_tokens
```sql
CREATE TABLE session_tokens (
    id SERIAL PRIMARY KEY,
    token_hash VARCHAR(64) NOT NULL,           -- SHA-256 hash ONLY
    user_email VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    client_info TEXT
);

CREATE INDEX idx_session_tokens_hash ON session_tokens(token_hash);
```

## MCP Client Implementation

```typescript
// src/index.ts - RFC 8628 Device Authorization Flow
private async authenticateUser() {
  // Step 1: Request device code from server
  const response = await axios.post(`${API}/auth/device/code`, {});
  const { device_code, user_code, verification_uri, interval } = response.data;

  // Step 2: Display instructions (DO NOT auto-open browser - prevents phishing)
  console.log(`Go to: ${verification_uri}`);
  console.log(`Enter code: ${user_code}`);

  // Step 3: Poll for completion
  while (true) {
    await sleep(interval * 1000);

    const tokenResponse = await axios.post(`${API}/auth/token`, {
      device_code,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
    });

    if (tokenResponse.data.access_token) {
      return tokenResponse.data.access_token;
    }

    if (tokenResponse.data.error !== 'authorization_pending') {
      throw new Error(tokenResponse.data.error_description);
    }
  }
}
```

## Threat Model

| Threat | Mitigation |
|--------|------------|
| Phishing attack (malicious link) | User must manually type code displayed on their device |
| device_code in logs | POST requests keep secrets in body |
| device_code exposed to Google | Opaque state_id used instead |
| Database compromise | Tokens stored as SHA-256 hashes |
| Token in Claude history | Session tokens only work with our API |
| Token intercepted in transit | HTTPS encryption |
| Token stolen from memory | 1-hour expiry, revocable |
| Unauthorized user | Must complete OAuth with @regen.network email |
| Replay attack | Token marked as 'used' after first retrieval |

## Usage in Claude Code

1. **Authenticate** (once per session or when token expires):
   ```
   Use the regen_koi_authenticate tool
   ```

2. **Follow the instructions**:
   - Go to https://regen.gaiaai.xyz/activate
   - Enter the code displayed (e.g., WDJB-QK4Z)
   - Sign in with your @regen.network Google account

3. **Query private data** (automatic after auth):
   ```
   Search for internal meeting notes
   What AI strategy documents exist in the Regen workspace?
   ```

## Revoking Sessions

To revoke all sessions for a user:

```sql
UPDATE session_tokens
SET revoked_at = NOW()
WHERE user_email = 'user@regen.network';
```

## Related Files

- `koi-processor/src/services/auth_service.py` - Server-side RFC 8628 implementation
- `koi-processor/migrations/019_rfc8628_user_code_flow.sql` - user_code and state_id columns
- `regen-koi-mcp/src/index.ts` - MCP client authentication flow
- `regen-koi-mcp/src/auth.ts` - Client-side token storage

## Legacy Endpoints (Deprecated)

The following endpoints are kept for backwards compatibility but will be removed:

- `GET /api/koi/auth/initiate` - Use `POST /auth/device/code` instead
- `GET /api/koi/auth/status` - Use `POST /auth/token` instead
