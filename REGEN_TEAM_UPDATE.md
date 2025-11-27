# 🌱 Regen KOI MCP - Team Update

## 🎉 What's New

We've significantly expanded the Regen KOI MCP server with **Code Graph Intelligence** - enabling AI agents to understand and navigate the Regen Network codebase through entity relationships and semantic search.

---

## 🚀 New Capabilities

### 1. **Code Knowledge Graph (Apache AGE)**
Query code entities and their relationships across all Regen repositories:

- **Entity Types:** Functions, Classes, Interfaces, Keepers, Messages, Events, Queries, Handlers, Sensors
- **Relationships:** HANDLES, CALLS, IMPLEMENTS, MENTIONS, BELONGS_TO
- **RAPTOR Modules:** Hierarchical module summaries for better code navigation

**Configured Repositories:**
- `regen-ledger` (blockchain core)
- `regen-web` (frontend)
- `regen-data-standards` (schemas)
- `koi-sensors` (data collectors)
- `koi-processor` (event processing)
- `koi-research` (experimental)
- `regen-koi-mcp` (this MCP server)

### 2. **13 Graph Query Types**

| Query Type | Purpose | Example |
|------------|---------|---------|
| `list_repos` | Show all indexed repositories | See what codebases are available |
| `find_by_type` | Get all entities of a type | Find all Sensors, Handlers, or Keepers |
| `search_entities` | Search by name | Find `MsgCreateBatch` across repos |
| `keeper_for_msg` | Find Keeper handling a Message | Which Keeper handles `MsgSend`? |
| `msgs_for_keeper` | List Messages a Keeper handles | What does `BasketKeeper` handle? |
| `related_entities` | Find related code | What's connected to `CreditType`? |
| `docs_mentioning` | Docs that mention an entity | Where is `ValidatorSet` documented? |
| `entities_in_doc` | Entities mentioned in doc | What code is in this README? |
| `list_modules` | Show all RAPTOR modules | See module hierarchy |
| `get_module` | Get module details | Info about `ecocredit` module |
| `search_modules` | Search modules by keyword | Modules related to "governance" |
| `module_entities` | Entities in a module | All code in `basket` module |
| `module_for_entity` | Find entity's parent module | Which module is `Keeper` in? |

### 3. **Intelligent Hybrid Search**
Automatically routes queries to the best data source:
- **Graph queries:** "What Keepers handle MsgCreateBatch?"
- **Vector queries:** "How does carbon credit retirement work?"
- **Hybrid fusion:** Combines both for comprehensive answers

### 4. **8 MCP Tools Total**

1. ✅ **`query_code_graph`** - Code entity & relationship queries
2. ✅ **`hybrid_search`** - Auto-routed graph + vector search
3. ✅ **`search_knowledge`** - 15,000+ docs (podcasts, discussions, docs) with date filtering
4. ✅ **`get_stats`** - Knowledge base statistics
5. ✅ **`generate_weekly_digest`** - Activity summaries
6. ✅ **`search_github_docs`** - Search 4 Regen repos
7. ✅ **`get_repo_overview`** - Structured repo information
8. ✅ **`get_tech_stack`** - Technology stack details

---

## 🎯 Example Use Cases

### Developer Onboarding
```
Using Regen KOI MCP:

1. Get overview of regen-ledger repository
2. Show me the tech stack
3. List all modules in the codebase
4. What entities are in the ecocredit module?
5. Show me how MsgCreateBatch flows through the system
```

**Value:** New developers can map the entire codebase in minutes instead of days.

---

### Code Review & Architecture Analysis
```
Using Regen KOI MCP:

1. Find all Keepers in regen-ledger
2. Show me which Messages each Keeper handles
3. What entities are related to the basket credit system?
4. Search for "validator" entities across all repos
```

**Value:** Understand cross-cutting concerns and architectural patterns instantly.

---

### Documentation + Code Sync
```
Using Regen KOI MCP:

1. Search discussions about "credit retirement" from last 30 days
2. Find the code entities that implement retirement
3. Show me docs that mention CreditRetire
4. What modules handle the retirement flow?
```

**Value:** Connect community conversations directly to implementation.

---

### Technical Deep Dives
```
Using Regen KOI MCP:

1. Show me the tech stack for regen-web
2. Find all TypeScript interfaces in regen-data-standards
3. What Sensors exist in koi-sensors?
4. How do they connect to the event processing pipeline?
```

**Value:** Rapidly navigate unfamiliar parts of the codebase.

---

## 🏗️ Architecture

