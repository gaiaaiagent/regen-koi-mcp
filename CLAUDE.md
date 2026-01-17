# CLAUDE.md - Regen KOI MCP Server

This file provides guidance to Claude Code when working on the regen-koi-mcp project.

## Project Overview

The Regen KOI MCP Server provides AI agents (like Claude) access to Regen Network's Knowledge Organization Infrastructure via the Model Context Protocol. It serves as an interface layer for searching code, documentation, and community discussions.

## Current System State (Jan 13, 2026)

- **11 MCP Tools**: Search, graph queries, weekly digests, auth, metrics, feedback
- **48,000+ Documents**: From GitHub, Discourse, Medium, Telegram, Discord, podcasts, Notion
- **26,768 Code Entities**: Functions, structs, interfaces from 5 repositories
- **Private Data Access**: OAuth-gated access to internal Regen Notion workspace

### Privacy & Authentication

The system has two tiers of data access:

1. **Public Data**: Available to all users
   - GitHub documentation
   - Forum posts (Discourse)
   - Medium articles
   - Telegram/Discord messages
   - Podcast transcripts
   - Regentokenomics Notion workspace

2. **Private Data**: Requires OAuth with @regen.network email
   - Main Regen Notion workspace (strategy docs, AI specs, partner analyses)
   - Use `regen_koi_authenticate` tool to authenticate

### Sample Prompts for Private Data

After authenticating with `regen_koi_authenticate`, try:

```
"What are the current AI strategy documents in the Regen workspace?"
"Find internal documentation about partner onboarding processes"
"Search for KOI implementation notes and specifications"
"What's in the PRP Regen Network Series Episodes database?"
```

## Key Files

### MCP Server
- `src/index.ts` - Main MCP server with tools and auth caching
- `src/graph_tool.ts` - Code graph query tool
- `src/tools.ts` - Tool definitions
- `src/validation.ts` - Input validation
- `src/cache.ts` - Query caching

### Configuration
- `.env` - Environment variables (KOI_API_ENDPOINT, etc.)
- `package.json` - Dependencies and scripts

### Documentation
- `docs/README.md` - Main documentation index
- `docs/USER_GUIDE.md` - Installation and usage
- `docs/API_REFERENCE.md` - Complete API documentation
- `docs/DEPLOYMENT.md` - Production deployment guide
- `docs/AUTHENTICATION.md` - Security design and session tokens

## Development

### Build & Test
```bash
npm install
npm run build
npm test
```

### Running Locally
```bash
npm start
# Or for development with auto-reload:
npm run dev
```

### Environment Variables
```bash
KOI_API_ENDPOINT=https://regen.gaiaai.xyz/api/koi
KOI_API_KEY=optional-api-key
REGEN_USER_EMAIL=your@regen.network  # For auth

# Tool filtering (for custom/personal deployments)
KOI_DISABLED_TOOLS=regen_koi_authenticate,tool2  # Blacklist mode
KOI_ENABLED_TOOLS=search,get_stats,query_code_graph  # Whitelist mode (takes precedence)
```

### Tool Filtering

The server supports filtering which tools are exposed, useful for personal deployments:

- **Blacklist mode**: Set `KOI_DISABLED_TOOLS` to comma-separated tool names to disable
- **Whitelist mode**: Set `KOI_ENABLED_TOOLS` to comma-separated tool names (only these enabled)
- Whitelist takes precedence if both are set
- Example: Personal KOI without auth: `KOI_DISABLED_TOOLS=regen_koi_authenticate`

## Architecture

```
┌─────────────────────────────────────────┐
│  Claude Code (MCP Client)               │
└─────────────┬───────────────────────────┘
              │ stdio
              ▼
┌─────────────────────────────────────────┐
│  KOI MCP Server (index.ts)              │
│  - 10 tools                             │
│  - Session token storage (src/auth.ts)  │
│  - Authorization: Bearer <session_tok>  │
└─────────────┬───────────────────────────┘
              │ HTTPS API
              ▼
┌─────────────────────────────────────────┐
│  KOI Query API (Bun)                    │
│  - Privacy filtering based on auth      │
│  - Session token validation             │
│  - Hybrid RAG (vector + keyword)        │
└─────────────┬───────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│  PostgreSQL + Apache AGE                │
│  - koi_memories (48K+ docs)             │
│  - is_private column for access control │
│  - session_tokens (UUID → user mapping) │
│  - oauth_tokens (Google tokens - safe)  │
└─────────────────────────────────────────┘
```

**Security Note**: Google OAuth tokens never leave the server. MCP clients only receive
session tokens (UUIDs) which are safe to store. See `docs/AUTHENTICATION.md` for details.

## Common Tasks

### Adding a New Tool
1. Define tool schema in `src/tools.ts`
2. Implement handler in `src/index.ts`
3. Add validation schema in `src/validation.ts`
4. Update documentation

### Testing Authentication
```bash
# Get a session token (after OAuth completed)
curl 'https://regen.gaiaai.xyz/api/koi/auth/status?user_email=user@regen.network'
# Returns: {"session_token": "fb93a489-c1f5-...", ...}

# Query with session token (private data accessible)
SESSION_TOKEN="fb93a489-c1f5-..."
curl -X POST 'https://regen.gaiaai.xyz/api/koi/query' \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $SESSION_TOKEN" \
  -d '{"question": "internal meeting notes", "limit": 5}'

# Query without token (public data only)
curl -X POST 'https://regen.gaiaai.xyz/api/koi/query' \
  -H 'Content-Type: application/json' \
  -d '{"question": "internal meeting notes", "limit": 5}'
```

See `docs/AUTHENTICATION.md` for full security documentation.

### Deploying Changes
1. Build locally: `npm run build`
2. Test: `npm test`
3. Push to GitHub
4. On server: Pull changes and restart MCP service

## Related Projects

- **koi-sensors**: Data ingestion sensors (Notion, Discourse, etc.)
- **koi-processor**: Query API and data processing
- **regen-ledger**: Regen blockchain source code (indexed in graph)

## Support

- See `docs/USER_GUIDE.md` for troubleshooting
- Server: 202.61.196.119 (ssh darren@...)
- Logs: Check `~/.claude/logs/` for MCP logs
