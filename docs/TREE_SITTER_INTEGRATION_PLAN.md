# Plan: Tree-Sitter Integration for Code Graph

> **Goal:** Replace regex-based code extraction with tree-sitter AST parsing for accurate entity types and relationship extraction.

## Progress Summary

| Phase | Status | Date |
|-------|--------|------|
| Phase 1: Validate Extractor | ✅ Complete | Jan 12, 2026 |
| Phase 3: Add HANDLES Edges | ✅ Complete | Jan 12, 2026 |
| Phase 2: Feature Flag | ⏳ Pending | - |
| Phase 4: Re-Extract Codebase | ⏳ Pending | - |
| Phase 5: Validate Results | ⏳ Pending | - |

## Current State

| Component | Status |
|-----------|--------|
| `tree_sitter_extractor.py` | ✅ Exists, fully implemented (36KB) + HANDLES edges added |
| tree-sitter packages | ✅ Installed (v0.25.2 + Go/Python/TS) |
| HANDLES edge creation | ✅ Added (lines 177-192) |
| `code_graph_processor.py` | ❌ Uses regex patterns |
| `code_graph_service.py` | ❌ Still imports regex-based processor |
| Database | 25,466 entities with `method: "regex"` |

## Why This Matters

| Issue | With Regex | With Tree-Sitter |
|-------|------------|------------------|
| Entity types | ~80% generic "Entity" | Accurate Function, Interface, Struct |
| HANDLES edges | Not extracted | Can detect `func (k Keeper) HandleMsg()` |
| Call graph | Not possible | Can build caller/callee relationships |
| Accuracy | Pattern-matching, misses edge cases | Full AST parsing, handles all syntax |

---

## Implementation Plan

### Phase 1: Validate Tree-Sitter Extractor ✅ COMPLETE

**Location:** `/opt/projects/koi-processor/src/core/tree_sitter_extractor.py`

**Completed:** Jan 12, 2026

**Results:**
- Tree-sitter extractor works correctly
- Correctly identifies: Keeper (struct), Handler (methods with Msg params), Message, Interface entities
- Creates CALLS edges (45 found in real keeper.go)
- Originally missing HANDLES edges (fixed in Phase 3)

**Test output:**
```
Entities detected:
  - Keeper: struct type
  - CreateBatch: Handler with params (ctx context.Context, msg *MsgCreateBatch)
  - Retire: Handler with params (ctx context.Context, msg *MsgRetire)
```

### Phase 2: Update Service to Use Tree-Sitter ⏳ NEXT STEP

**File:** `/opt/projects/koi-processor/src/core/code_graph_service.py`

**Status:** Ready to implement. Tree-sitter extractor is validated and HANDLES edges are working.

1. **Create a feature flag:**
   ```python
   USE_TREE_SITTER = os.environ.get('USE_TREE_SITTER', 'false').lower() == 'true'

   if USE_TREE_SITTER:
       from tree_sitter_extractor import TreeSitterExtractor
       extractor = TreeSitterExtractor()
   else:
       from code_graph_processor import CodeGraphProcessor
       extractor = CodeGraphProcessor(...)
   ```

2. **Update the extraction call:**
   ```python
   # Before:
   entities = processor.extract_entities(content, file_path, language, repo)

   # After:
   if USE_TREE_SITTER:
       entities, edges = extractor.extract(language, content, file_path, repo)
   else:
       entities = processor.extract_entities(content, file_path, language, repo)
       edges = []
   ```

3. **Test with flag OFF first** (ensure no regression)

4. **Test with flag ON** on a single file

### Phase 3: Add Missing Features to Tree-Sitter Extractor ✅ COMPLETE

**Completed:** Jan 12, 2026

**Changes made to `/opt/projects/koi-processor/src/core/tree_sitter_extractor.py`:**

1. **Added `import re`** (line 19) - For regex pattern matching

2. **Added HANDLES edge creation** (lines 177-192):
   ```python
   # Extract HANDLES edges for Handler entities
   if entity.entity_type == "Handler":
       msg_match = re.search(r'\*?(Msg\w+)', entity.params)
       if msg_match:
           msg_type = msg_match.group(1)
           handles_edge = CodeEdge(
               edge_id=generate_edge_id(entity.entity_id, msg_type, "HANDLES"),
               from_entity_id=entity.entity_id,
               to_entity_id=msg_type,
               edge_type="HANDLES",
               file_path=file_path,
               line_number=entity.line_start,
           )
           edges.append(handles_edge)
   ```

3. **Fixed method parameter extraction** (lines 396-419):
   - Added `params_captured` flag to distinguish between method params and return type
   - Fixed bug where params were being overwritten

