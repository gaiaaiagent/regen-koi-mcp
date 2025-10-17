# Tool Routing Guide for Regen KOI MCP

## When to Use Each Tool

### search_knowledge
Use for general knowledge retrieval. Internally runs hybrid graph + vector search with adaptive filters.

Inputs:
- `query` (string) — what you’re looking for
- `limit` (1–20, default 5)
- `published_from` (YYYY‑MM‑DD)
- `published_to` (YYYY‑MM‑DD)

Behavior:
- Canonical‑aware (topic) filtering to eliminate off‑domain noise
- Smart fallback recovers recall when canonical is too strict
- Date filter applies to vector branch (document metadata)

### get_stats
Use to retrieve system statistics (document counts, sources, recent updates).

## Notes

- Graph execution is used internally by `search_knowledge`; there is no separate graph tool exposed.
- If you need raw SPARQL, use Jena directly or open an issue to discuss adding an expert‑mode tool.
