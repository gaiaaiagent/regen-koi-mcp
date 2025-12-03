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

**"One Tool, Two Calls" Pattern** - No polling loop, uses file-based state persistence.

```
CALL 1: Request Device Code
┌─────────────────┐
│   MCP Client    │ 1. POST /api/koi/auth/device/code
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
│   MCP Client    │ 4. Save state to ~/.koi-auth.json
│                 │ 5. Auto-open browser (optional)
│                 │ 6. Display to user:
│                 │    🌐 Browser should open automatically
│                 │    [Open Activation Page](https://regen.gaiaai.xyz/activate)
│                 │    "Enter code: NWDV-FCFC"
│                 │    "Run tool again after completing auth"
│                 │
│ RETURNS         │                      ┌─────────────────┐
│ IMMEDIATELY     │                      │   User Browser  │
└─────────────────┘                      │                 │
                                         │ 7. User goes to │
                                         │    /activate    │
                                         │                 │
                                         │ 8. Types code   │
                                         │    NWDV-FCFC    │
                                         │                 │
                                         │ 9. Clicks       │
                                         │    "Continue"   │
                                         └────────┬────────┘
                                                  │
                                         ┌────────▼────────┐
                                         │   KOI Server    │
                                         │10. Validate     │
                                         │    user_code    │
                                         │11. Redirect to  │
                                         │    Google OAuth │
                                         │    (state_id)   │
                                         └────────┬────────┘
                                                  │
                                         ┌────────▼────────┐
                                         │  Google OAuth   │
                                         │12. User signs in│
                                         │  @regen.network │
                                         └────────┬────────┘
                                                  │
                                         ┌────────▼────────┐
                                         │   KOI Server    │
                                         │13. Validate JWT │
                                         │14. Verify email │
                                         │15. Gen session  │
                                         │16. Store HASH   │
                                         │17. Mark status= │
                                         │    authenticated│
                                         └─────────────────┘

CALL 2: Retrieve Session Token
┌─────────────────┐
│   MCP Client    │ 1. Load state from ~/.koi-auth.json
│  (Claude Code)  │ 2. POST /api/koi/auth/token (device_code)
└────────┬────────┘
         │
         ▼
┌─────────────────┐     18. Return session_token + email
│   KOI Server    │ ────────────────────────────────────▶
│                 │     (only to device_code holder)
└─────────────────┘     (returned ONCE, marked 'used')
         │
         ▼
┌─────────────────┐
│   MCP Client    │ 3. Save token + email to ~/.koi-auth.json
│                 │ 4. Cache in memory
│                 │ 5. Display: "✅ Authenticated as email@regen.network"
└─────────────────┘
```

## Security Features (December 2025)

### 1. Phishing Prevention with User Code

**The Problem (Fixed):**
Previously, an attacker could send a victim a link containing the attacker's `device_code`. When the victim clicked the link and authenticated, the attacker would receive the session token.

**The Solution (RFC 8628):**
- Server generates a short `user_code` (e.g., "NWDV-FCFC")
- User must **manually type** this code at the activation page
- User sees the code on their own device, significantly reducing link-based phishing
- Users can still be socially engineered if tricked into entering an attacker-supplied code
- Browser auto-opens to activation page (safe - URL is hardcoded on the client)

### 2. Entropy & Rate Limiting

**Vowel-Free Alphabet:**
- User codes use `BCDFGHJKMNPQRTVWXYZ2346789` (20 characters)
- Excludes vowels (A, E, U) to prevent accidental words
- Excludes confusables: S/5, L/1, O/0
- 8 characters = ~34.5 bits entropy (20^8 ≈ 2^34.5)
- Sufficient with rate limiting

**Rate Limiting:**
- `/activate` endpoint: 5 attempts per minute per IP
- `/api/koi/auth/token` endpoint: 60 requests per minute per IP
- Code lockout: 5 failed attempts per code → 10 minute lockout
- Locked-out codes always return generic "invalid code / expired" error (regardless of IP)
- Server enforces RFC 8628's `interval` by returning `slow_down` error when client exceeds rate
- In-memory sliding window rate limiter

