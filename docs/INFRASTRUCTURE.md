# Infrastructure Requirements

This document describes the infrastructure needed to run the Regen KOI MCP server with full functionality.

## Overview

The Regen KOI MCP server provides 9 tools for searching and navigating the Regen Network codebase. Different tools have different infrastructure requirements:

### Tool Requirements Matrix

| Tool | PostgreSQL | pgvector | Apache AGE | BGE Server |
|------|------------|----------|------------|------------|
| `search_knowledge` | Required | Required | - | Required |
| `hybrid_search` | Required | Required | - | Required |
| `search_github_docs` | Required | Required | - | Required |
| `get_repo_overview` | Required | Required | - | Required |
| `get_tech_stack` | Required | Required | - | Required |
| `get_stats` | Required | - | - | - |
| `generate_weekly_digest` | Required | - | - | - |
| `query_code_graph` | Required | - | **Required** | - |
| `get_mcp_metrics` | - | - | - | - |

## Core Requirements

### 1. PostgreSQL 15+

The database backend for all data storage.

```bash
# Check version
psql --version
# Should be 15.x or higher
```

### 2. pgvector Extension

Required for vector similarity search (semantic search).

```sql
-- Check if installed
SELECT extversion FROM pg_extension WHERE extname = 'vector';
-- Should return version like 0.5.1
```

**Installation:** See [pgvector GitHub](https://github.com/pgvector/pgvector)

### 3. Apache AGE Extension (Optional but Recommended)

Required for graph queries (`query_code_graph` tool). Enables Cypher queries over code entity relationships.

```sql
-- Check if installed
SELECT extversion FROM pg_extension WHERE extname = 'age';
-- Should return version like 1.5.0
```

**Installation:** See `scripts/deploy/install-apache-age.sh`

### 4. BGE Embedding Server

Required for generating query embeddings at runtime.

- Default port: 8090
- Endpoint: `POST /encode`
- Model: text-embedding-3-large (1024 dimensions)

## Quick Start Options

### Option A: Docker (Recommended for Development)

Use our pre-configured Docker setup with all dependencies:

```bash
cd docker/
docker-compose up -d
```

This starts:
- PostgreSQL 15 with pgvector + Apache AGE
- BGE embedding server
- All required extensions pre-configured

### Option B: Existing PostgreSQL

If you have an existing PostgreSQL instance:

1. Install pgvector:
   ```bash
   # Ubuntu/Debian
   sudo apt install postgresql-15-pgvector
   ```

2. Install Apache AGE (optional):
   ```bash
   ./scripts/deploy/install-apache-age.sh
   ```

3. Create database and enable extensions:
   ```bash
   ./scripts/deploy/setup-database.sh
   ```

## Database Schema

After setting up PostgreSQL with extensions, apply the schema:

```bash
# Core tables (koi_memories, koi_embeddings)
psql -d your_database -f scripts/sql/migrations/*.sql

# Graph schema (if using Apache AGE)
psql -d your_database -f scripts/sql/graph_schema.sql
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Required
KOI_API_ENDPOINT=http://localhost:8301/api/koi
DATABASE_URL=postgresql://user:pass@localhost:5432/dbname

# For graph queries (optional)
GRAPH_DB_HOST=localhost
GRAPH_DB_PORT=5432
GRAPH_DB_NAME=eliza
GRAPH_DB_USER=postgres
GRAPH_DB_PASSWORD=postgres

# For BGE embedding server
BGE_SERVER_URL=http://localhost:8090
```

## Production Checklist

- [ ] PostgreSQL 15+ running
- [ ] pgvector extension installed and enabled
- [ ] Apache AGE installed (for graph queries)
- [ ] BGE embedding server running
- [ ] Database schema applied
- [ ] Environment variables configured
- [ ] MCP server built (`npm run build`)
- [ ] Systemd service configured (see `regen-koi-mcp.service`)

## Troubleshooting

### "relation does not exist" errors
Run the database migrations:
```bash
./scripts/deploy/setup-database.sh
```

### Graph queries return errors
Apache AGE may not be installed. Check with:
```sql
SELECT * FROM pg_extension WHERE extname = 'age';
```

### Vector search returns no results
1. Check BGE server is running: `curl http://localhost:8090/health`
2. Check embeddings exist: `SELECT COUNT(*) FROM koi_embeddings;`

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  Claude Code / MCP Client                                   │
└──────────────────────┬──────────────────────────────────────┘
                       │ stdio
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Regen KOI MCP Server (Node.js)                             │
│  - 9 tools for code search and navigation                   │
│  - Production hardening: retry, circuit breaker, cache      │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP
        ┌──────────────┴──────────────┐
        ▼                             ▼
┌───────────────────┐    ┌────────────────────────┐
│  KOI API (8301)   │    │  BGE Server (8090)     │
│  - Hybrid RAG     │    │  - Query embeddings    │
│  - RRF fusion     │    │  - 1024-dim vectors    │
└────────┬──────────┘    └────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  PostgreSQL                                                 │
│  ├── pgvector: Vector similarity search                     │
│  ├── Apache AGE: Graph queries (Cypher)                     │
│  └── FTS: Full-text keyword search                          │
│                                                             │
│  Tables:                                                    │
│  - koi_memories: Documents and content                      │
│  - koi_embeddings: 1024-dim vectors                         │
│  - regen_graph_v2: Entity nodes and relationships (AGE)     │
└─────────────────────────────────────────────────────────────┘
```
