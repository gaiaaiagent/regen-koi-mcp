# Graph vs Vector Search Evaluation Report

**Generated:** 2025-11-26T01:36:48.037Z
**Queries Evaluated:** 11

---

## Executive Summary

| Metric | Graph Search | Vector Search | Improvement |
|--------|--------------|---------------|-------------|
| Recall@5 | 9.1% | 2.3% | 6.8pp |
| Recall@10 | 9.1% | 6.8% | 2.3pp |

## Performance by User Journey

### Onboarding (2 queries)

| Metric | Graph | Vector | Improvement |
|--------|-------|--------|-------------|
| Recall@5 | 0.0% | 12.5% | -12.5pp |
| Recall@10 | 0.0% | 37.5% | -37.5pp |

### Impact (3 queries)

| Metric | Graph | Vector | Improvement |
|--------|-------|--------|-------------|
| Recall@5 | 0.0% | 0.0% | 0.0pp |
| Recall@10 | 0.0% | 0.0% | 0.0pp |

### Integration (3 queries)

| Metric | Graph | Vector | Improvement |
|--------|-------|--------|-------------|
| Recall@5 | 33.3% | 0.0% | 33.3pp |
| Recall@10 | 33.3% | 0.0% | 33.3pp |

### Audit (3 queries)

| Metric | Graph | Vector | Improvement |
|--------|-------|--------|-------------|
| Recall@5 | 0.0% | 0.0% | 0.0pp |
| Recall@10 | 0.0% | 0.0% | 0.0pp |

## Detailed Query Results

### onboarding-001: How does the ecocredit module handle credit retirement?

**Journey:** onboarding

| Method | Recall@5 | Recall@10 | Found | Missing |
|--------|----------|-----------|-------|----------|
| Graph | 0.0% | 0.0% | none | MsgRetire, Keeper, regen-ledger/x/ecocredit/README.md, regen-ledger/x/ecocredit/spec/03_messages.md |
| Vector | 25.0% | 25.0% | Keeper | MsgRetire, regen-ledger/x/ecocredit/README.md, regen-ledger/x/ecocredit/spec/03_messages.md |

*Notes:* Should return both docs and code entities. Tests doc-to-code bridging.

### onboarding-002: What is the basket module and what does it do?

**Journey:** onboarding

| Method | Recall@5 | Recall@10 | Found | Missing |
|--------|----------|-----------|-------|----------|
| Graph | 0.0% | 0.0% | none | Keeper, regen-ledger/x/ecocredit/basket/README.md |
| Vector | 0.0% | 50.0% | none | Keeper, regen-ledger/x/ecocredit/basket/README.md |

*Notes:* Basket keeper documentation - tests basic doc retrieval

### impact-001: What messages does the ecocredit Keeper handle?

**Journey:** impact

| Method | Recall@5 | Recall@10 | Found | Missing |
|--------|----------|-----------|-------|----------|
| Graph | 0.0% | 0.0% | none | MsgCreateClass, MsgCreateBatch, MsgSend, MsgRetire, MsgCancel |
| Vector | 0.0% | 0.0% | none | MsgCreateClass, MsgCreateBatch, MsgSend, MsgRetire, MsgCancel |

*Notes:* Direct graph query - should excel with graph search

### impact-002: Which Keeper handles MsgCreateBatch?

**Journey:** impact

| Method | Recall@5 | Recall@10 | Found | Missing |
|--------|----------|-----------|-------|----------|
| Graph | 0.0% | 0.0% | none | Keeper |
| Vector | 0.0% | 0.0% | none | Keeper |

*Notes:* Reverse relationship query - graph should outperform vector

### impact-003: What messages are related to credit batches?

**Journey:** impact

| Method | Recall@5 | Recall@10 | Found | Missing |
|--------|----------|-----------|-------|----------|
| Graph | 0.0% | 0.0% | none | MsgCreateBatch, MsgSend, MsgRetire, MsgCancel |
| Vector | 0.0% | 0.0% | none | MsgCreateBatch, MsgSend, MsgRetire, MsgCancel |