### 3. Secrets in POST Body, Not URL

**The Problem (Fixed):**
GET requests with `device_code` in the URL could be logged by:
- Web server access logs
- Proxy servers
- Browser history

**The Solution:**
- `POST /api/koi/auth/device/code` - No secrets in request
- `POST /api/koi/auth/token` - device_code in request body
- `POST /activate` - user_code in form body

### 4. Opaque State ID

**The Problem (Fixed):**
The OAuth state parameter previously contained the `device_code`, exposing it to Google's servers.

**The Solution:**
- Generate separate `state_id` (opaque identifier)
- Only `state_id` is sent to Google
- `device_code` never leaves our infrastructure
- Lookup by `state_id` on callback

### 5. JWT Validation (Not Userinfo)

**The Solution:**
- Validate Google ID token (JWT) locally with Google's public keys
- Verify signature using RSA-256
- Check issuer (`iss`), audience (`aud`), expiry (`exp`)
- Verify `email_verified` claim is `true`
- **Enforce domain check**: Email must end with exactly `@regen.network`
- No network call to `/userinfo` endpoint after receiving token

**Domain Validation Example:**
```python
if not email.endswith("@regen.network"):
    raise ValueError("Unauthorized domain")
```

### 6. Token Hashing

- `session_tokens` table stores **ONLY hashes**, never plain tokens
- `auth_requests` table stores plain token temporarily (10 min max)
- After retrieval, plain token is immediately NULLed
- Database compromise reveals no usable tokens

### 7. Identity-Only Google OAuth

- Google tokens used ONLY to verify @regen.network email
- Tokens are NOT stored after identity verification
- Only our own session tokens are stored (and hashed)

### 8. Logging Rules

**What We Log:**
- Event types and timestamps
- RIDs and user codes (for debugging)
- IP addresses (for rate limiting)
- HTTP status codes

**What We NEVER Log:**
- `device_code` (secret)
- `access_token` / `session_token` (secrets)
- `id_token` / `refresh_token` from Google (secrets)
- Password fields (if any)

**Log Redaction:**
- All logging statements audited
- Sensitive fields explicitly excluded
- Server-side logs only (never client-side)

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
  "expires_in": 3600,
  "email": "darren@regen.network"
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

**"One Tool, Two Calls" Pattern** - No polling loop, uses file-based state persistence.

