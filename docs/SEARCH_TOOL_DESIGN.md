# Search Tool Design: Two-Tool Architecture Analysis

> **STATUS UPDATE (2025-12-19):** Option C (Consolidation) has been implemented. `search_knowledge` has been renamed to `search` and `hybrid_search` has been removed. The `search` tool now handles all queries via the KOI API's built-in hybrid RAG system.

## Executive Summary

The Regen KOI MCP server has **two search tools** that appear similar:
- `search_knowledge` - Hybrid search with date filtering
- `hybrid_search` - Intelligent query routing with entity detection

This document explains the current design, the rationale behind it, and proposes a consolidation path.

---

## Current Architecture

### Tool 1: `search_knowledge`

**Purpose:** General-purpose hybrid search with date filtering

**Parameters:**
- `query` (string) - Search query
- `limit` (1-20, default 5)
- `published_from` / `published_to` (YYYY-MM-DD) - Date filtering
- `include_undated` (boolean) - Include documents without publication dates

**Implementation (`index.ts:439-517`):**
```typescript
private async searchKnowledge(args: any) {
  const { query, limit = 5, published_from, published_to, include_undated = false, useHybrid = false } = args;

  // Parse date filters (explicit or inferred from query)
  // ...

  // Default: Vector search via KOI API
  const response = await apiClient.post('/query', {
    question: query,
    limit: limit,
    ...vectorFilters
  });
}
```

**Backend:** Calls the KOI Query API (`/api/koi/query`) which runs the Hybrid RAG system:
- Vector search with BGE embeddings
- Entity-chunk link lookup
- Weighted Average Fusion (0.6V + 0.2E + 0.2K + 0.15 boost)
- Source-diversity sampling

**Key Feature:** Date filtering with natural language parsing ("past week", "last month")

---

### Tool 2: `hybrid_search`

**Purpose:** Intelligent query routing based on entity detection

**Parameters:**
- `query` (string) - Natural language query
- `limit` (1-50, default 10)

**Implementation (`index.ts:2071-2191`):**
```typescript
private async handleHybridSearch(args: any) {
  // Step 1: Classify query using QueryRouter
  const classification = await this.queryRouter.classifyQuery(query);
  // → Returns: intent, detected_entities, recommended_route, confidence

  // Step 2: Route based on classification
  if (classification.recommended_route === 'graph') {
    // Graph search for entity queries (pg_trgm detection)
    const graphResults = await this.unifiedSearch.graphSearch(entityNames, limit);
  } else if (classification.recommended_route === 'vector') {
    // Vector search via KOI API
    const response = await apiClient.post('/query', {...});
  } else {
    // Unified: Attempts RRF fusion (falls back to vector)
    // Note: Currently falls back to vector as embedding service not integrated
  }
}
```

**Components:**
1. **QueryRouter** (`query_router.ts`) - Classifies queries using:
   - `pg_trgm` trigram similarity for entity detection
   - Regex patterns for relationship/conceptual indicators
   - Returns `recommended_route: 'graph' | 'vector' | 'unified'`

2. **UnifiedSearch** (`unified_search.ts`) - Executes searches:
   - `graphSearch()` - Entity lookup via Apache AGE graph
   - `vectorSearch()` - Semantic search via pgvector
   - `search()` - RRF fusion combining both

**Key Feature:** Returns classification metadata explaining routing decision

---

## Comparison Matrix

| Aspect | `search_knowledge` | `hybrid_search` |
|--------|-------------------|-----------------|
| **Primary Use** | General knowledge search | Code entity queries |
| **Date Filtering** | Yes (explicit + NLP) | No |
| **Entity Detection** | No (backend handles it) | Yes (pg_trgm + QueryRouter) |
| **Graph Search** | Via backend entity-chunk links | Direct Apache AGE queries |
| **Result Limit** | 1-20 | 1-50 |
| **Classification Metadata** | No | Yes (intent, confidence, entities) |
| **Fallback Behavior** | Graceful API fallback | Falls back to `search_knowledge` |
| **Infrastructure Required** | KOI API only | QueryRouter + UnifiedSearch + DB |

---

## Why Two Tools?

### Historical Context

The two-tool design evolved through several phases:

1. **Phase 1 (Initial):** Only `search_knowledge` existed
   - Simple vector search via KOI API
   - Worked reliably in all deployments

2. **Phase 2c (Nov 25, 2025):** Added `hybrid_search`
   - Goal: Smart routing for code-specific queries
   - Entity detection via pg_trgm for precise graph lookups
   - Commit: `218ce57` - "Phase 2c complete"

3. **Phase 2.5 (Nov 26, 2025):** Pragmatic adjustment
   - Issue: Local SPARQL/graph calls failing in some environments
   - Fix: Disabled hybrid mode by default, kept `search_knowledge` stable
   - Commit: `095669b` - "fix: correct API parameter name and disable failing hybrid mode"

### Design Rationale

1. **Deployment Flexibility**
   - `search_knowledge` works with just the KOI API (no local DB needed)
   - `hybrid_search` requires PostgreSQL + AGE + pgvector

2. **Different Query Types**
   - Knowledge queries: "What is regenerative agriculture?"
   - Entity queries: "What Keeper handles MsgCreateBatch?"
   - The routing logic helps pick the right approach

3. **Incremental Enhancement**
   - Keep stable tool for production
   - Add smart tool for when infrastructure is ready

---

## Current State Issues

