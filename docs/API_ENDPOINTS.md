# KOI HTTP API Endpoints - Quick Reference

Complete HTTP API reference for the KOI Query API server running at `https://regen.gaiaai.xyz/api/koi`

---

## Endpoints Overview

| Endpoint | Method | Port | Purpose | Documentation |
|----------|--------|------|---------|---------------|
| `/health` | GET | 8301 | Health check and system status | See below |
| `/stats` | GET | 8301 | Knowledge base statistics | See below |
| `/query` | POST | 8301 | **Hybrid RAG search** (48,079+ docs) | [API_QUERY.md](API_QUERY.md) |
| `/graph` | POST | 8301 | **Code graph queries** (26,768 entities) | [API_GRAPH.md](API_GRAPH.md) |
| `/weekly-digest` | GET | 8301 | Weekly activity summary | See below |
| `/weekly-digest/notebooklm` | GET | 8400 | Full NotebookLM export | See below |

---

## 1. GET `/api/koi/health`

**Health check endpoint with database status**

### Request
```bash
curl -s 'https://regen.gaiaai.xyz/api/koi/health'
```

### Response
```json
{
  "status": "healthy",
  "database": "connected",
  "memories": "48079",
  "embeddings": "47645",
  "timestamp": "2025-12-02T22:52:17.490Z"
}
```

### Fields
- **status**: System health ('healthy' or 'unhealthy')
- **database**: Database connection status
- **memories**: Total document count
- **embeddings**: Total embeddings count
- **timestamp**: Current server time (ISO 8601)

**Port:** 8301 (Bun server)
**Cache:** None
**Auth:** Not required

---

## 2. GET `/api/koi/stats`

**Comprehensive knowledge base statistics**

### Request
```bash
curl -s 'https://regen.gaiaai.xyz/api/koi/stats'
```

### Response
```json
{
  "total_documents": 48079,
  "recent_7_days": 23,
  "by_source": {
    "discourse": 12234,
    "web": 18456,
    "github": 8123,
    "podcast": 3012,
    "telegram": 4023,
    "discord": 2145,
    "medium": 1086
  }
}
```

### Fields
- **total_documents**: Total documents in knowledge base
- **recent_7_days**: Documents added in last 7 days
- **by_source**: Breakdown by data source

**Port:** 8301 (Bun server)
**Cache:** Real-time (no cache)
**Auth:** Not required

---

## 3. POST `/api/koi/query`

**Hybrid RAG search with vector + keyword fusion**

The most powerful endpoint - combines semantic search, keyword search, and RRF fusion.

### Key Features
- 48,079+ documents across 7 sources
- Vector similarity (BGE embeddings)
- Keyword matching (PostgreSQL full-text)
- Date filtering
- Confidence scoring
- Adaptive extraction

### Quick Example
```bash
curl -X POST 'https://regen.gaiaai.xyz/api/koi/query' \
  -H 'Content-Type: application/json' \
  -d '{
    "question": "How does credit batch creation work?",
    "limit": 5
  }'
```

### Parameters
- **question** (required): Search query
- **limit** (optional): Max results (default: 10)
- **filters** (optional): Date range filters

**📖 Full Documentation:** [API_QUERY.md](API_QUERY.md)

**Port:** 8301 (Bun server)
**Performance:** 150-300ms typical
**Auth:** Not required

---

## 4. POST `/api/koi/graph`

**Code knowledge graph queries**

Query 26,768 code entities (functions, structs, interfaces) extracted from 5 repositories.

### Key Features
- Apache AGE graph database
- 13 query types (discovery, search, relationships, modules)
- Repository filtering
- Relationship traversal

### Quick Example
```bash
curl -X POST 'https://regen.gaiaai.xyz/api/koi/graph' \
  -H 'Content-Type: application/json' \
  -d '{
    "query_type": "list_repos"
  }'
```

### Query Types
- **Discovery**: `list_repos`, `list_entity_types`, `get_entity_stats`
- **Search**: `find_by_type`, `search_entities`
- **Relationships**: `keeper_for_msg`, `msgs_for_keeper`, `related_entities`
- **Modules**: `list_modules`, `get_module`

**📖 Full Documentation:** [API_GRAPH.md](API_GRAPH.md)

**Port:** 8301 (Bun server)
**Performance:** < 200ms typical
**Auth:** Not required

---

## 5. GET `/api/koi/weekly-digest`

**Weekly activity summary**