```typescript
// src/auth-store.ts - File-based state persistence
export interface AuthState {
  deviceCode?: string;
  userCode?: string;
  verificationUri?: string;
  deviceCodeExpiresAt?: number;  // Unix timestamp (ms)
  accessToken?: string;
  accessTokenExpiresAt?: number;
  userEmail?: string;
}

const AUTH_FILE = path.join(os.homedir(), '.koi-auth.json');

export function loadAuthState(): AuthState {
  if (fs.existsSync(AUTH_FILE)) {
    return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
  }
  return {};
}

export function saveAuthState(state: AuthState): void {
  fs.writeFileSync(AUTH_FILE, JSON.stringify(state, null, 2), {
    encoding: 'utf8',
    mode: 0o600  // Owner read/write only (important for shared machines)
  });
}

export function hasValidAccessToken(state: AuthState): boolean {
  return !!state.accessToken && !!state.accessTokenExpiresAt &&
         state.accessTokenExpiresAt > Date.now();
}

export function hasValidDeviceCode(state: AuthState): boolean {
  return !!state.deviceCode && !!state.deviceCodeExpiresAt &&
         state.deviceCodeExpiresAt > Date.now();
}

// src/index.ts - RFC 8628 Device Authorization Flow (One Tool, Two Calls)
private async authenticateUser() {
  const { loadAuthState, saveAuthState, hasValidAccessToken, hasValidDeviceCode } =
    await import('./auth-store.js');
  const state = loadAuthState();

  // Check 1: Already authenticated?
  if (hasValidAccessToken(state)) {
    return {
      content: [{
        type: 'text',
        text: `## Already Authenticated\n\nYou are authenticated as **${state.userEmail}**.\n\nSession valid until ${new Date(state.accessTokenExpiresAt!).toLocaleString()}.`
      }]
    };
  }

  // Check 2: Have pending device code? Check its status
  if (hasValidDeviceCode(state)) {
    const tokenResponse = await axios.post(`${API}/api/koi/auth/token`, {
      device_code: state.deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
    });

    if (tokenResponse.data.error === 'authorization_pending') {
      return {
        content: [{
          type: 'text',
          text: `## Authentication Pending\n\n**Still waiting for you to complete authentication.**\n\n1. Go to: https://regen.gaiaai.xyz/activate\n2. Enter code: **\`${state.userCode}\`**\n3. Sign in with your **@regen.network** email\n\n**After completing, run this tool again.**`
        }]
      };
    }

    if (tokenResponse.data.access_token) {
      // Success! Save token and email
      const tokenExpiry = Date.now() + (tokenResponse.data.expires_in * 1000);
      saveAuthState({
        accessToken: tokenResponse.data.access_token,
        accessTokenExpiresAt: tokenExpiry,
        userEmail: tokenResponse.data.email
      });
      return {
        content: [{
          type: 'text',
          text: `## ✅ Authentication Successful!\n\nYou now have access to internal Regen Network documentation.`
        }]
      };
    }

    // Handle other errors (expired_token, access_denied, invalid_grant, etc.)
    if (tokenResponse.data.error) {
      // Clear state and tell user to start over
      saveAuthState({});
      return {
        content: [{
          type: 'text',
          text: `## Authentication Failed\n\n**Error:** ${tokenResponse.data.error}\n\n${tokenResponse.data.error_description || 'Please run this tool again to start a new authentication flow.'}`
        }]
      };
    }
  }

  // Check 3: No state - start new auth flow
  const deviceCodeResponse = await axios.post(`${API}/api/koi/auth/device/code`, {});
  const { device_code, user_code, expires_in } = deviceCodeResponse.data;

  // Hardcode activation URL (don't trust server's verification_uri)
  const ACTIVATION_URL = 'https://regen.gaiaai.xyz/activate';

  // Save device code state
  saveAuthState({
    deviceCode: device_code,
    userCode: user_code,
    verificationUri: ACTIVATION_URL,
    deviceCodeExpiresAt: Date.now() + (expires_in * 1000)
  });

  // Auto-open browser
  try {
    const open = (await import('open')).default;
    await open(ACTIVATION_URL);
  } catch (err) {
    // Continue anyway - user can click the link
  }

  return {
    content: [{
      type: 'text',
      text: `## Authentication Required\n\n🌐 **Your browser should open automatically.** If not, click:\n\n### [Open Activation Page](${ACTIVATION_URL})\n\n### Enter this code:\n\n\`\`\`\n${user_code}\n\`\`\`\n\n### Sign in with Google\n\nUse your **@regen.network** email.\n\n**After completing authentication, run this tool again to retrieve your session token.**`
    }]
  };
}
```

## Threat Model

| Threat | Mitigation |
|--------|------------|
| Phishing attack (malicious link) | User must manually type code from their own device; significantly reduces link-based phishing |
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
- `regen-koi-mcp/src/index.ts` - MCP client authentication flow (One Tool, Two Calls)
- `regen-koi-mcp/src/auth-store.ts` - File-based state persistence (~/.koi-auth.json)
- `regen-koi-mcp/.gitignore` - Excludes .koi-auth.json from version control

## Legacy Endpoints (Deprecated)

The following endpoints are kept for backwards compatibility but will be removed:

- `GET /api/koi/auth/initiate` - Use `POST /auth/device/code` instead
- `GET /api/koi/auth/status` - Use `POST /auth/token` instead
