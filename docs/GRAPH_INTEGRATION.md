# Apache Jena Graph Integration for Regen KOI MCP

## Overview

The Regen KOI MCP server now includes full integration with Apache Jena Fuseki for SPARQL graph queries. This enables:

- Direct SPARQL query execution against 427,944+ triples
- Natural language to SPARQL conversion using GPT-4
- Combined graph + vector search results
- Entity relationship traversal
- Ontology-aware queries

## Architecture

```
User Query → MCP Server → Apache Jena (Graph) + KOI API (Vectors)
                ↓
         SPARQL Client
                ↓
    Natural Language → SPARQL
                ↓
         Combined Results
```

## Configuration

Add these to your `.env` file:

```bash
# Apache Jena SPARQL endpoint
JENA_ENDPOINT=http://localhost:3030/koi/sparql

# Optional: OpenAI for NL→SPARQL conversion
OPENAI_API_KEY=your-api-key-here
GPT_MODEL=gpt-4o-mini
```

## Usage Examples

### 1. Natural Language Graph Query

```
Query: "query graph for Regen Network"
```

The system will:
1. Convert to SPARQL query
2. Execute against Apache Jena
3. Return entities and relationships
4. Supplement with vector search results

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

## Ontology Structure

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

- `regen:subject` - Statement subject
- `regen:predicate` - Relationship/predicate
- `regen:object` - Statement object
- `regen:confidence` - Confidence score (0.0-1.0)
- `rdfs:label` - Human-readable labels

## How It Works

### Natural Language Processing

When you ask "query graph for X", the system:

1. **Detects Query Type**
   - SPARQL queries start with SELECT/CONSTRUCT/ASK
   - Everything else is natural language

2. **Converts to SPARQL** (if needed)
   - Uses GPT-4 with ontology context
   - Falls back to keyword search without API key

3. **Executes Against Jena**
   - Sends SPARQL to Fuseki endpoint
   - Retrieves JSON results

4. **Combines with Vectors**
   - Also searches vector database
   - Merges both result sets

5. **Formats Results**
   - Graph structure for entities
   - Tables for SPARQL results
   - Confidence scores included

### Fallback Strategy

If SPARQL fails, the system:
1. Falls back to vector search
2. Uses enhanced query for entity context
3. Returns best available results

## Testing

Run the test script to verify your setup:

```bash
node test-graph-query.js
```

This tests:
- Graph statistics queries
- Entity searches
- Keyword searches
- SPARQL execution

## Performance

- **Graph Queries**: ~100-500ms for most queries
- **NL Conversion**: ~1-2s with GPT-4
- **Combined Results**: ~2-3s total
- **Fallback**: Vector-only ~200ms

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

The graph contains:
- 427,944 total triples
- 23,273 statements
- 8,192 organizations
- 17,808 entities

If no results:
1. Check your query syntax
2. Try broader search terms
3. Use direct SPARQL for debugging

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

## Future Enhancements

- [ ] Ontology extraction from live graph
- [ ] SHACL validation for data quality
- [ ] Graph visualization output format
- [ ] Reasoning/inference capabilities
- [ ] Federation with other SPARQL endpoints

## Resources

- [Apache Jena Documentation](https://jena.apache.org/)
- [SPARQL 1.1 Query Language](https://www.w3.org/TR/sparql11-query/)
- [Regen Network Ontology](/opt/projects/koi-sensors/knowledge_graph/ONTOLOGY.md)
- [MCP Protocol](https://modelcontextprotocol.com/)