```
┌─────────────────┐
│   AI Agents     │
│ (Claude, etc)   │
└────────┬────────┘
         │ MCP Protocol
┌────────▼────────┐
│  Regen KOI MCP  │
│   (This Repo)   │
└────────┬────────┘
         │ HTTP API
┌────────▼──────────────────────────────┐
│  KOI API Server (regen.gaiaai.xyz)    │
│  ┌──────────────┬──────────────────┐  │
│  │ Code Graph   │  Vector Search   │  │
│  │ (Apache AGE) │  (pgvector)      │  │
│  └──────────────┴──────────────────┘  │
└────────▲──────────────────────────────┘
         │
┌────────▼────────┐
│  Data Pipeline  │
├─────────────────┤
│ • GitHub Sensor │
│ • Event Bridge  │
│ • Code Graph    │
│   Processor     │
└─────────────────┘
```

### Data Flow

1. **GitHub Sensor** (koi-sensors) monitors repos for code changes
2. **Coordinator** (port 8005) receives events
3. Events forwarded to **both**:
   - **Event Bridge v2** (port 8100) → pgvector embeddings
   - **Code Graph Service** (port 8350) → Apache AGE entities
4. **API Server** (port 8301) serves unified queries
5. **MCP Client** consumes via `https://regen.gaiaai.xyz/api/koi`

---

## 📊 Current Status

### ✅ Fully Operational
- Vector knowledge base: 15,000+ documents
- GitHub docs search: 4 repositories
- Hybrid search & query routing
- Weekly digest generation
- Public API: `https://regen.gaiaai.xyz/api/koi`

### ⚠️ Ready for Indexing
- Code Graph Service configured (port 8350)
- 7 repositories configured for graph indexing
- Waiting for GitHub events to trigger entity extraction
- Apache AGE database ready (`regen_graph`)

**Next Step:** Once GitHub Sensor sends code change events, the Code Graph Processor will automatically extract entities and populate the graph.

---

## 🔧 Installation

### One-Line Install (Easiest!)
```bash
curl -fsSL https://raw.githubusercontent.com/gaiaaiagent/regen-koi-mcp/main/install.sh | bash
```

### NPM (Auto-Updates)
```json
{
  "mcpServers": {
    "regen-koi": {
      "command": "npx",
      "args": ["-y", "regen-koi-mcp@latest"],
      "env": {
        "KOI_API_ENDPOINT": "https://regen.gaiaai.xyz/api/koi"
      }
    }
  }
}
```

Add to:
- **Mac**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

Then restart Claude Desktop. ✅

---

## 🎯 Unique Value Propositions

### 1. **Only Regen-Specific AI Knowledge Base**
- Trained on Regen Network docs, podcasts, community discussions
- Understands ecological assets, carbon credits, basket credits
- No generic blockchain knowledge - Regen-focused

### 2. **Code + Context Integration**
- Links code entities to documentation
- Connects community discussions to implementations
- Shows architectural relationships

### 3. **Multi-Repository Intelligence**
- Searches across regen-ledger, regen-web, regen-data-standards, regenie-corpus
- Understands cross-repo dependencies
- Unified view of the entire ecosystem

### 4. **Developer Productivity**
- Onboard new devs in minutes, not days
- Navigate unfamiliar code instantly
- Understand architectural decisions

### 5. **Zero Setup for End Users**
- Hosted API - no local deployment needed
- One-line install
- Auto-updates via npx

---

## 🐛 Known Issues & Fixes

### Issue: "localhost:8301" Connection Errors

**Cause:** Claude caches MCP configurations in `~/.claude.json`. If you previously ran a local dev server, it may have cached `localhost` URLs.

**Fix:**
```bash
# Check for localhost configs
grep -i "localhost.*8301\|localhost.*8910" ~/.claude.json

# Replace with public API
sed -i '' 's|http://localhost:8301/api/koi|https://regen.gaiaai.xyz/api/koi|g' ~/.claude.json
sed -i '' 's|http://localhost:8910/api/koi|https://regen.gaiaai.xyz/api/koi|g' ~/.claude.json

# Restart Claude Code/Desktop
```

**Prevention:** Always use `https://regen.gaiaai.xyz/api/koi` in MCP configs unless actively developing the API server.

---

## 📖 Resources

- **GitHub:** https://github.com/gaiaaiagent/regen-koi-mcp
- **API Endpoint:** https://regen.gaiaai.xyz/api/koi
- **Documentation:** See README.md and ARCHITECTURE.md
- **Support:** GitHub Issues

---

## 🙏 Acknowledgments

Built for the Regen Network community to accelerate developer onboarding, code navigation, and architectural understanding.

**Architecture Components:**
- Apache AGE (graph database)
- pgvector (embeddings)
- FastAPI (Python API server)
- Model Context Protocol (AI agent integration)

---

## 📝 Next Steps

1. **Trigger graph indexing** by pushing code changes to monitored repos
2. **Test all query types** once entities are indexed
3. **Gather feedback** from Regen developers
4. **Iterate** on entity extraction patterns (Python, Go, TypeScript)

---

*Generated: 2025-11-26*
*Version: 1.0.6*
