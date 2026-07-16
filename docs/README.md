# Regen KOI MCP Server - Documentation

**Status:** Production Ready ✅
**Version:** Phase 8 - Private Data Access (2025-12-03)
**Server:** 202.61.196.119

---

## Overview

The Regen KOI (Knowledge Organization Infrastructure) MCP Server is a production-ready Model Context Protocol server that provides Claude with intelligent search and navigation across all Regen Network knowledge—code, documentation, community discussions, and more.

**KOI** is a distributed knowledge management system developed collaboratively by BlockScience, Metagov, and RMIT. This MCP server provides the interface layer for AI agents to access the full KOI knowledge graph.

### Key Features

- **10 MCP Tools** - Semantic search, graph queries, GitHub docs, weekly digests, auth, metrics
- **48,079+ Documents** - From GitHub, Discourse, Medium, Telegram, Discord, podcasts, websites
- **26,768 Code Entities** - Functions, structs, interfaces extracted via tree-sitter AST parsing
- **12 Active Sensors** - Real-time ingestion from diverse platforms
- **Hybrid Search** - Vector similarity + knowledge graph + keyword matching with RRF fusion
- **Production Hardening** - Retry logic, circuit breakers, caching, validation, metrics
- **Private Data Access** - OAuth-gated access to internal Regen Notion workspace (Phase 8)

---

## Architecture

```
┌─────────────────────────────────────────────┐
│  Claude Code (MCP Client)                   │
└─────────────┬───────────────────────────────┘
              │ stdio
              ▼
┌─────────────────────────────────────────────┐
│  KOI MCP Server (index.ts)                  │
│  - 9 tools                                  │
│  - Retry, circuit breaker, cache            │
│  - Validation, metrics, logging             │
└─────────────┬───────────────────────────────┘
              │ HTTP API
              ▼
┌─────────────────────────────────────────────┐
│  KOI Query API (Bun)                        │
│  - Hybrid RAG (vector + graph + keyword)    │
│  - RRF fusion                               │
└─────────────┬───────────────────────────────┘
              │ Cypher queries
              ▼
┌─────────────────────────────────────────────┐
│  PostgreSQL + Apache AGE                    │
│  - regen_graph_v2 (26,768 entities)         │
│  - 11,331 CALLS edges                       │
│  - 10 concepts with EXPLAINS edges          │
└─────────────────────────────────────────────┘
```

---

## MCP Tools

### Search & Discovery
1. **query_code_graph** - Graph-based code queries (Cypher)
2. **hybrid_search** - Intelligent routing between vector and graph search
3. **search_knowledge** - Hybrid RAG with date filtering
4. **search_github_docs** - Search documentation across 4 repositories

### Repository Information
5. **get_repo_overview** - Repository structure and key files
6. **get_tech_stack** - Technology stack breakdown
7. **get_stats** - Knowledge base statistics

### Utilities
8. **generate_weekly_digest** - Weekly activity summaries
9. **get_mcp_metrics** - Production metrics (latency, cache, errors)

### Authentication
10. **regen_koi_authenticate** - OAuth login with @regen.network email for private data access

See [API_REFERENCE.md](API_REFERENCE.md) for detailed documentation.

---

## Private Data Access (Phase 8)

KOI supports two tiers of data:

### Public Data (No Authentication Required)
- GitHub documentation and README files
- Discourse forum posts
- Medium articles
- Telegram/Discord messages
- Podcast transcripts
- Regentokenomics Notion workspace (public tokenomics documentation)

This applies to every retrieval tool, including `get_full_document` — public
documents are fully retrievable without signing in (fixed 2026-07-16; earlier
versions incorrectly required auth for all full-document fetches).

### Private Data (Requires @regen.network OAuth)

Authentication is currently restricted to **@regen.network Google accounts** —
`regen_koi_authenticate` will reject other email domains. External users can
access all public-tier content without signing in; private documents return
"not found" to unauthenticated callers.
- Main Regen Notion workspace
  - Strategy documents
  - AI specifications
  - Partner analyses
  - Internal project planning
  - KOI implementation notes

### How to Access Private Data

1. Use the `regen_koi_authenticate` tool
2. A browser window opens for Google OAuth
3. Log in with your @regen.network email
4. Token is saved and cached for future sessions

### Sample Prompts for Private Data

After authentication, try:
```
"What are the current AI strategy documents?"
"Find internal partner onboarding documentation"
"Search for KOI specification documents in Notion"
"What's in the PRP Regen Network Series database?"
```

