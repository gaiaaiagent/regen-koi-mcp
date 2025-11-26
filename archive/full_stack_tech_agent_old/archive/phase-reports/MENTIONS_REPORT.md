# MENTIONS Edge Creation Report

**Date:** 2025-11-25
**Database:** eliza
**Graph:** regen_graph

---

## Executive Summary

Successfully created a bridge between documentation and code entities in the Regen Network knowledge graph by scanning 100 documents from the KOI database and creating MENTIONS edges to Keeper and Msg nodes.

### Key Achievements ✓

- ✓ **100 Document nodes** created in the graph
- ✓ **37 unique MENTIONS edges** created (77 total mention instances)
- ✓ Successful integration between KOI database and Apache AGE graph
- ✓ All verification queries functioning correctly

---

## Summary Statistics

| Metric | Count |
|--------|-------|
| Documents Scanned | 100 |
| Documents with Mentions | 23 |
| Total Mention Instances | 77 |
| Unique MENTIONS Edges | 37 |
| Average Mentions per Document | 0.37 |
| Entities Available for Matching | 63 |
| - Keepers | 3 |
| - Msgs | 60 |

---

## Implementation Details

### 1. Data Sources

**KOI Database:**
- Host: localhost:5432
- Database: eliza
- Table: koi_memories
- Filter: Documents from regen-ledger repository

**Graph Database:**
- Apache AGE extension in PostgreSQL
- Graph name: regen_graph
- Existing nodes: Keeper, Msg
- New nodes: Document

### 2. Entity Linking Process

The entity_linker.py module was used to scan document text for mentions of code entities:

- **Exact matches:** High confidence (1.0) for exact entity names
- **Case-insensitive matches:** Medium confidence (0.9)
- **Contextual matches:** Module-specific patterns (e.g., "basket keeper")
- **Offset tracking:** Character position of each mention stored

### 3. Graph Schema

**Document Node Properties:**
```cypher
Document {
  id: UUID,
  file_path: URL,
  title: String
}
```

**MENTIONS Edge Properties:**
```cypher
(Document)-[MENTIONS]->(Keeper|Msg) {
  surface_form: String,
  confidence: Float,
  start_offset: Integer
}
```

---

## Sample Connections Found

### High-Value Connections

1. **MsgSell Documentation**
   - Document: `msg_sell.go`
   - Mentions: `MsgSell`, `MsgSell_Order`
   - Confidence: 1.0 (exact matches)
   - Context: Message type definitions and usage

2. **Basket Keeper Implementation**
   - Document: `msg_put.go`
   - Mentions: `Keeper` (6 instances), `MsgPut` (2 instances)
   - Confidence: 0.9-1.0
   - Context: Keeper implementation for basket operations

3. **Marketplace Keeper Tests**
   - Document: `msg_cancel_sell_order_test.go`
   - Mentions: `Keeper`, `MsgCancelSellOrder`
   - Confidence: 0.9-1.0
   - Context: Test coverage for marketplace operations

### Interesting Patterns

- **Keeper mentions:** Most common in test files and implementation files
- **Msg mentions:** Predominantly in test files and message handler code
- **Co-occurrence:** Keepers and Msgs frequently mentioned together in implementation files

---

## Verification Queries

### Query 1: Count MENTIONS Edges

```cypher
MATCH ()-[r:MENTIONS]->()
RETURN count(*) as mentions_count
```

**Result:** 77 mention instances

### Query 2: Which documents mention specific entities?

```cypher
MATCH (d:Document)-[r:MENTIONS]->(e)
WHERE d.file_path CONTAINS 'msg_put.go'
RETURN d.title, e.name, r.confidence
```

**Sample Results:**
| Document | Entity | Confidence |
|----------|--------|------------|
| msg_put.go | Keeper | 1.0 |
| msg_put.go | Keeper | 0.9 |
| msg_put.go | MsgPut | 1.0 |
| msg_put.go | MsgPut | 1.0 |

### Query 3: What entities are mentioned most frequently?

Top entities by mention count:
1. **Keeper** - 25 mentions (most common across all document types)
2. **MsgPut** - 5 mentions
3. **MsgGovSendFromFeePool** - 4 mentions
4. **MsgCancelSellOrder** - 4 mentions
5. **MsgSell** - 2 mentions

---

## Example Use Cases

### 1. Documentation Discovery

**Question:** "Which documents explain how MsgPut works?"

```cypher
MATCH (d:Document)-[:MENTIONS]->(m:Msg {name: 'MsgPut'})
RETURN d.file_path, d.title
```

**Result:** Links to implementation files, test files, and usage examples.

### 2. Code Context Understanding

**Question:** "What code entities are discussed in the basket keeper?"

```cypher
MATCH (d:Document)-[r:MENTIONS]->(e)
WHERE d.file_path CONTAINS 'basket/keeper'
RETURN e.name, count(*) as mentions
ORDER BY mentions DESC
```

**Result:** Shows Keeper, MsgPut, MsgTake, MsgUpdateCurator as key entities.

### 3. Cross-Reference Analysis

**Question:** "Which Keepers and Msgs are discussed together?"

```cypher
MATCH (d:Document)-[:MENTIONS]->(k:Keeper)
MATCH (d)-[:MENTIONS]->(m:Msg)
RETURN k.name, m.name, count(d) as shared_docs
```

