# Tool Routing Guide for Regen KOI MCP

## Quick Reference

| Query Type | Best Tool | Example |
|------------|-----------|---------|
| General knowledge search | `search_knowledge` | "What is regenerative agriculture?" |
| Entity-specific queries | `query_code_graph` | "What Keeper handles MsgCreateBatch?" |
| Auto-routing (entity vs conceptual) | `hybrid_search` | "How does credit batch creation work?" |
| GitHub documentation | `search_github_docs` | "ecocredit module architecture" |
| Repository overview | `get_repo_overview` | Get structure of regen-ledger |
| Tech stack info | `get_tech_stack` | Languages/frameworks used |
| Activity digest | `generate_weekly_digest` | Weekly summary of activity |
| System statistics | `get_stats` | Document counts, sources |

---

## Knowledge Base Search Tools

### search_knowledge
Use for general knowledge retrieval with date filtering. Runs hybrid vector + keyword search with RRF fusion.

**Inputs:**
- `query` (string) — what you're looking for
- `limit` (1–20, default 5)
- `published_from` (YYYY‑MM‑DD) — filter by publication date
- `published_to` (YYYY‑MM‑DD)
- `include_undated` (boolean, default false)

**Behavior:**
- Hybrid search combining vector similarity + keyword matching
- Smart date filtering with natural language support ("past week", "last month")
- Falls back gracefully when filters are too strict

**Best for:** Time-sensitive queries, research on specific topics, finding recent content

---

### hybrid_search
Use for intelligent query routing. Automatically detects whether your query is about specific code entities (routes to graph) or conceptual topics (routes to vector search).

**Inputs:**
- `query` (string) — natural language question
- `limit` (1–50, default 10)

**Behavior:**
- Analyzes query for entity patterns (MsgSend, Keeper, EventBurn, etc.)
- Routes entity queries to graph search for precise results
- Routes conceptual queries to vector search for semantic matching
- Returns classification metadata showing how the query was routed

**Best for:** When you're not sure which search method to use, general questions about the codebase

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

## Notes

- **Natural language dates:** Phrases like "past week", "last month", "yesterday" automatically set date ranges
- **Graph vs Vector:** Entity queries (specific Msg/Keeper/Event names) work best with `query_code_graph`; conceptual queries work best with `search_knowledge`
- **Auto-routing:** Use `hybrid_search` when unsure — it detects query type automatically