### Technical Implementation
- `is_private` column on `koi_memories` table
- `X-User-Email` header sent with all API requests
- Auth status cached for 5 minutes in MCP server
- Privacy filter applied at SQL query level

---

## Production Features (Phase 7)

### Reliability
- ✅ Exponential backoff retry (3 attempts, 1s → 2s → 4s)
- ✅ Circuit breaker pattern (prevents cascading failures)
- ✅ Timeout enforcement (30s default)
- ✅ Graceful error handling

### Observability
- ✅ Structured JSON logging (pino → stderr)
- ✅ Metrics tracking (p50/p95/p99 latencies)
- ✅ Cache hit/miss rates
- ✅ Circuit breaker state monitoring

### Performance
- ✅ 4-tier LRU caching (static: 1hr, semi-static: 10min, dynamic: 5min, volatile: 1min)
- ✅ Query result caching (reduces API load)
- ✅ Category-based TTLs

### Security
- ✅ Input validation (Zod schemas)
- ✅ SQL/Cypher injection detection
- ✅ Path traversal prevention
- ✅ Sensitive data redaction in logs

---

## Documentation Directory

### For Users
- **[USER_GUIDE.md](USER_GUIDE.md)** - Installation, usage, troubleshooting, FAQ
- **[API_REFERENCE.md](API_REFERENCE.md)** - Complete API documentation for all 9 MCP tools

### For Operators
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Deployment runbook, rollback, health checks
- **[INFRASTRUCTURE.md](INFRASTRUCTURE.md)** - Infrastructure requirements and setup

### For Developers
- **[archive/PHASE_7_REVIEW.md](archive/PHASE_7_REVIEW.md)** - Code review (9/10 rating)
- **[archive/TECHNICAL_ASSISTANT_PROJECT.md](archive/TECHNICAL_ASSISTANT_PROJECT.md)** - Complete project history
- **[archive/CODE_EXAMPLES.md](archive/CODE_EXAMPLES.md)** - Historical code examples
- **[archive/PHASE_0.2_COMPLETE.md](archive/PHASE_0.2_COMPLETE.md)** - Phase 0.2 completion
- **[archive/PHASE_0.3_COMPLETE.md](archive/PHASE_0.3_COMPLETE.md)** - Phase 0.3 completion

### HTTP API Documentation
- **[http-api/](http-api/)** - Direct HTTP API documentation for developers
  - **[README.md](http-api/README.md)** - Quick reference for all HTTP API endpoints
  - **[QUERY.md](http-api/QUERY.md)** - `/api/koi/query` endpoint - Hybrid RAG search (48,079+ documents)
  - **[GRAPH.md](http-api/GRAPH.md)** - `/api/koi/graph` endpoint - Code knowledge graph queries (26,768 entities)

---

## Quick Start

### 1. Prerequisites
- Node.js v18+
- PostgreSQL with Apache AGE extension
- Bun (for Query API)

### 2. Installation
```bash
git clone <repository>
cd regen-koi-mcp
npm install
npm run build
```

