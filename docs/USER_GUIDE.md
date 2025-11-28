# KOI MCP Server - User Guide

**Version:** 1.1.0
**Last Updated:** 2025-11-27

Welcome to the Regen KOI (Knowledge Organization Infrastructure) MCP Server! This guide will help you get started and make the most of the system.

---

## Table of Contents

1. [What is KOI?](#what-is-koi)
2. [Installation](#installation)
3. [Quick Start](#quick-start)
4. [Common Use Cases](#common-use-cases)
5. [All Available Tools](#all-available-tools)
6. [Performance Tips](#performance-tips)
7. [Troubleshooting](#troubleshooting)
8. [FAQ](#faq)

---

## What is KOI?

**KOI (Knowledge Organization Infrastructure)** is a distributed knowledge management system developed collaboratively by BlockScience, Metagov, and RMIT. For Regen Network, KOI provides a comprehensive knowledge layer spanning all organizational knowledge—not just code.

### Data Sources

KOI ingests knowledge from **12 active sensors** monitoring diverse platforms:

| Platform | Content Type |
|----------|-------------|
| GitHub/GitLab | Code, documentation, issues, PRs |
| Discourse | Forum discussions, proposals |
| Medium | Blog posts, articles |
| Telegram/Discord | Community conversations |
| Twitter/X | Social updates, announcements |
| Podcasts | Audio transcripts |
| Notion | Internal docs, notes |
| Websites | Handbooks, guides, landing pages |
| Ledger | On-chain data, transactions |

### What's Indexed

- **15,000+ documents** across all platforms
- **26,768 code entities** from Go codebases (regen-ledger, etc.)
- **11,331 CALLS edges** for function call relationships
- **10 domain concepts** (Credit Class, Credit Batch, Credit Retirement, etc.)
- **Semantic embeddings** (BGE 1024-dim vectors) for all content

### Key Capabilities

- **Semantic search** - Find information by meaning, not just keywords
- **Hybrid search** - Combines vector similarity + knowledge graph + keyword matching
- **Code navigation** - Trace function calls, find dependencies, detect orphan code
- **Concept grounding** - Understand domain terms through linked code and docs
- **Cross-platform discovery** - Search across GitHub, Discourse, Medium, and more
- **Real-time updates** - Sensors continuously monitor and ingest new content

---

## Installation

### Prerequisites

- **Node.js** 18+ or 20+
- **Claude Desktop** or **Claude Code** (any MCP-compatible client)
- **Internet access** (connects to remote KOI API)

### Method 1: NPM Install (Recommended)

```bash
# Install globally
npm install -g regen-koi-mcp

# Verify installation
regen-koi-mcp --version
```

### Method 2: Local Development

```bash
# Clone repository
git clone https://github.com/gaiaaiagent/regen-koi-mcp.git
cd regen-koi-mcp

# Install dependencies
npm install

# Build TypeScript
npm run build

# Test locally
npm run dev
```

### Configure Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on Mac):

```json
{
  "mcpServers": {
    "regen-koi": {
      "command": "npx",
      "args": ["-y", "regen-koi-mcp"]
    }
  }
}
```

**Or for local development:**

```json
{
  "mcpServers": {
    "regen-koi": {
      "command": "node",
      "args": ["/path/to/regen-koi-mcp/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop after updating the config.

---

## Quick Start

### Your First Query

Open Claude Desktop and try:

```
Find all functions related to credit retirement
```

Claude will use the `search_knowledge` or `hybrid_search` tools to find relevant code and documentation.

### Verify It's Working

Ask Claude:

```
Use the get_mcp_metrics tool to show me the server health
```

You should see metrics like uptime, cache hit rate, and query latencies.

---

## Common Use Cases

### 1. Understanding a Domain Concept

**Goal:** Learn what "Credit Batch" means and see the code that implements it.

**Query:**
```
What is a Credit Batch in Regen Network? Show me the code.
```

**What Happens:**
- Claude uses `hybrid_search` to find the concept
- Returns documentation explaining Credit Batch
- Shows code entities (MsgCreateBatch, Batch struct, etc.)
- Links to actual file locations with line numbers

**Example Output:**
```
Credit Batch is a discrete batch of issued credits...

Related code entities:
- MsgCreateBatch (Handler) - x/ecocredit/base/keeper/msg_create_batch.go:22
- Batch (Struct) - api/regen/ecocredit/v1/state.regen_orm.go:45
- BatchTable (Interface) - api/regen/ecocredit/v1/state.regen_orm.go:267
```

---

### 2. Finding Code by Functionality

**Goal:** Find all keeper functions in the ecocredit module.

**Query:**
```
Find all keeper functions in the ecocredit module
```

**What Happens:**
- Claude uses `query_code_graph` with `find_by_type` query
- Filters by domain_type: "keeper"
- Returns structured entity list

**Example Output:**
```
Found 8 keeper structs:
1. Keeper - x/ecocredit/base/keeper/keeper.go:45
   Methods: CreateBatch, Retire, Cancel, Send, etc.
2. BasketKeeper - x/ecocredit/basket/keeper/keeper.go:23
   Methods: Create, Put, Take, etc.
...
```

---

### 3. Impact Analysis

**Goal:** Understand what will break if I modify the `CreateBatch` function.

**Query:**
```
What calls the CreateBatch function? I want to understand the impact of changing it.
```

**What Happens:**
- Claude uses `query_code_graph` with `find_callers` query type
- Returns all functions that call CreateBatch
- Shows call sites with file paths and line numbers

**Example Output:**
```
Found 50 callers of CreateBatch:

Direct callers:
- _Msg_CreateBatch_Handler (gRPC handler)
- createClassAndIssueBatch (test helper)
- TestScenario (integration test)

Indirect callers (via gRPC):
- msgClient.CreateBatch (API client)
...

Impact: Changing CreateBatch affects 50+ call sites, including:
- 4 gRPC handlers
- 12 integration tests
- 34 API clients
```

---

### 4. Dependency Tracing

**Goal:** See what functions `CreateBatch` depends on.

**Query:**
```
What functions does CreateBatch call? Show me its dependencies.
```

**What Happens:**
- Claude uses `query_code_graph` with `find_callees` query type
- Returns all functions called by CreateBatch
- Shows database operations, validation, and business logic

**Example Output:**
```
CreateBatch calls 25 functions:

Database operations:
- BatchTable.Insert (creates batch record)
- ClassTable.GetById (validates class exists)
- ProjectTable.GetById (validates project exists)

Validation:
- ValidateDenom (checks credit denomination)
- ValidateDates (checks start/end dates)

State updates:
- BatchBalanceTable.Insert (sets initial balance)
- BatchSupplyTable.Insert (tracks total supply)
...
```

---

### 5. Finding Dead Code

**Goal:** Identify unused functions that can be safely removed.

**Query:**
```
Find orphaned code - functions that are never called
```

**What Happens:**
- Claude uses `query_code_graph` with `find_orphaned_code` query type
- Returns entities with no incoming CALLS edges
- Distinguishes between dead code and entry points

**Example Output:**
```
Found 100 orphaned functions:

Generated code (safe to ignore):
- encodeVarintEvents (protobuf codegen)
- sozEvents (protobuf codegen)
- RegisterQueryHandler (framework registration)

Potentially unused:
- CheckDuplicateKey (utility function)
- CoinsToProtoCoins (conversion helper)
- NewDefaultGenesisState (initialization)

Note: Some "orphaned" functions are entry points (main, handlers, exported APIs).
Verify before deleting!
```

---

### 6. Searching Documentation

**Goal:** Find documentation about governance voting.

**Query:**
```
Search the documentation for information about governance voting
```

**What Happens:**
- Claude uses `search_knowledge` or `search_github_docs`
- Semantic search across 34k+ embedded documents
- Returns relevant docs with snippets and links

**Example Output:**
```
Found 5 relevant documents:

1. Governance Module Overview (0.87 similarity)
   x/gov/spec/01_concepts.md
   "The governance module enables on-chain proposal voting..."

2. Voting Procedures (0.82 similarity)
   x/gov/spec/03_messages.md
   "Vote messages allow token holders to cast votes..."

3. Proposal Lifecycle (0.78 similarity)
   docs/governance.md
   "Proposals go through deposit → voting → execution phases..."
...
```

---

### 7. Repository Overview

**Goal:** Get a high-level understanding of the regen-ledger repository.

**Query:**
```
Give me an overview of the regen-ledger repository
```

**What Happens:**
- Claude uses `get_repo_overview` tool
- Returns README, key files, module structure
- Links to documentation

**Example Output:**
```
# regen-ledger

Regen Ledger is a blockchain for ecological assets and credits.

Key modules:
- x/ecocredit - Credit issuance and retirement
- x/basket - Credit basket management
- x/data - Data anchoring and attestation
- x/marketplace - Credit trading

Documentation:
- README.md
- CONTRIBUTING.md
- docs/architecture/
...
```

---

### 8. Technology Stack

**Goal:** Understand what technologies are used.

**Query:**
```
What's the tech stack for regen-ledger?
```

**What Happens:**
- Claude uses `get_tech_stack` tool
- Returns languages, frameworks, dependencies

**Example Output:**
```
Technology Stack:

Languages:
- Go (primary blockchain code)
- TypeScript (API and frontend)
- Protobuf (interface definitions)

Frameworks:
- Cosmos SDK (blockchain framework)
- Apache AGE (graph database)
- PostgreSQL (data storage)

Key Dependencies:
- gRPC (RPC framework)
- ORM (object-relational mapping)
...
```

---

### 9. Graph Traversal

**Goal:** See the full call graph around a function.

**Query:**
```
Show me the call graph for CreateBatch - both what calls it and what it calls
```

**What Happens:**
- Claude uses `query_code_graph` with `find_call_graph` query type
- Returns local call graph (callers + callees)
- Shows full picture of function relationships

**Example Output:**
```
Call graph for CreateBatch:

Callers (who calls this):
- _Msg_CreateBatch_Handler (gRPC entry point)
- TestScenario (test)

CreateBatch (center)
|
├─ Calls these functions:
│  ├─ BatchTable.Insert (DB)
│  ├─ ClassTable.GetById (validation)
│  ├─ ProjectTable.GetById (validation)
│  └─ BatchBalanceTable.Insert (state)
```

---

### 10. Monitoring Server Health

**Goal:** Check if the MCP server is healthy and performing well.

**Query:**
```
Show me the MCP server metrics and health status
```

**What Happens:**
- Claude uses `get_mcp_metrics` tool
- Returns uptime, latencies, cache hit rates, errors

**Example Output:**
```
# KOI MCP Server Metrics

Uptime: 3600s (1 hour)

## Cache
- Hit Rate: 67.5%
- Hits: 234 | Misses: 112

## API Calls
- Total: 346
- Error Rate: 1.2%
- Latency: p50=45ms, p95=125ms, p99=210ms

## Tools
| Tool              | Queries | Success Rate | p95 Latency |
|-------------------|---------|--------------|-------------|
| query_code_graph  | 145     | 98.6%        | 110ms       |
| search_knowledge  | 89      | 100%         | 95ms        |
| hybrid_search     | 67      | 100%         | 105ms       |
| find_callers      | 23      | 100%         | 125ms       |
| find_callees      | 22      | 100%         | 118ms       |
```

---

## All Available Tools

The KOI MCP server provides 9 tools:

| Tool | Purpose | Example Use |
|------|---------|-------------|
| **query_code_graph** | Search code graph with 14 query types | Find keepers, trace calls, find modules |
| **search_knowledge** | Semantic search across documents | Find docs about governance |
| **hybrid_search** | Combined graph + vector search | General "find X" queries |
| **search_github_docs** | Search docs in specific repos | Search regen-ledger docs only |
| **get_repo_overview** | Get repository summary | Learn about regen-web |
| **get_tech_stack** | Show technology stack | What languages are used? |
| **get_stats** | Database statistics | How many entities indexed? |
| **generate_weekly_digest** | Activity summary | What happened this week? |
| **get_mcp_metrics** | Server health and performance | Is the server healthy? |

**See [API_REFERENCE.md](./API_REFERENCE.md) for complete parameter details.**

---

## Performance Tips

### 1. Use Caching Effectively

The server caches results for up to 1 hour (static data) or 5 minutes (dynamic queries).

**Good:**
```
# First query: cache miss (slower)
Find all keepers in ecocredit module

# Second query (same): cache hit (faster!)
Find all keepers in ecocredit module
```

**Cache Hit Rates:**
- Static queries (list_repos, get_tech_stack): ~90% hit rate
- Dynamic queries (search): ~50% hit rate
- Volatile queries (get_stats): Not cached

### 2. Be Specific

**Slow:**
```
Find everything related to credits
```
Returns 1000s of results, slow to process.

**Fast:**
```
Find the MsgRetire handler for credit retirement
```
Returns 1-5 results, fast.

### 3. Use Graph Queries for Entities

**Slow (semantic search):**
```
Find the CreateBatch function
```
Uses vector search, slower.

**Fast (graph query):**
```
Use query_code_graph with find_by_type to find handlers
```
Direct graph query, much faster.

### 4. Check Server Health

If queries are slow:
```
Show me get_mcp_metrics
```

Look for:
- **High error rate** (>5%) → Server issues
- **Low cache hit rate** (<30%) → Queries not reused
- **High p95 latency** (>500ms) → Database slow

---

## Troubleshooting

### "Tool not found" Error

**Problem:** Claude says it doesn't have access to KOI tools.

**Solution:**
1. Check Claude Desktop config file
2. Restart Claude Desktop after editing config
3. Verify MCP server is installed: `npx regen-koi-mcp --version`

### Slow Queries

**Problem:** Queries take >5 seconds to complete.

**Check:**
1. Run `get_mcp_metrics` to check server health
2. Check if query is too broad (narrow it down)
3. Check internet connection (server is remote)

**Expected Latencies:**
- Graph queries: 50-150ms
- Semantic search: 100-300ms
- Complex traversal: 200-500ms

### Validation Errors

**Problem:** Error says "Validation failed: Invalid characters"

**Cause:** Input contains SQL/Cypher injection patterns

**Solution:**
- Use only letters, numbers, underscores, hyphens
- Avoid special characters: `;`, `'`, `"`, `--`, `/*`, `*/`

### Empty Results

**Problem:** Query returns 0 results but you expect results.

**Possible Causes:**
1. **Typo in entity name** → Try search instead of exact match
2. **Entity doesn't exist** → Use search_knowledge for docs
3. **Wrong repository** → Check which repos are indexed

**Debug:**
```
# See what's indexed
Use get_stats with detailed=true

# See available entity types
Use query_code_graph with list_entity_types
```

### Circuit Breaker Open

**Problem:** Error says "Circuit breaker is open for graph-api"

**Cause:** Too many failures to backend API (5+ in a row)

**Solution:**
- Wait 60 seconds for circuit to reset
- Check `get_mcp_metrics` for error details
- If persistent, backend API may be down

---

## FAQ

### Q: What repositories are indexed?

**A:** Currently 4 repositories:
- **regen-ledger** (18,619 entities) - Blockchain code
- **regen-web** (3,164 entities) - Frontend
- **koi-sensors** (1,250 entities) - Data sensors
- **regen-data-standards** (6 entities) - Data schemas

### Q: What languages are supported?

**A:** Currently **Go only** for code entities. TypeScript/Python extraction coming soon.

Documentation is indexed for all languages (Markdown, TypeScript, Go, Protobuf, etc.).

### Q: How fresh is the data?

**A:** Data is updated periodically (not real-time). Current data:
- **Code extraction:** Last run 2025-11-27
- **Documentation:** Synced with GitHub daily
- **Concepts:** Manually curated

### Q: Can I search private repositories?

**A:** Not currently. Only public Regen Network repositories are indexed.

### Q: How do I request a new feature?

**A:** Open an issue at: https://github.com/gaiaaiagent/regen-koi-mcp/issues

### Q: Why are some queries slow?

**A:** Several factors:
- **Large result sets** → Narrow your query
- **Cold cache** → First query is slower, second is cached
- **Complex traversal** → Deep call graphs take longer
- **Semantic search** → Vector similarity is compute-intensive

**Tip:** Check `get_mcp_metrics` for performance breakdown.

### Q: What's the difference between search_knowledge and hybrid_search?

**A:**
- **search_knowledge:** Pure semantic search over documents (vector only)
- **hybrid_search:** Combines graph + vector search (smarter routing)

**Use hybrid_search** for general queries. Use search_knowledge when you specifically want docs.

### Q: How accurate is semantic search?

**A:** Semantic search uses BGE 1024-dim embeddings:
- **Good:** Finding docs by meaning ("governance voting" finds x/gov/spec)
- **OK:** Finding code by functionality (works but graph queries are better)
- **Poor:** Exact entity names (use graph queries instead)

### Q: Can I run this locally without internet?

**A:** Not currently. The MCP server connects to a remote API and database.

For local development, you'd need to:
1. Run PostgreSQL + Apache AGE locally
2. Index repositories yourself
3. Update `.env` to point to localhost

### Q: What does "N/A" in results mean?

**A:** This was a bug in earlier versions (now fixed). If you see "N/A", update to latest version:
```bash
npm update -g regen-koi-mcp
```

### Q: How do I report a bug?

**A:** Please open an issue with:
1. Your query (what you asked Claude)
2. What happened (error message or unexpected result)
3. What you expected
4. Output of `get_mcp_metrics`

GitHub Issues: https://github.com/gaiaaiagent/regen-koi-mcp/issues

---

## Getting Help

**Documentation:**
- [API Reference](./API_REFERENCE.md) - Complete tool documentation
- [Deployment Guide](./DEPLOYMENT.md) - Server setup and operations
- [Technical Project Tracking](./TECHNICAL_ASSISTANT_PROJECT.md) - Development history

**Community:**
- GitHub Issues: https://github.com/gaiaaiagent/regen-koi-mcp/issues
- Regen Network Discord: https://discord.gg/regen-network

**Tips for Better Results:**
1. Be specific in your queries
2. Use graph queries for code entities, semantic search for docs
3. Check `get_mcp_metrics` if something seems slow
4. Include repository name if searching specific repos

---

**Happy exploring! 🌱**