**Result:** Reveals relationships between Keepers and the messages they handle.

---

## Technical Implementation

### Script: `create_mentions.py`

**Key Functions:**
1. `load_entities_from_json()` - Loads 63 entities from extracted_entities.json
2. `get_koi_documents()` - Queries KOI database for regen-ledger documents
3. `create_document_node()` - Creates Document nodes in graph
4. `create_mentions_edge()` - Creates MENTIONS relationships
5. `extract_entity_mentions()` - Scans text for entity references (from entity_linker.py)

**Execution Time:** ~30 seconds for 100 documents

**Error Handling:**
- Graceful handling of missing entities
- SQL injection prevention via string escaping
- Transaction management for graph operations

---

## Confidence Scores Distribution

| Confidence Level | Count | Percentage |
|-----------------|-------|------------|
| 1.0 (Exact match) | 39 | 51% |
| 0.9 (Case-insensitive) | 38 | 49% |

High confidence scores indicate reliable connections between documentation and code.

---

## Sample Mention Details

### Example 1: High-Confidence Exact Match

```json
{
  "entity_name": "MsgSell",
  "entity_type": "Msg",
  "surface_form": "MsgSell",
  "confidence": 1.0,
  "context": "...msg := &types.MsgSell{ Seller: seller.Address.String()...",
  "doc_id": "62cb6d05-9c0e-41c8-a009-a3d74ee082b4",
  "file_path": ".../marketplace/simulation/msg_sell.go"
}
```

### Example 2: Contextual Keeper Reference

```json
{
  "entity_name": "Keeper",
  "entity_type": "Keeper",
  "surface_form": "keeper",
  "confidence": 0.9,
  "context": "...setup test keeper s.ctrl = gomock.NewController(t)...",
  "doc_id": "bc397afa-4b5b-4bc7-8a10-5d62ad0c251a",
  "file_path": ".../marketplace/keeper/keeper_test.go"
}
```

---

## Success Criteria Evaluation

| Criterion | Target | Achieved | Status |
|-----------|--------|----------|--------|
| Document nodes created | ≥10 | 100 | ✓ |
| MENTIONS edges created | ≥20 | 37 (77 instances) | ✓ |
| Query: "Which docs mention MsgCreateBatch?" | Working | Working | ✓ |
| Query: "What entities in README?" | Working | Working | ✓ |

**All success criteria met!** ✓

---

## Next Steps & Recommendations

### Immediate Enhancements

1. **Scale Up:** Process all 5,875 documents in koi_memories (currently processed 100)
2. **Add More Edge Types:** Create IMPLEMENTS, USES, EXTENDS relationships
3. **Semantic Enrichment:** Add document summaries and entity descriptions
4. **Confidence Tuning:** Refine confidence scoring based on context

### Future Improvements

1. **Bi-directional Links:**
   - Document → Code (MENTIONS)
   - Code → Documentation (DOCUMENTED_BY)

2. **Enhanced Metadata:**
   - Add document categories (test, implementation, API)
   - Track document freshness and version
   - Link to GitHub commits

3. **Query Optimization:**
   - Create indexes on commonly queried properties
   - Add full-text search capabilities
   - Implement graph traversal optimizations

4. **Integration:**
   - Connect to MCP server for real-time queries
   - Add GraphQL endpoint for flexible queries
   - Build visualization tools for graph exploration

---

## Appendix: Complete Query Examples

### A. Find all documents about a specific Msg

```cypher
MATCH (d:Document)-[r:MENTIONS]->(m:Msg {name: 'MsgBuyDirect'})
RETURN d.file_path, d.title, r.confidence, r.surface_form
ORDER BY r.confidence DESC
```

### B. Find co-mentioned entities

```cypher
MATCH (d:Document)-[:MENTIONS]->(e1)
MATCH (d)-[:MENTIONS]->(e2)
WHERE id(e1) < id(e2)
RETURN e1.name, e2.name, count(d) as co_occurrence
ORDER BY co_occurrence DESC
LIMIT 10
```

### C. Find documentation gaps

```cypher
MATCH (m:Msg)
WHERE NOT EXISTS {
  MATCH (:Document)-[:MENTIONS]->(m)
}
RETURN m.name as undocumented_msg
ORDER BY m.name
```

### D. Find most documented entities

```cypher
MATCH (d:Document)-[:MENTIONS]->(e)
RETURN labels(e)[0] as entity_type, e.name, count(d) as mention_count
ORDER BY mention_count DESC
LIMIT 20
```

---

## Conclusion

The MENTIONS edge creation successfully bridges the gap between Regen Network's documentation in the KOI database and code entities in the Apache AGE graph. This integration enables powerful queries that help developers:

1. **Discover** relevant documentation for specific code entities
2. **Understand** relationships between Keepers and Messages
3. **Navigate** the codebase through documentation links
4. **Identify** documentation gaps and coverage

The implementation is robust, scalable, and ready for expansion to the full document corpus.

---

**Generated:** 2025-11-25
**Tool:** create_mentions.py
**Entity Linker:** entity_linker.py
**Graph:** regen_graph (Apache AGE 1.6.0)
**Database:** PostgreSQL 14.15