### 3. Configuration
See [USER_GUIDE.md](USER_GUIDE.md#installation) for detailed setup instructions.

### 4. Usage with Claude Code
Add to `~/.claude/code/config.json`:
```json
{
  "mcpServers": {
    "regen-koi": {
      "command": "node",
      "args": ["/path/to/regen-koi-mcp/dist/index.js"]
    }
  }
}
```

---

## Current Status

### Production Metrics (regen_graph_v2)
| Metric | Value |
|--------|-------|
| **Entities** | 26,768 (tree-sitter extraction) |
| **Repositories** | 5 (regen-ledger, regen-web, regen-data-standards, regenie-corpus, koi-sensors) |
| **CALLS edges** | 11,331 (enable call graph traversal) |
| **Concepts** | 10 (Credit Class, Credit Batch, etc.) |
| **EXPLAINS edges** | 11 (concept → code mappings) |
| **Query performance** | p95 < 500ms |
| **Cache hit rate** | Target > 50% |

### Graph Capabilities
- ✅ **Code Entity Queries** - Find functions, classes, interfaces by name/type/repo
- ✅ **Relationship Traversal** - Find callers, callees, call graphs
- ✅ **Concept Mapping** - Human-friendly terms to code entities
- ✅ **Module Discovery** - List and search Cosmos SDK modules
- ✅ **Orphan Detection** - Find unused functions

---

## Development Phases

### Completed ✅
- **Phase 0.1** - Fixed "N/A" metadata bug
- **Phase 0.2** - Discovery tools (list_repos, list_entity_types, get_entity_stats)
- **Phase 0.3** - Team onboarding documentation
- **Phase 1** - Tree-sitter AST extraction with CALLS edges
- **Phase 2** - Generic ontology with domain properties
- **Phase 5** - Concepts layer (10 concepts)
- **Phase 6** - Graph traversal tools (5 tools)
- **Phase 7** - Production hardening + documentation

### Planned
- **Phase 8** - TypeScript/Python extraction (expand beyond Go)
- **Phase 9** - Expand concepts (24 total concepts available)
- **Server-Side** - Database indexes, API rate limiting, backup automation

---

## Key Achievements

### Phase 7 Highlights (2025-11-27)
- 🎯 **9/10 Code Quality Rating** (PHASE_7_REVIEW.md)
- 🚀 **Production-Ready** - All core hardening features complete
- 📚 **Complete Documentation** - USER_GUIDE, API_REFERENCE, DEPLOYMENT
- 🔒 **Enterprise Security** - Validation, injection detection, sanitization
- 📊 **Observability** - Metrics, logging, health checks
- ⚡ **Performance** - 4-tier caching, retry logic, circuit breakers

### Before/After Comparison
| Aspect | Before (Regex) | After (Tree-sitter + Phase 7) | Improvement |
|--------|---------------|-------------------------------|-------------|
| Entities | 23,728 | 26,768 | +12.8% |
| CALLS edges | 0 | 11,331 | ∞ (new capability) |
| Query perf | ~500ms | <100ms | 5x faster |
| Graph traversal | ❌ Impossible | ✅ Working | **NEW** |
| Error handling | ❌ None | ✅ Retry + Circuit Breaker | **NEW** |
| Caching | ❌ None | ✅ 4-tier LRU | **NEW** |
| Metrics | ❌ None | ✅ Full observability | **NEW** |

---

## Support

### Documentation
- **Users**: Start with [USER_GUIDE.md](USER_GUIDE.md)
- **Operators**: See [DEPLOYMENT.md](DEPLOYMENT.md)
- **Developers**: See [API_REFERENCE.md](API_REFERENCE.md)

### Troubleshooting
- **Installation Issues**: USER_GUIDE.md#troubleshooting
- **Deployment Issues**: DEPLOYMENT.md#troubleshooting
- **Performance Issues**: DEPLOYMENT.md#issue-2-slow-query-performance
- **Error Messages**: API_REFERENCE.md#error-codes

### Production Server
- **Host**: 202.61.196.119
- **User**: darren
- **Access**: `ssh darren@202.61.196.119`
- **Logs**: `pm2 logs regen-koi-mcp` (see DEPLOYMENT.md#monitoring-and-logs)

---

## Contributing

This project uses:
- **TypeScript** for type safety
- **pino** for structured logging
- **Zod** for validation
- **lru-cache** for caching
- **Apache AGE** for graph queries

Before contributing, review:
1. [API_REFERENCE.md](API_REFERENCE.md) - Tool schemas
2. [archive/PHASE_7_REVIEW.md](archive/PHASE_7_REVIEW.md) - Code quality standards
3. [DEPLOYMENT.md](DEPLOYMENT.md) - Deployment process

---

## License

[Add license information]

---

## Changelog

### 2025-12-03 - Phase 8 Complete
- Private data access control for Notion workspace
- OAuth-gated access with @regen.network email validation
- `is_private` column added to koi_memories table
- Auth caching in MCP server (5 minute TTL)
- `X-User-Email` header on all API calls
- `/api/koi/auth/status` endpoint for auth validation
- `regen_koi_authenticate` tool for OAuth flow

### 2025-11-27 - Phase 7 Complete
- Production hardening complete (retry, circuit breaker, caching, validation)
- Complete documentation (USER_GUIDE, API_REFERENCE, DEPLOYMENT)
- Metrics and observability tooling
- 9/10 code quality rating

### 2025-11-27 - Phase 6 Complete
- Graph traversal tools (find_callers, find_callees, find_call_graph, find_orphaned_code, trace_call_chain)

### 2025-11-27 - Phase 5 Complete
- Concepts layer with 10 core concepts
- EXPLAINS edges linking concepts to code

### 2025-11-27 - Phase 1-2 Complete
- Tree-sitter AST extraction (26,768 entities)
- 11,331 CALLS edges
- Generic ontology with domain properties

### 2025-11-26 - Phase 0 Complete
- Fixed "N/A" metadata bug
- Discovery tools implemented
- Team onboarding documentation

---

**Last Updated:** 2025-12-03
**Maintained By:** Regen Network Development Team