### 1. Confusion for LLM Agents
Two similar-sounding tools with overlapping functionality:
- "Hybrid search" vs "Intelligent search with hybrid retrieval"
- Agent may choose suboptimally

### 2. Duplicate Code Paths
Both tools eventually call the same KOI API for vector search:
```typescript
// In search_knowledge
const response = await apiClient.post('/query', {...});

// In hybrid_search (vector route)
const response = await apiClient.post('/query', {...});
```

### 3. Underutilized Graph Infrastructure
The QueryRouter and UnifiedSearch are sophisticated but:
- `hybrid_search` often falls back to vector search
- The entity-chunk links in the backend already provide entity boosting

### 4. Missing Integration
`hybrid_search`'s unified route says:
```typescript
console.error('Unified search requested but falling back to vector search (embedding service not integrated)');
```

---

## The Backend Already Does Hybrid Search

**Important Discovery:** The KOI Query API (`koi-query-api.ts`) already implements:

1. **Entity Detection** via pattern matching on query words
2. **Entity-Chunk Link Lookup** from `koi_entity_chunk_links` table
3. **Weighted Average Fusion** combining:
   - Vector results (0.6 weight)
   - Entity results (0.2 weight + 0.15 boost)
   - Keyword results (0.2 weight)
4. **Source-Diversity Sampling** to prevent any source from dominating

This means `search_knowledge` already gets hybrid search benefits without the MCP needing to do routing.

---

## Consolidation Proposal

### Option A: Keep Both (Status Quo)

**Pros:**
- Stable, working production
- Clear separation of concerns
- Upgrade path when graph fully deployed

**Cons:**
- Agent confusion
- Maintenance burden

### Option B: Merge into Single Smart Tool

Create one tool that combines the best of both:

```typescript
{
  name: 'search',  // Simple, clear name
  description: 'Search the Regen Network knowledge base. Automatically uses hybrid search with entity boosting. Supports date filtering.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      limit: { type: 'number', default: 10, max: 50 },
      published_from: { type: 'string', format: 'date' },
      published_to: { type: 'string', format: 'date' },
      include_undated: { type: 'boolean', default: false },
      // Optional: expose routing for power users
      route_hint: {
        type: 'string',
        enum: ['auto', 'vector', 'graph'],
        description: 'Optional: Force specific search strategy'
      }
    },
    required: ['query']
  }
}
```

**Implementation:**
```typescript
async search(args) {
  const { query, limit = 10, route_hint = 'auto', ...dateFilters } = args;

  // Always use the backend hybrid search (it handles entity boosting)
  const response = await apiClient.post('/query', {
    question: query,
    limit,
    ...dateFilters
  });

  // Optionally add classification metadata
  let classification = null;
  if (this.queryRouter) {
    classification = await this.queryRouter.classifyQuery(query);
  }

  return {
    results: response.data.results,
    metadata: {
      classification,
      route_used: 'hybrid_rag',
      entity_boost_active: true
    }
  };
}
```

**Migration:**
1. Deprecate `search_knowledge` and `hybrid_search`
2. Add `search` as the new unified tool
3. Keep old tools as aliases for backwards compatibility

### Option C: Simplify to `search_knowledge` Only

Since the backend already does hybrid search with entity boosting:

1. Remove `hybrid_search` entirely
2. Rename `search_knowledge` to `search`
3. Increase limit to 50
4. Add optional classification metadata

**Pros:**
- Simplest change
- Backend already handles complexity
- No duplicate code paths

**Cons:**
- Loses explicit graph search capability
- No entity detection metadata in response

---

## Recommendation

**Recommended: Option C (Simplify)**

### Rationale

1. **Backend Already Does It Right**
   - The Hybrid RAG system in `koi-query-api.ts` already:
     - Detects entities in queries
     - Looks up entity-chunk links
     - Applies weighted fusion with entity boost
     - Uses source-diversity sampling
   - Adding more routing in the MCP is redundant

2. **LLM Simplicity**
   - One clear tool is easier for agents to use
   - No ambiguity about which tool to choose

3. **Maintenance**
   - Less code to maintain
   - Single code path = fewer bugs

4. **Date Filtering Preserved**
   - The consolidated tool keeps date filtering
   - Natural language date parsing works

### Implementation Steps

1. **Update `tools.ts`:**
   - Rename `search_knowledge` to `search`
   - Update description to reflect hybrid capability
   - Increase max limit to 50
   - Remove `hybrid_search` tool

2. **Update `index.ts`:**
   - Remove `handleHybridSearch` method
   - Update case statement to use `search`
   - Optionally add classification metadata from QueryRouter

3. **Update `TOOL_ROUTING.md`:**
   - Reflect single search tool
   - Document entity boost behavior

4. **Backwards Compatibility:**
   - Keep `search_knowledge` as alias for 1 release
   - Log deprecation warning

---

## Appendix: Code Entity Search

For specific code entity queries (Keeper, Msg, Event), the `query_code_graph` tool remains the best choice:
- Direct Cypher queries to Apache AGE
- Precise entity relationships
- No semantic search noise

This tool serves a different purpose and should NOT be consolidated.

---

## References

- `src/tools.ts` - Tool definitions
- `src/query_router.ts` - Entity detection and classification
- `src/unified_search.ts` - RRF fusion implementation
- `src/index.ts:2071-2191` - `handleHybridSearch` implementation
- `src/index.ts:439-517` - `searchKnowledge` implementation
- `koi-processor/koi-query-api.ts` - Backend Hybrid RAG

---

*Document created: 2025-12-19*
*Purpose: Design analysis for search tool consolidation*
