# Tool Routing Guide for Regen KOI MCP

## When to Use Each Tool

### search_knowledge
Use for general knowledge retrieval. Internally runs hybrid graph + vector search with adaptive filters.

Inputs:
- `query` (string) — what you’re looking for
- `limit` (1–20, default 5)
- `published_from` (YYYY‑MM‑DD)
- `published_to` (YYYY‑MM‑DD)
- `include_undated` (boolean, default false)

Behavior:
- Canonical‑aware (topic) filtering to eliminate off‑domain noise
- Smart fallback recovers recall when canonical is too strict
- Date filter applies to vector and keyword branches (document metadata). If `include_undated` is true, undated docs are also included.

### get_stats
Use to retrieve system statistics (document counts, sources, recent updates).

Inputs:
- `detailed` (boolean, default false) — include breakdown by source and type

### generate_weekly_digest
Use to create a comprehensive markdown summary of Regen Network activity over a date range.

Inputs:
- `start_date` (YYYY-MM-DD, default: 7 days ago)
- `end_date` (YYYY-MM-DD, default: today)
- `save_to_file` (boolean, default false) — save to disk
- `output_path` (string) — custom file path when saving
- `format` ('markdown' or 'json', default 'markdown')

Behavior:
- Aggregates content from KOI knowledge base
- Returns markdown with source citations
- Can save to file for use with NotebookLM or other tools
- Includes statistics and categorized content

## Notes

- Graph execution is used internally by `search_knowledge`; there is no separate graph tool exposed.
- Natural‑language recency detection: phrases like “past week”, “last month”, “last 30 days”, “yesterday”, “today” automatically set a date range when no explicit `published_from`/`published_to` are provided.
- If you need raw SPARQL, use Jena directly or open an issue to discuss adding an expert‑mode tool.