**Verification:**
```
=== EDGES ===
  HANDLES: 4f58a53fc0c6a518 -> MsgCreateBatch
  HANDLES: 42d9224a16325b9a -> MsgRetire

Summary: 2 HANDLES edges, 0 CALLS edges
```

| Feature | Status |
|---------|--------|
| Go: structs, interfaces, functions | ✅ Working |
| Go: Keeper pattern detection | ✅ Working |
| Go: Message type detection (Msg*) | ✅ Working |
| Go: HANDLES edge extraction | ✅ Added |
| TypeScript: classes, functions | ✅ Working |
| Python: classes, functions | ✅ Working |
| Module detection from path | ⏳ Not yet needed |

### Phase 4: Re-Extract Codebase (Day 3-4)

1. **Backup current graph:**
   ```sql
   -- Create backup table
   SELECT * INTO code_entities_backup_20260113 FROM ag_catalog.cypher('regen_graph', $$
     MATCH (n) RETURN n
   $$) as (n agtype);
   ```

2. **Clear existing entities (or use new graph):**
   ```sql
   -- Option A: Clear and re-extract
   SELECT * FROM ag_catalog.cypher('regen_graph', $$
     MATCH (n) DETACH DELETE n
   $$) as (result agtype);

   -- Option B: Create new graph version
   SELECT * FROM ag_catalog.create_graph('regen_graph_v3');
   ```

3. **Trigger re-extraction:**
   ```bash
   # Enable tree-sitter
   export USE_TREE_SITTER=true

   # Re-index each repository
   curl -X POST http://localhost:8350/reindex \
     -H 'Content-Type: application/json' \
     -d '{"repo": "regen-ledger", "branch": "main"}'
   ```

4. **Monitor progress:**
   ```bash
   # Watch logs
   tail -f /var/log/koi-processor/code_graph.log

   # Check entity counts
   curl http://localhost:8350/stats
   ```

### Phase 5: Validate Results (Day 4-5)

1. **Check entity type distribution:**
   ```sql
   SELECT label, count(*)
   FROM ag_catalog.cypher('regen_graph', $$
     MATCH (n) RETURN label(n) as label
   $$) as (label agtype)
   GROUP BY label
   ORDER BY count DESC;
   ```

   **Expected:** More specific types (Function, Interface, Keeper, Message) vs generic "Entity"

2. **Check HANDLES edges exist:**
   ```sql
   SELECT count(*) FROM ag_catalog.cypher('regen_graph', $$
     MATCH ()-[r:HANDLES]->() RETURN r
   $$) as (r agtype);
   ```

   **Expected:** > 0 edges

3. **Test MCP queries:**
   ```bash
   # Test keeper_for_msg
   curl -X POST http://regen.gaiaai.xyz/api/koi/graph \
     -H 'Content-Type: application/json' \
     -d '{"query_type": "keeper_for_msg", "entity_name": "MsgRetire"}'
   ```

   **Expected:** Returns the Keeper that handles MsgRetire

4. **Run eval suite:**
   ```bash
   cd /path/to/koi-research
   npm run test:contract
   ```

---

## Rollback Plan

If tree-sitter extraction causes issues:

1. **Disable feature flag:**
   ```bash
   export USE_TREE_SITTER=false
   systemctl restart koi-code-graph
   ```

2. **Restore backup graph:**
   ```sql
   -- Drop new graph, restore backup
   SELECT * FROM ag_catalog.drop_graph('regen_graph', true);
   SELECT * FROM ag_catalog.create_graph('regen_graph');
   -- Restore from backup table...
   ```

3. **Revert code changes:**
   ```bash
   cd /opt/projects/koi-processor
   git checkout src/core/code_graph_service.py
   ```

---

## Success Criteria

| Metric | Before | Target |
|--------|--------|--------|
| Entity type accuracy | ~20% specific types | >80% specific types |
| HANDLES edges | 0 | >50 (for regen-ledger) |
| `keeper_for_msg` results | 0 | >0 for known messages |
| `find_by_type("Function")` | ~500 | >2000 |

---

## Timeline

| Day | Task | Owner |
|-----|------|-------|
| 1 | Validate tree-sitter extractor, add feature flag | Dev |
| 2 | Add missing relationship extraction | Dev |
| 3 | Backup graph, run re-extraction | Dev |
| 4 | Validate results, fix issues | Dev |
| 5 | Update MCP tools if needed, deploy | Dev |

**Total estimated effort:** 3-5 days

---

## Dependencies

- SSH access to production server
- PostgreSQL access for graph backup/restore
- Ability to restart koi-processor service
- Test repositories cloned for local testing

---

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Tree-sitter extractor has bugs | Medium | Test extensively before re-extraction |
| Re-extraction takes too long | Low | Can run incrementally per-repo |
| New graph breaks MCP queries | Medium | Feature flag allows quick rollback |
| Data loss | Low | Full backup before changes |
