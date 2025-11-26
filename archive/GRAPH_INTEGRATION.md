# Hybrid Graph Integration Overview

## Overview

The Regen KOI MCP server integrates Apache Jena Fuseki (graph) with the KOI API (vectors) and an adaptive NL→SPARQL layer for high‑quality, hybrid search:

- Parallel SPARQL + vector execution with RRF fusion
- Adaptive NL→SPARQL with canonical‑aware filtering and smart fallback
- Refined graph with canonical predicate categories for precise topic routing
- Predicate communities and embedding‑based predicate retrieval for focused context

## Architecture

```
User Query → MCP Server → [SPARQL Branch] + [Vector Branch]
                  ↓                    ↓
         Canonical‑aware NL→SPARQL    KOI API semantic search
                  ↓                    ↓
             Result Fusion (RRF scoring over merged triples/snippets)
```

## Configuration

Add these to your `.env` file:

```bash
# Apache Jena SPARQL endpoint
JENA_ENDPOINT=http://localhost:3030/koi/sparql
CONSOLIDATION_PATH=/opt/projects/koi-processor/src/core/final_consolidation_all_t0.25.json
PATTERNS_PATH=/opt/projects/koi-processor/src/core/predicate_patterns.json
COMMUNITY_PATH=/opt/projects/koi-processor/src/core/predicate_communities.json
EMBEDDING_SERVICE_URL=http://localhost:8095
# Optional
# OPENAI_API_KEY=your-api-key-here
# GPT_MODEL=gpt-4o-mini
```

## Usage Examples

### 1. Natural Language Graph Query (Adaptive)

```
Query: "query graph for Regen Network"
```

The system will:
1. Detect canonical categories (e.g., eco_credit, finance) from keywords
2. Run focused (predicate‑filtered) + broad branches in parallel
3. If canonical filters return zero results, retry broad without canonical
4. Fuse both branches with RRF and return ranked triples

### 2. Direct SPARQL Query

```sparql
SELECT ?org ?label WHERE {
  ?org a schema:Organization .
  ?org rdfs:label ?label .
  FILTER(CONTAINS(?label, "Regen"))
}
```

### 3. Entity Search

```
Query: "query graph for Gregory Landua"
```

Returns:
- All statements where Gregory is subject
- Relationships and connections
- Associated documents

## Graph Structure

The knowledge graph uses these namespaces:

- `regen:` - Regen Network experimental ontology
- `schema:` - Schema.org vocabulary
- `prov:` - W3C provenance ontology
- `rdfs:` - RDF Schema

### Core Classes

- `regen:Statement` - Extracted claims/statements (23,273 instances)
- `schema:Organization` - Organizations (8,192 instances)
- `schema:Project` - Projects
- `schema:Person` - People
- `prov:Entity` - Provenance entities (23,273 instances)

### Core Properties

- `regx:subject` - Statement subject (string literal)
- `regx:predicate` - Relationship/predicate (string literal)
- `regx:object` - Statement object (string literal)
- `regx:canonicalPredicate` - Canonical category label (string literal)

## How It Works

### Adaptive NL→SPARQL Processing

When you ask "query graph for X", the system:

1. **Detects Query Type**
   - SPARQL queries start with SELECT/CONSTRUCT/ASK
   - Everything else is natural language

2. **Canonical Filtering**
   - Maps keywords to canonical categories (e.g., eco_credit, finance)
   - Applies `?stmt regx:canonicalPredicate ?cat` filter (VALUES)
   - If zero results, automatically retries without canonical filters

3. **Executes Against Jena**
   - Sends SPARQL to Fuseki endpoint
   - Retrieves JSON results

4. **Combines with Vectors**
   - Also searches vector database
   - Merges both result sets

5. **Formats Results**
   - Prioritizes results found in both branches
   - Summaries include predicate counts for exploration

### Fallback Strategy

If SPARQL fails, the system:
1. Falls back to vector search
2. Uses enhanced query for entity context
3. Returns best available results

## Evaluation

Run the test script to verify your setup:

```bash
node scripts/eval-nl2sparql.js
```

This evaluates:
- Focused vs broad branch sizes, union/overlap
- Latency and noise rate
- Saves JSON to `results/eval_*.json`

## Performance

- **Average**: ~1.5 s per query
- **Cold start**: ~19 s (warm‑up planned)
- **Noise**: 0% with canonical filtering
- **Recall**: 100% with smart fallback

## Troubleshooting

### "SPARQL query failed"

Check:
1. Apache Jena is running: `docker ps | grep fuseki`
2. Endpoint is accessible: `curl http://localhost:3030`
3. Dataset exists: `curl http://localhost:3030/$/datasets`

### "No OpenAI API key"

The system works without OpenAI, using keyword search:
- Less sophisticated SPARQL generation
- Still searches for entities and relationships
- May miss complex query intent

### "No results found"

- The adaptive executor automatically retries broad branch without canonical filters when needed. If still no results:
  1. Try alternative phrasing
  2. Use the predicate summary to see available relationships for an entity
  3. Run direct SPARQL for debugging

## Advanced Usage

### Complex SPARQL Queries

```sparql
PREFIX regen: <https://regen.network/ontology/experimental#>
SELECT ?s ?p ?o ?confidence WHERE {
  ?stmt regen:subject ?s .
  ?stmt regen:predicate ?p .
  ?stmt regen:object ?o .
  ?stmt regen:confidence ?confidence .
  FILTER(?confidence > 0.8)
}
ORDER BY DESC(?confidence)
LIMIT 100
```

### Graph Traversal

Find all relationships for an entity:

```sparql
SELECT * WHERE {
  { <entity-uri> ?p ?o }
  UNION
  { ?s ?p <entity-uri> }
}
```

### Provenance Queries

```sparql
PREFIX prov: <http://www.w3.org/ns/prov#>
SELECT ?entity ?source ?time WHERE {
  ?entity prov:wasGeneratedBy ?activity .
  ?entity prov:hadPrimarySource ?source .
  ?activity prov:generatedAtTime ?time .
}
ORDER BY DESC(?time)
```

## Next Steps

- Multi‑category gating (e.g., eco_credit + finance) without dropping canonical
- Jena Text index for faster broad branch
- Provenance filters on `regx:sourceDomain` / `regx:sourceType`
- Enrich canonical mapping for water/finance

## Resources

- [Apache Jena Documentation](https://jena.apache.org/)
- [SPARQL 1.1 Query Language](https://www.w3.org/TR/sparql11-query/)
- [Regen Network Ontology](/opt/projects/koi-sensors/knowledge_graph/ONTOLOGY.md)
- [MCP Protocol](https://modelcontextprotocol.com/)
