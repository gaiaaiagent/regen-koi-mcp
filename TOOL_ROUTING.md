# Tool Routing Guide for Regen KOI MCP

## When to Use Each Tool

### query_graph
**Trigger phrases:**
- "query graph for [entity]"
- "graph query [entity]"
- "query the graph"

**Purpose:** Structured graph traversal to find entities and their relationships
**Example:** "query graph for Greg Landua"

### search_knowledge
**Trigger phrases:**
- "search for [topic]"
- "find information about [topic]"
- "look up [topic]"

**Purpose:** General text search across the knowledge base
**Example:** "search for carbon sequestration methods"

### get_entity
**Purpose:** Retrieve specific entity by RID or exact name
**Example:** "get entity orn:credit_class:C03"

## Key Differences

1. **query_graph** - Use when explicitly asked to "query graph" or when looking for entity relationships and connections
2. **search_knowledge** - Use for general information retrieval and keyword searches
3. **get_entity** - Use when you have a specific identifier or exact entity name

## Updated Behavior

The `query_graph` tool now:
- Recognizes both SPARQL queries and entity name queries
- Enhances entity queries to include relationships and connections
- Formats results as a graph structure showing primary and related entities
- Returns more comprehensive results (30 items) for entity searches