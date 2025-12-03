# CLAUDE.md - Regen KOI MCP Server

This file provides guidance to Claude Code when working on the regen-koi-mcp project.

## Project Overview

The Regen KOI MCP Server provides AI agents (like Claude) access to Regen Network's Knowledge Organization Infrastructure via the Model Context Protocol. It serves as an interface layer for searching code, documentation, and community discussions.

## Current System State (Dec 3, 2025)

- **10 MCP Tools**: Search, graph queries, weekly digests, auth, metrics
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
```

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
│  - Auth caching (5 min TTL)             │
│  - X-User-Email header on all calls     │
└─────────────┬───────────────────────────┘
              │ HTTP API
              ▼
┌─────────────────────────────────────────┐
│  KOI Query API (Bun)                    │
│  - Privacy filtering based on auth      │
│  - Hybrid RAG (vector + keyword)        │
└─────────────┬───────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│  PostgreSQL + Apache AGE                │
│  - koi_memories (48K+ docs)             │
│  - is_private column for access control │
│  - oauth_tokens for auth validation     │
└─────────────────────────────────────────┘
```

## Common Tasks

### Adding a New Tool
1. Define tool schema in `src/tools.ts`
2. Implement handler in `src/index.ts`
3. Add validation schema in `src/validation.ts`
4. Update documentation

### Testing Authentication
```bash
# Check auth status
curl 'https://regen.gaiaai.xyz/api/koi/auth/status?user_email=test@regen.network'

# Query with auth header
curl -X POST 'https://regen.gaiaai.xyz/api/koi/query' \
  -H 'Content-Type: application/json' \
  -H 'X-User-Email: authenticated@regen.network' \
  -d '{"question": "internal docs", "limit": 5}'
```

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
