# Plan: Tree-Sitter Integration for Code Graph

> **Goal:** Replace regex-based code extraction with tree-sitter AST parsing for accurate entity types and relationship extraction.

## Progress Summary

| Phase | Status | Date |
|-------|--------|------|
| Phase 1: Validate Extractor | ✅ Complete | Jan 12, 2026 |
| Phase 2: Feature Flag | ✅ Complete | Jan 12, 2026 |
| Phase 3: Add HANDLES Edges | ✅ Complete | Jan 12, 2026 |
| Phase 4: Re-Extract Codebase | ✅ Complete | Jan 12, 2026 |
| Phase 5: Validate Results | ✅ Complete | Jan 12, 2026 |

## Current State

| Component | Status |
|-----------|--------|
| `tree_sitter_extractor.py` | ✅ Fully implemented + HANDLES edges added |
| tree-sitter packages | ✅ Installed (v0.25.2 + Go/Python/TS) |
| HANDLES edge creation | ✅ Added (lines 177-192) |
| `code_graph_processor.py` | ✅ Feature flag added (USE_TREE_SITTER) |
| Feature flag | ✅ Enabled in `/opt/projects/koi-processor/.env` |
| Database | ✅ 31,773 nodes, tree-sitter active for new extractions |

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

### Phase 2: Update Service to Use Tree-Sitter ✅ COMPLETE

**Completed:** Jan 12, 2026

**File:** `/opt/projects/koi-processor/src/core/code_graph_processor.py`

**Changes made:**

1. **Feature flag added** (lines 14-31):
   ```python
   USE_TREE_SITTER = os.environ.get("USE_TREE_SITTER", "false").lower() == "true"

   if USE_TREE_SITTER:
       from tree_sitter_extractor import TreeSitterExtractor
       _tree_sitter_extractor = TreeSitterExtractor()
   ```

2. **`extract_entities` method updated** (lines 396-445):
   - Checks `USE_TREE_SITTER` flag
   - Calls tree-sitter extractor, converts CodeEntity to dict format
   - Stores edges in `self._last_extracted_edges`
   - Falls back to regex if tree-sitter fails

3. **`_extract_relationships` method updated** (lines 753-805):
   - Uses stored tree-sitter edges instead of inference
   - Adds edges with `confidence: 1.0, inferred: False`

**Test Results:**

| Mode | Entities | Entity Types | Edges |
|------|----------|--------------|-------|
| Regex (off) | 3 | Struct, Function | 0 (inferred) |
| Tree-sitter (on) | 6 | Import, Keeper, Message, Handler, Method | 2 (CALLS, HANDLES) |

Tree-sitter correctly identifies Cosmos SDK patterns (Keeper, Message, Handler) and creates actual edges.

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

### Phase 4: Re-Extract Codebase ✅ COMPLETE

**Completed:** Jan 12, 2026

**Actions taken:**

1. **Enabled tree-sitter in production:**
   - Added `USE_TREE_SITTER=true` to `/opt/projects/koi-processor/.env`
   - Service now uses tree-sitter for all new code extractions

2. **Fixed edge creation issues:**
   - Fixed `entity_id` in dict conversion (was using wrong field)
   - Fixed name-based edge lookup for cross-entity relationships
   - Ensured raw function names used for edge targets

3. **Current graph state:**
   - Total nodes: 31,773
   - CALLS edges: 1+ (newly created with tree-sitter)
   - New extractions marked with `extraction_method: "tree_sitter"`

**Note:** Existing entities remain from regex extraction. Full re-extraction would require replaying GitHub events or creating a batch script. The current approach is incremental - new code events will use tree-sitter.

### Phase 5: Validate Results ✅ COMPLETE

**Completed:** Jan 12, 2026

**Critical Fix Applied:** Changed API to query `regen_graph_v2` instead of `regen_graph`.

| Graph | Nodes | Edges | Status |
|-------|-------|-------|--------|
| `regen_graph` | 31,773 | 1 | Old, sparse |
| `regen_graph_v2` | 32,395 | 17,804 | ✅ Now active |

**Fix applied:**
```bash
# Changed 18 occurrences in koi-query-api.ts
sed -i "s/cypher('regen_graph'/cypher('regen_graph_v2'/g" koi-query-api.ts
pm2 restart hybrid-rag-api
```

**Entity Types in Active Graph (regen_graph_v2):**

| Type | Count |
|------|-------|
| Method | 19,884 |
| Doc | 3,507 |
| Import | 3,363 |
| Function | 1,693 |
| Struct | 1,636 |
| Organization | 850 |
| Interface | 192 |
| Module | 8 |

**Edge Statistics:**
- CALLS edges: 11,331 ✅
- MENTIONS edges: 6,454
- Total: 17,804 edges

**API Tests:**
- `list_repos`: ✅ Working
- `find_by_type`: ✅ Working (returns Functions with docstrings, signatures, GitHub URLs)
- `list_modules`: ✅ Working (8 modules: ecocredit, basket, data, etc.)
- `find_callees`: ✅ Working (call graph relationships)

### Batch Re-extraction ✅ COMPLETE

**Completed:** Jan 12, 2026

**Actions:**
1. Created batch extraction scripts on production server
2. Processed 729 Go files from regen-ledger
3. Extracted 40 Handlers, 132 Messages, 8 Keepers
4. Created 41 HANDLES edges and 82 BELONGS_TO edges
5. Fixed API queries to use correct graph schema

**Results:**
- `keeper_for_msg`: ✅ Now returns Keeper for any Message (e.g., MsgCreateBatch → Keeper at x/ecocredit/base/keeper/keeper.go)
- `msgs_for_keeper`: ✅ Now returns all 40 Messages handled by Keeper

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