*Notes:* Semantic relationship - both methods should find results

### integration-001: How do I create a new credit class?

**Journey:** integration

| Method | Recall@5 | Recall@10 | Found | Missing |
|--------|----------|-----------|-------|----------|
| Graph | 0.0% | 0.0% | none | MsgCreateClass, regen-ledger/x/ecocredit/README.md, regen-ledger/x/ecocredit/spec/03_messages.md |
| Vector | 0.0% | 0.0% | none | MsgCreateClass, regen-ledger/x/ecocredit/README.md, regen-ledger/x/ecocredit/spec/03_messages.md |

*Notes:* Should find both docs explaining and the Msg definition

### integration-002: What parameters does MsgSend require?

**Journey:** integration

| Method | Recall@5 | Recall@10 | Found | Missing |
|--------|----------|-----------|-------|----------|
| Graph | 100.0% | 100.0% | MsgSend | none |
| Vector | 0.0% | 0.0% | none | MsgSend |

*Notes:* Should return Msg node with fields - tests entity detail retrieval

### integration-003: How do I retire credits from a basket?

**Journey:** integration

| Method | Recall@5 | Recall@10 | Found | Missing |
|--------|----------|-----------|-------|----------|
| Graph | 0.0% | 0.0% | none | MsgTake, MsgRetire, regen-ledger/x/ecocredit/basket/README.md |
| Vector | 0.0% | 0.0% | none | MsgTake, MsgRetire, regen-ledger/x/ecocredit/basket/README.md |

*Notes:* Multi-step process - needs both basket and ecocredit modules

### audit-001: Find all documentation mentioning MsgRetire

**Journey:** audit

| Method | Recall@5 | Recall@10 | Found | Missing |
|--------|----------|-----------|-------|----------|
| Graph | 0.0% | 0.0% | none | MsgRetire, regen-ledger/x/ecocredit/README.md, regen-ledger/x/ecocredit/spec/03_messages.md |
| Vector | 0.0% | 0.0% | none | MsgRetire, regen-ledger/x/ecocredit/README.md, regen-ledger/x/ecocredit/spec/03_messages.md |

*Notes:* Graph query for MENTIONS edges - graph should excel

### audit-002: What entities are related to credit batches?

**Journey:** audit

| Method | Recall@5 | Recall@10 | Found | Missing |
|--------|----------|-----------|-------|----------|
| Graph | 0.0% | 0.0% | none | MsgCreateBatch, MsgSend, MsgRetire, MsgCancel |
| Vector | 0.0% | 0.0% | none | MsgCreateBatch, MsgSend, MsgRetire, MsgCancel |

*Notes:* Co-occurrence in docs - tests graph relationship traversal

### audit-003: What messages handle basket operations?

**Journey:** audit

| Method | Recall@5 | Recall@10 | Found | Missing |
|--------|----------|-----------|-------|----------|
| Graph | 0.0% | 0.0% | none | MsgCreate, MsgPut, MsgTake |
| Vector | 0.0% | 0.0% | none | MsgCreate, MsgPut, MsgTake |

*Notes:* Basket-specific messages - tests domain filtering

## Analysis

### Where Graph Search Excels

Graph search showed significant improvement (>20pp) on 1 queries:

- **integration-002**: "What parameters does MsgSend require?" (+100.0pp)

### Where Vector Search Excels

Vector search showed significant improvement (>20pp) on 1 queries:

- **onboarding-001**: "How does the ecocredit module handle credit retirement?" (-25.0pp)

## Recommendations for Phase 2b

1. **Hybrid Approach**: Combine graph and vector search for best results
2. **Query Routing**: Use query type detection to route to optimal search method
3. **Graph Expansion**: Add more relationship types (EMITS, IMPLEMENTS) to improve coverage
4. **Vector Enhancement**: Improve entity extraction in vector results for better matching
5. **Benchmarking**: Expand gold set with more diverse queries

