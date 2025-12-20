# Tool Routing Guide for Regen KOI MCP

## Quick Reference

| Query Type | Best Tool | Example |
|------------|-----------|---------|
| General knowledge search | `search` | "What is regenerative agriculture?" |
| Entity-specific queries | `query_code_graph` | "What Keeper handles MsgCreateBatch?" |
| GitHub documentation | `search_github_docs` | "ecocredit module architecture" |
| Repository overview | `get_repo_overview` | Get structure of regen-ledger |
| Tech stack info | `get_tech_stack` | Languages/frameworks used |
| Activity digest | `generate_weekly_digest` | Weekly summary of activity |
| System statistics | `get_stats` | Document counts, sources |
| Performance metrics | `get_mcp_metrics` | Latency, cache, errors |

---

## Knowledge Base Search

### search

The primary search tool for the Regen Network knowledge base. Uses the backend's Hybrid RAG system which automatically combines:
- **Vector search** (semantic similarity via BGE embeddings)
- **Entity search** (entity-chunk links with 614K+ associations)
- **Keyword search** (lexical matching)

Results are ranked using Weighted Average Fusion with entity boosting.

**Inputs:**
- `query` (string) — what you're looking for
- `limit` (1–50, default 10)
- `published_from` (YYYY-MM-DD) — filter by publication date
- `published_to` (YYYY-MM-DD)
- `include_undated` (boolean, default false)

**Behavior:**
- Hybrid search combining vector + entity + keyword matching
- Entity boost applied automatically when query matches known entities
- Source-diversity sampling prevents any single source from dominating
- Smart date filtering with natural language support ("past week", "last month")
- Falls back gracefully when filters are too strict

**Best for:** All knowledge queries - conceptual questions, entity lookups, time-sensitive research

**Examples:**
```
"What is regenerative agriculture?"
"How does the ecocredit module work?"
"Regen Network governance proposals from last month"
"What is the credit class framework?"
```

---

## Code Knowledge Graph Tools

### query_code_graph

Use for precise queries about code structure and relationships. Queries the Apache AGE graph database directly.

**Inputs:**
- `query_type` (required) — one of:
  - `keeper_for_msg` — Find which Keeper handles a message
  - `msgs_for_keeper` — List all messages a Keeper handles
  - `docs_mentioning` — Find documents that mention an entity
  - `entities_in_doc` — List entities mentioned in a document
  - `related_entities` — Find entities related via shared documentation
- `entity_name` (string) — entity to query (e.g., "MsgCreateBatch", "Keeper")
- `doc_path` (string) — document path for doc-related queries

**Best for:** Impact analysis, understanding code relationships, finding documentation for specific code entities

**Examples:**
```
What Keeper handles MsgCreateBatch?
→ query_type: "keeper_for_msg", entity_name: "MsgCreateBatch"

What messages does the ecocredit Keeper handle?
→ query_type: "msgs_for_keeper", entity_name: "Keeper"

What docs mention MsgRetire?
→ query_type: "docs_mentioning", entity_name: "MsgRetire"
```

---

## GitHub Documentation Tools

### search_github_docs

Search Regen Network GitHub repositories for documentation, README files, and technical content.

**Inputs:**
- `query` (string) — search terms
- `repository` (optional) — filter to specific repo: regen-ledger, regen-web, regen-data-standards, regenie-corpus
- `limit` (1-20, default 10)

**Best for:** Finding documentation, README content, technical guides

---

### get_repo_overview

Get a structured overview of a Regen repository including description, key files, and documentation links.

**Inputs:**
- `repository` (required) — one of: regen-ledger, regen-web, regen-data-standards, regenie-corpus

**Best for:** Onboarding to a new repo, understanding repo structure

---

### get_tech_stack

Get technical stack information including languages, frameworks, dependencies, and build tools.

**Inputs:**
- `repository` (optional) — filter to specific repo, or omit to show all

**Best for:** Understanding technology choices, dependency analysis

---

## Utility Tools

### get_stats

Get knowledge base statistics including document counts by source and type.

**Inputs:**
- `detailed` (boolean, default false) — include detailed breakdown

---

### generate_weekly_digest

Generate a markdown summary of Regen Network activity over a date range.

**Inputs:**
- `start_date` (YYYY-MM-DD, default: 7 days ago)
- `end_date` (YYYY-MM-DD, default: today)
- `save_to_file` (boolean, default false)
- `output_path` (string) — custom file path when saving
- `format` ('markdown' or 'json', default 'markdown')

**Best for:** Weekly summaries, NotebookLM input, activity tracking

---

### get_notebooklm_export

Get a full content export for NotebookLM including complete forum posts and Notion pages.

**Inputs:**
- `output_path` (string) — custom file path for saving

**Best for:** Creating comprehensive knowledge exports for external tools

---

### get_mcp_metrics

Get production performance metrics including query latencies, cache hit rates, error counts, and circuit breaker states.

**Inputs:** None

**Returns:**
- Per-tool latency percentiles (p50, p95, p99)
- Success/error rates
- Cache hit/miss rates
- Circuit breaker states
- Last error messages

**Best for:** Production monitoring, performance troubleshooting, cache optimization

---

## Authentication

### regen_koi_authenticate

Authenticate with your @regen.network email to access internal documentation.

**Inputs:** None (opens browser for OAuth)

**Best for:** Accessing private Notion workspace content

---

## Notes

- **Natural language dates:** Phrases like "past week", "last month", "yesterday" automatically set date ranges in the `search` tool
- **Hybrid RAG:** The `search` tool automatically uses the backend's hybrid retrieval system - no need to choose between vector and entity search
- **Graph queries:** For specific code entity relationships (Keeper/Msg/Event), use `query_code_graph` for precise results
- **Entity boost:** Queries mentioning known entities (like "Regen Network", "ecocredit") automatically get boosted results from entity-chunk links
