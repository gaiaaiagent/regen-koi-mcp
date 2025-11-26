# Graph Tool Integration Example

This document shows exactly how to integrate the graph tool into your MCP server.

---

## Quick Start (5 Minutes)

### 1. Install Dependencies

```bash
cd /Users/darrenzal/projects/RegenAI/regen-koi-mcp
npm install pg
npm install --save-dev @types/pg
```

### 2. Move Files

```bash
# Move the TypeScript files to src/
mv "full stack tech agent/graph_client.ts" src/
mv "full stack tech agent/graph_tool.ts" src/
```

### 3. Update src/tools.ts

```typescript
/**
 * Tool definitions for Regen KOI MCP Server
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { GRAPH_TOOL } from './graph_tool.js';  // ← ADD THIS LINE

export const TOOLS: Tool[] = [
  {
    name: 'search_knowledge',
    description: 'Hybrid search across KOI (vectors + graph). Accepts optional published date range filter.',
    // ... rest of tool definition
  },
  // ... other existing tools ...
  GRAPH_TOOL,  // ← ADD THIS LINE
];
```

### 4. Update src/index.ts

Add the import at the top:

```typescript
import { executeGraphTool } from './graph_tool.js';  // ← ADD THIS LINE
```

Add the case in the switch statement (around line 100):

```typescript
switch (name) {
  case 'search_knowledge':
    return await this.searchKnowledge(args);
  // ... other cases ...
  case 'query_code_graph':  // ← ADD THIS CASE
    return await executeGraphTool(args);  // ← ADD THIS LINE
  default:
    throw new Error(`Unknown tool: ${name}`);
}
```

### 5. Add Environment Variables

Edit your `.env` file:

```bash
# Graph Database Configuration
GRAPH_DB_HOST=localhost
GRAPH_DB_PORT=5432
GRAPH_DB_NAME=koi
GRAPH_NAME=regen_graph
# GRAPH_DB_USER=your_username    # Optional
# GRAPH_DB_PASSWORD=your_password # Optional
```

### 6. Build and Run

```bash
npm run build
npm start
```

---

## Testing the Integration

### Option 1: Using Claude Desktop

If you have Claude Desktop configured with your MCP server:

1. Ask Claude: "What Keeper handles MsgCreate?"
2. Claude will use the `query_code_graph` tool automatically

### Option 2: Using the Test Script

```bash
cd "/Users/darrenzal/projects/RegenAI/regen-koi-mcp/full stack tech agent"
npx tsx test-graph-tool.ts
```

Expected output:
```
╔══════════════════════════════════════════════════════════════════════════════╗
║                    GRAPH TOOL TEST SUITE                                     ║
╚══════════════════════════════════════════════════════════════════════════════╝

================================================================================
TEST: Graph Statistics
================================================================================

Graph Statistics:
Node counts: { Keeper: 3, Msg: 60 }
Edge counts: { HANDLES: 60 }

================================================================================
TEST 1: keeper_for_msg
================================================================================

Markdown Response:
# Keeper for Message: MsgCreate

Found **1** Keeper(s) that handle **MsgCreate**:

## 1. Keeper

- **File:** `/Users/darrenzal/projects/RegenAI/regen-ledger/x/ecocredit/basket/keeper/keeper.go`
- **Line:** 19
- **Relationship:** HANDLES → MsgCreate

✅ ALL TESTS COMPLETED
```

### Option 3: Direct Database Query

Verify data exists in your graph:

```bash
psql koi -c "SELECT * FROM cypher('regen_graph', \$\$
  MATCH (n)
  RETURN labels(n)[0] as type, count(*) as count
\$\$) as (type agtype, count agtype);"
```

Expected output:
```
  type   | count
---------+-------
 Keeper  | 3
 Msg     | 60
```

---

## Example Claude Queries

Once integrated, Claude can answer questions like:

### Query 1: "What Keeper handles MsgCreateBatch?"
Claude will use:
```json
{
  "tool": "query_code_graph",
  "query_type": "keeper_for_msg",
  "entity_name": "MsgCreateBatch"
}
```

Response:
```markdown
The basket keeper handles MsgCreateBatch.

File: /Users/darrenzal/.../basket/keeper/keeper.go:19
```

### Query 2: "What messages does the basket Keeper handle?"
Claude will use:
```json
{
  "tool": "query_code_graph",
  "query_type": "msgs_for_keeper",
  "entity_name": "Keeper"
}
```

### Query 3: "Show me related entities to MsgCreate"
Claude will use:
```json
{
  "tool": "query_code_graph",
  "query_type": "related_entities",
  "entity_name": "MsgCreate"
}
```

---

## Verifying Integration

### Checklist

- [ ] `pg` package installed
- [ ] Files moved to `src/` directory
- [ ] `GRAPH_TOOL` imported in `src/tools.ts`
- [ ] Tool added to `TOOLS` array
- [ ] `executeGraphTool` imported in `src/index.ts`
- [ ] Case added to switch statement
- [ ] Environment variables configured
- [ ] TypeScript compiled successfully (`npm run build`)
- [ ] MCP server starts without errors
- [ ] Test script passes
- [ ] Claude can use the tool (if using Claude Desktop)

### Common Issues

**Issue:** "Cannot find module 'pg'"
```bash
npm install pg @types/pg
```

**Issue:** "Database connection refused"
```bash
# Check PostgreSQL is running
pg_isready

# Check database exists
psql -l | grep koi
```

**Issue:** "Graph 'regen_graph' does not exist"
```bash
psql koi -c "SELECT * FROM ag_catalog.create_graph('regen_graph');"
```

---

## Next Steps

1. **Populate Document Nodes:** Run `create_mentions.py` (once fixed) to add Document nodes and MENTIONS edges
2. **Add More Query Types:** Extend `graph_tool.ts` with custom queries
3. **Optimize Performance:** Add indexes for frequently queried properties
4. **Monitor Usage:** Track which queries Claude uses most

---

## Complete File Paths

For reference:

- **Graph Client:** `/Users/darrenzal/projects/RegenAI/regen-koi-mcp/src/graph_client.ts`
- **Graph Tool:** `/Users/darrenzal/projects/RegenAI/regen-koi-mcp/src/graph_tool.ts`
- **Test Script:** `/Users/darrenzal/projects/RegenAI/regen-koi-mcp/full stack tech agent/test-graph-tool.ts`
- **Documentation:** `/Users/darrenzal/projects/RegenAI/regen-koi-mcp/full stack tech agent/GRAPH_TOOL_REPORT.md`

---

**Integration Time:** ~5 minutes
**Testing Time:** ~2 minutes
**Total:** ~7 minutes to full working integration