### Request
```bash
# Default: Last 7 days
curl -s 'https://regen.gaiaai.xyz/api/koi/weekly-digest'

# Custom date range
curl -s 'https://regen.gaiaai.xyz/api/koi/weekly-digest?start_date=2025-11-01&end_date=2025-11-30'
```

### Parameters
- **start_date** (optional): Start date (YYYY-MM-DD), default: 7 days ago
- **end_date** (optional): End date (YYYY-MM-DD), default: today
- **format** (optional): 'markdown' or 'json', default: 'markdown'

### Response
```json
{
  "success": true,
  "format": "markdown",
  "content": "# Regen Network Weekly Digest...",
  "metadata": {
    "week_start": "2025-11-25",
    "week_end": "2025-12-02",
    "total_items": 50,
    "word_count": 1530
  }
}
```

**Port:** 8301 (Bun server)
**Cache:** None (generates on demand)
**Auth:** Not required

---

## 6. GET `/api/koi/weekly-digest/notebooklm`

**Full NotebookLM export with complete content**

Returns comprehensive weekly digest with full forum posts, Notion pages, and governance details.

### Request
```bash
curl -s 'https://regen.gaiaai.xyz/api/koi/weekly-digest/notebooklm'
```

### Response
```json
{
  "success": true,
  "content": "# Regen Network Weekly Digest - NotebookLM Enhanced Export...",
  "source": "cached",
  "statistics": {
    "word_count": 21423,
    "char_count": 124035
  }
}
```

### Fields
- **success**: Operation status
- **content**: Full markdown content (120KB+)
- **source**: 'cached' or 'generated'
- **statistics**: Word count, character count

**Port:** 8400 (Flask dashboard)
**Cache:** 24 hours
**Timeout:** 180 seconds (can take 2-3 minutes to generate)
**Auth:** Not required

---

## Common Use Cases

### 1. Search for recent activity
```bash
curl -X POST 'https://regen.gaiaai.xyz/api/koi/query' \
  -H 'Content-Type: application/json' \
  -d '{
    "question": "Regen Network updates",
    "filters": {
      "date_range": {
        "start": "2025-11-25",
        "end": "2025-12-02"
      }
    }
  }'
```

### 2. Find code entities
```bash
curl -X POST 'https://regen.gaiaai.xyz/api/koi/graph' \
  -H 'Content-Type: application/json' \
  -d '{
    "query_type": "search_entities",
    "entity_name": "MsgCreate"
  }'
```

### 3. Get system health
```bash
curl -s 'https://regen.gaiaai.xyz/api/koi/health'
```

### 4. Weekly digest
```bash
curl -s 'https://regen.gaiaai.xyz/api/koi/weekly-digest'
```

---

## Error Responses

All endpoints follow a consistent error format:

```json
{
  "error": "Error message here",
  "message": "Detailed error information (optional)"
}
```

**Common HTTP Status Codes:**
- **200**: Success
- **400**: Bad request (missing parameters)
- **404**: Endpoint not found
- **500**: Internal server error

---

## Performance

| Endpoint | Typical Response Time |
|----------|----------------------|
| `/health` | < 50ms |
| `/stats` | < 100ms |
| `/query` | 150-300ms |
| `/graph` | < 200ms |
| `/weekly-digest` | 200-500ms |
| `/weekly-digest/notebooklm` | 100ms (cached) / 120s (generated) |

---

## Architecture

```
┌─────────────────┐
│  MCP Client     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  MCP Server     │
│  (TypeScript)   │
└────────┬────────┘
         │ HTTP
         ▼
┌─────────────────┐
│  Bun API        │  Port 8301 (main endpoints)
│  Query API      │  - /health, /stats, /query, /graph, /weekly-digest
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  PostgreSQL     │
│  + pgvector     │  48,079+ documents
│  + Apache AGE   │  26,768 code entities
└─────────────────┘

┌─────────────────┐
│  Flask API      │  Port 8400 (NotebookLM only)
│  Dashboard      │  - /weekly-digest/notebooklm
└─────────────────┘
```

---

## Base URL

**Production:** `https://regen.gaiaai.xyz/api/koi`

All endpoints are prefixed with `/api/koi`.

---

## Related Documentation

- **[API_REFERENCE.md](API_REFERENCE.md)** - MCP tools documentation
- **[API_QUERY.md](API_QUERY.md)** - Complete `/query` endpoint docs
- **[API_GRAPH.md](API_GRAPH.md)** - Complete `/graph` endpoint docs
- **[USER_GUIDE.md](USER_GUIDE.md)** - Installation and usage
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Deployment guide

---

**Last Updated:** 2025-12-02
**API Version:** v1
**Server:** 202.61.196.119
