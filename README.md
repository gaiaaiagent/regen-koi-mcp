# 🌱 Regen KOI MCP Server

Access Regen Network's Knowledge Organization Infrastructure (KOI) through Model Context Protocol (MCP) tools in Claude Desktop, VSCode, and other MCP-compatible clients.

## 🚀 Quick Start

### One-Line Install (Easiest!)

```bash
curl -fsSL https://raw.githubusercontent.com/gaiaaiagent/regen-koi-mcp/main/install.sh | bash
```

This automatically configures Claude Desktop and Claude Code CLI. Just restart and you're done! 🎉

**Quick Test:** After restarting, open Claude and ask: _"What repositories are indexed in KOI?"_ to verify the tools are working.

---

### Option 1: NPM (Recommended - Auto-Updates)

**No installation needed!** Just configure Claude Desktop with:

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

**Benefits:**
- ✅ Automatic updates - get new features without doing anything
- ✅ No git clone, no build, no maintenance
- ✅ Always uses the latest version
- ✅ Works immediately

Config file locations:
- **Mac**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

Then restart Claude Desktop and you're done! 🎉

**Quick Test:** Ask Claude: _"What repositories are indexed in KOI?"_ to verify the tools are working.

**For existing git users**: See the migration section below for a simple one-line script to switch to npx.

---

### 🔄 Migrating from Git Installation

If you previously installed via `git clone`, switch to npx for automatic updates:

```bash
curl -fsSL https://raw.githubusercontent.com/gaiaaiagent/regen-koi-mcp/main/migrate.sh | bash
```

**What this does**:
- ✅ Backs up your existing config
- ✅ Updates `command: "node"` → `command: "npx"`
- ✅ Updates `args` to use `regen-koi-mcp@latest`
- ✅ Configures Claude Code CLI too
- ✅ You get automatic updates forever!

After migration, you can safely delete your old git clone directory.

---

### Option 2: Local Development (Git Clone)

For contributors or local development only:

```bash
git clone https://github.com/gaiaaiagent/regen-koi-mcp
cd regen-koi-mcp
npm install
npm run build
```

Then manually configure your MCP client to point to the local `dist/index.js`.

**Requirements:**
- **Node.js 16+**: [Download here](https://nodejs.org)
- **Python 3.8+**: [Download here](https://python.org) - Optional (only for advanced local digest generation)

## 🏠 Deployment Options

### 🌐 Option 1: Hosted API (Default - Recommended)
By default, the MCP client connects to the **hosted KOI API** at `https://regen.gaiaai.xyz/api/koi`. This works out of the box - no additional setup required!

### 🖥️ Option 2: Self-Hosted API Server
Want to run your own API server with direct database access? See [ARCHITECTURE.md](ARCHITECTURE.md) for setup instructions.

### 🏗️ Option 3: Full Self-Hosted Pipeline
Want complete control including data collection? You'll need:
- This repo (MCP client + API server)
- [koi-sensors](https://github.com/gaiaaiagent/koi-sensors) - Data collection from Discourse, Ledger, etc.
- [koi-processor](https://github.com/gaiaaiagent/koi-processor) - Batch processing pipeline

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed setup instructions and architecture overview.

## 🎯 What This Does

This MCP server gives AI assistants access to Regen Network's comprehensive knowledge base with 15,000+ documents about:
- Carbon credits and ecological assets
- Regenerative agriculture practices
- Blockchain and Web3 sustainability
- Climate action and environmental data
- Regen Registry credit classes

**Note:** This MCP server connects to our hosted KOI API at `https://regen.gaiaai.xyz/api/koi` (behind HTTPS via Nginx), so you don't need to run any infrastructure locally.

## 🎓 Quick Start: Example Queries

Once you've installed the MCP server, try these queries in Claude to explore what's available:

### 🔍 Discovery: What's Indexed?

```
"What repositories are indexed in the KOI knowledge base?"
"What types of code entities exist?"
"Show me statistics about what's in the knowledge base"
```

**What you'll get:** The system has indexed 5 repositories (regen-ledger, regen-web, koi-sensors, and more) with 26,768 code entities including Methods, Functions, Structs, and Interfaces.

### 💻 Code Exploration: Find Specific Code

```
"Search for functions containing 'keeper' in regen-ledger"
"Find all code related to MsgCreateBatch"
"What Structs exist in the ecocredit module?"
"Show me all Interface types in regen-ledger"
"Search for retirement-related code"
```

**What you'll get:** Direct links to code entities with file paths and signatures. The graph contains Methods, Functions, Structs, and Interfaces extracted via tree-sitter AST parsing.

### 📚 Documentation: Understanding the System

```
"Explain the ecocredit module architecture"
"What's the tech stack for regen-web?"
"Search GitHub docs for information about credit classes"
"Get an overview of the regen-ledger repository"
```

**What you'll get:** Architectural explanations, technology choices, and relevant documentation from GitHub repositories.

### 🔬 Advanced: Graph Traversal

```
"What functions call CreateBatch?"
"What does the NewKeeper function call?"
"Find orphaned code that's never called"
"Show me the call graph for MsgRetire"
```

**What you'll get:** Call graph traversal showing function relationships (CALLS edges), orphan detection, and code dependency analysis.

### 📊 Knowledge Base: Recent Activity

```
"Generate a weekly digest of Regen Network discussions"
"Search for recent discussions about carbon credits from the past week"
"Find documentation about basket creation from 2024"
```

**What you'll get:** Summaries of community discussions, forum posts, and activity with source citations.

---

## 📦 Available Tools

### Knowledge Base Search
| Tool | Description | Key Inputs |
|------|-------------|-----------|
| `search_knowledge` | Hybrid search (vectors + graph with RRF) | `query` (string), `limit` (1–20, default 5), `published_from` (YYYY‑MM‑DD), `published_to` (YYYY‑MM‑DD), `include_undated` (bool, default false) |
| `hybrid_search` | Intelligent search routing (auto-detects entity vs conceptual queries) | `query` (string), `limit` (1–50, default 10) |
| `get_stats` | Knowledge base statistics | `detailed` (boolean) |
| `generate_weekly_digest` | Generate weekly digest of Regen Network activity | `start_date` (YYYY-MM-DD, default: 7 days ago), `end_date` (YYYY-MM-DD, default: today), `save_to_file` (bool, default false), `output_path` (string), `format` ('markdown' or 'json', default: 'markdown') |

### Code Knowledge Graph
| Tool | Description | Key Inputs |
|------|-------------|-----------|
| `query_code_graph` | Query relationships between Keepers, Messages, Events, and Documentation | `query_type` (enum: keeper_for_msg, msgs_for_keeper, docs_mentioning, entities_in_doc, related_entities), `entity_name` (string), `doc_path` (string) |

### GitHub Documentation
| Tool | Description | Key Inputs |
|------|-------------|-----------|
| `search_github_docs` | Search Regen GitHub repos for documentation and technical content | `query` (string), `repository` (optional: regen-ledger, regen-web, regen-data-standards, regenie-corpus), `limit` (1-20, default 10) |
| `get_repo_overview` | Get structured overview of a Regen repository | `repository` (enum: regen-ledger, regen-web, regen-data-standards, regenie-corpus) |
| `get_tech_stack` | Get technical stack information for Regen repositories | `repository` (optional, omit to show all repos) |

---

## 🤔 What Can I Ask? User Guide

This table helps you understand which tool to use for different tasks. Just ask Claude in natural language - it will automatically use the right tool.

| **When You Want To...**                                  | **Ask Claude**                                           | **Tool Used**            |
|----------------------------------------------------------|----------------------------------------------------------|--------------------------|
| **Discover what's indexed**                              |                                                          |                          |
| See what repositories are available                      | "What repositories are indexed?"                         | `list_repos`             |
| See what types of code entities exist                    | "What entity types are available?"                       | `list_entity_types`      |
| Get comprehensive statistics                             | "Show me statistics about the knowledge base"            | `get_entity_stats`       |
| **Find specific code**                                   |                                                          |                          |
| Find all entities of a type                              | "Show me all Keepers in regen-ledger"                    | `find_by_type`           |
| Search for entities by name                              | "Find entities related to MsgCreateBatch"                | `search_entities`        |
| Find related code entities                               | "What's related to the ecocredit Keeper?"                | `related_entities`       |
| **Understand relationships**                             |                                                          |                          |
| Find which Keeper handles a Message                      | "Which Keeper handles MsgCreateBatch?"                   | `keeper_for_msg`         |
| Find what Messages a Keeper handles                      | "What messages does the ecocredit Keeper handle?"        | `msgs_for_keeper`        |
| Find what documentation mentions an entity               | "What docs mention MsgRetire?"                           | `docs_mentioning`        |
| Find entities in a file                                  | "What entities are in keeper.go?"                        | `entities_in_doc`        |
| **Navigate by modules**                                  |                                                          |                          |
| List all modules                                         | "What modules exist in regen-ledger?"                    | `list_modules`           |
| Get details about a module                               | "Tell me about the ecocredit module"                     | `get_module`             |
| Search for modules                                       | "Find modules related to baskets"                        | `search_modules`         |
| Find entities in a module                                | "What entities are in the ecocredit module?"             | `module_entities`        |
| **Search documentation**                                 |                                                          |                          |
| Search GitHub docs                                       | "Search for documentation about credit classes"          | `search_github_docs`     |
| Get repository overview                                  | "Give me an overview of regen-web"                       | `get_repo_overview`      |
| Understand tech stack                                    | "What's the tech stack for regen-ledger?"                | `get_tech_stack`         |
| **Search everything (hybrid)**                           |                                                          |                          |
| Semantic search across code and docs                     | "How does credit retirement work?"                       | `hybrid_search`          |
| Advanced filtering by date                               | "Find discussions about tokens from last week"           | `search_knowledge`       |
| **Get activity summaries**                               |                                                          |                          |
| Generate weekly digest                                   | "Create a weekly digest of Regen activity"               | `generate_weekly_digest` |

### Query Type Reference

The `query_code_graph` tool supports these query types:

#### Discovery
- **`list_repos`** - Show all indexed repositories with entity counts
- **`list_entity_types`** - Show all entity types (Function, Class, Keeper, Message, etc.) with counts
- **`get_entity_stats`** - Comprehensive statistics: entities by type, language, repository
- **`list_modules`** - Show all modules across repositories

#### Entity Queries
- **`find_by_type`** - Find all entities of a specific type (requires `entity_type` parameter)
- **`search_entities`** - Search entities by name pattern (requires `entity_name` parameter)
- **`related_entities`** - Find entities related to a given entity (requires `entity_name` parameter)

#### Relationship Queries
- **`keeper_for_msg`** - Find which Keeper handles a Message (requires `entity_name` parameter)
- **`msgs_for_keeper`** - Find what Messages a Keeper handles (requires `entity_name` parameter)
- **`docs_mentioning`** - Find documentation mentioning an entity (requires `entity_name` parameter)
- **`entities_in_doc`** - Find entities defined in a document (requires `doc_path` parameter)

#### Module Queries
- **`get_module`** - Get details about a specific module (requires `module_name` parameter)
- **`search_modules`** - Search modules by keyword (requires `entity_name` parameter)
- **`module_entities`** - Get entities in a module (requires `module_name` parameter)
- **`module_for_entity`** - Find which module contains an entity (requires `entity_name` parameter)

### What's Currently Indexed

**Repositories:** 5 total
- `regen-ledger`: 18,619 entities (Go, Cosmos SDK modules)
- `regen-web`: 3,164 entities (TypeScript/React frontend)
- `koi-sensors`: 1,250 entities (Python data collection)
- `regen-koi-mcp`: 688 entities (TypeScript MCP server)
- `regen-data-standards`: 6 entities (JSON schemas)

**Entity Types:** 10 types
- Function, Class, Interface, Method, Type
- Keeper, Message, Query, Event (Cosmos SDK specific)
- Module, Repository

**Total:** 23,728 code entities

---

## 🏗️ Architecture

This repo contains everything you need to run a complete KOI MCP setup:

```
regen-koi-mcp/
├── src/              # MCP client (connects to API)
├── server/           # KOI API server (FastAPI)
│   ├── src/          # API endpoints
│   ├── setup.sh      # Server setup
│   ├── start.sh      # Start server
│   └── stop.sh       # Stop server
└── python/           # Weekly digest generator
    ├── src/          # Digest logic
    ├── config/       # Configuration
    └── setup.sh      # Python setup
```

**Two modes:**
1. **Client-only** (default): MCP client → Hosted API
2. **Self-hosted**: MCP client → Your local API → Your database

## 💻 Supported Clients

### Claude Desktop

**One-line install:**
```bash
curl -fsSL https://raw.githubusercontent.com/gaiaaiagent/regen-koi-mcp/main/install.sh | bash
```

Or manually add to config (`~/Library/Application Support/Claude/claude_desktop_config.json` on Mac, `~/.config/Claude/claude_desktop_config.json` on Linux):
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

---

### Claude Code CLI

**Option 1: Use the automated installer (recommended)**
```bash
curl -fsSL https://raw.githubusercontent.com/gaiaaiagent/regen-koi-mcp/main/install.sh | bash
```
This configures both Claude Desktop and Claude Code CLI with the correct environment variables.

**Option 2: Manual installation**
1. Add the MCP server:
```bash
claude mcp add regen-koi npx -y regen-koi-mcp@latest
```

2. Configure the environment variable in your Claude Code settings file (`~/.claude/settings.json` or similar):
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

**Verification:** After installation, restart Claude Code and ask: "What repositories are indexed?" to verify the tools are working.

---

### VS Code / VS Code Insiders

**One-line install:**
```bash
code --add-mcp '{"name":"regen-koi","command":"npx","args":["-y","regen-koi-mcp@latest"],"env":{"KOI_API_ENDPOINT":"https://regen.gaiaai.xyz/api/koi"}}'
```

Or for VS Code Insiders:
```bash
code-insiders --add-mcp '{"name":"regen-koi","command":"npx","args":["-y","regen-koi-mcp@latest"],"env":{"KOI_API_ENDPOINT":"https://regen.gaiaai.xyz/api/koi"}}'
```

---

### Cursor

**Via Settings:**
1. Open Cursor Settings
2. Go to MCP section
3. Click "Add new MCP Server"
4. Enter:
   - Name: `regen-koi`
   - Command: `npx`
   - Args: `-y regen-koi-mcp@latest`
   - Env: `KOI_API_ENDPOINT=https://regen.gaiaai.xyz/api/koi`

---

### Windsurf

Add to your Windsurf MCP config:
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

---

### Cline (VS Code Extension)

Install [Cline from VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=saoudrizwan.claude-dev), then add to Cline's MCP settings:
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

---

### Continue (VS Code Extension)

Install [Continue from VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=Continue.continue), then add to Continue's config:
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

---

### Goose

**Via Settings:**
1. Open Advanced settings
2. Go to Extensions
3. Add MCP server with:
   - Command: `npx`
   - Args: `-y regen-koi-mcp@latest`
   - Env: `KOI_API_ENDPOINT=https://regen.gaiaai.xyz/api/koi`

---

### Warp

**Via Settings:**
1. Open Settings → AI → Manage MCP Servers
2. Add new server

Or use slash command:
```bash
/add-mcp regen-koi npx -y regen-koi-mcp@latest
```

---

### Amp

**One-line install:**
```bash
amp mcp add regen-koi -- npx -y regen-koi-mcp@latest
```

---

### Factory

**One-line install:**
```bash
droid mcp add regen-koi "npx -y regen-koi-mcp@latest"
```

Or use interactive UI with `/mcp` command.

---

### Codex

**One-line install:**
```bash
codex mcp add regen-koi npx "-y regen-koi-mcp@latest"
```

Or manually edit `~/.codex/config.toml`:
```toml
[[mcp.servers]]
name = "regen-koi"
command = "npx"
args = ["-y", "regen-koi-mcp@latest"]
[mcp.servers.env]
KOI_API_ENDPOINT = "https://regen.gaiaai.xyz/api/koi"
```

---

### Opencode

Add to `~/.config/opencode/opencode.json`:
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

---

### Kiro

Add to `.kiro/settings/mcp.json`:
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

---

### LM Studio

**Via Settings:**
1. Open Program sidebar
2. Go to MCP configuration
3. Add server with npx command: `npx -y regen-koi-mcp@latest`

---

### Qodo Gen (VS Code / IntelliJ)

**Via Chat Panel:**
1. Open Qodo Gen chat
2. Click "Connect more tools"
3. Add MCP server:
   - Command: `npx`
   - Args: `-y regen-koi-mcp@latest`
   - Env: `KOI_API_ENDPOINT=https://regen.gaiaai.xyz/api/koi`

---

### Gemini CLI

Add to Gemini CLI MCP config:
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

---

### Other MCP-Compatible Clients

Any MCP-compatible client can use this server with:

```json
{
  "command": "npx",
  "args": ["-y", "regen-koi-mcp@latest"],
  "env": {
    "KOI_API_ENDPOINT": "https://regen.gaiaai.xyz/api/koi"
  }
}
```


## 🌍 Environment Configuration

Create a `.env` file in the project root:

```env
# Required: KOI API endpoint
KOI_API_ENDPOINT=https://regen.gaiaai.xyz/api/koi

# Optional: API key if your KOI server requires authentication
# KOI_API_KEY=your_api_key_here

# Graph + NL→SPARQL configuration (used internally by hybrid search)
JENA_ENDPOINT=http://localhost:3030/koi/sparql
CONSOLIDATION_PATH=/opt/projects/koi-processor/src/core/final_consolidation_all_t0.25.json
PATTERNS_PATH=/opt/projects/koi-processor/src/core/predicate_patterns.json
COMMUNITY_PATH=/opt/projects/koi-processor/src/core/predicate_communities.json
EMBEDDING_SERVICE_URL=http://localhost:8095
# OPENAI_API_KEY=your_key  # Optional; template queries used when absent
```

## 🏗️ Development

```bash
# Run in development mode
npm run dev

# Build TypeScript
npm run build

# Clean build files
npm run clean
```

## 🔎 How Hybrid Graph Search Works

- Adaptive dual‑branch execution (internally via MCP):
  - Focused: top‑K predicates via embeddings + usage + community expansion
  - Broad: entity/topic regex over all predicates
  - Canonical‑aware filtering (keywords → `regx:canonicalPredicate`) by default
  - Smart fallback: if canonical returns 0 results, retry broad without canonical to recover recall
- Results fused with Reciprocal Rank Fusion (RRF) for precision + recall
- Date filter support: when `published_from`/`published_to` are provided, the vector and keyword branches are filtered server‑side. If `include_undated` is true, undated docs are also included. The graph branch adds a date filter only when RDF statements include `regx:publishedAt` (optional enrichment).
- Natural‑language recency detection: phrases like “past week”, “last month”, “last 30 days”, “yesterday”, “today” automatically set a date range when no explicit `published_from`/`published_to` are provided.

### Examples

Direct KOI API examples (useful for testing filters):

```bash
# Natural-language recency ("past week") — MCP parses this automatically,
# but you can also hit the KOI API directly for verification
curl -s http://localhost:8301/api/koi/query \
  -H 'Content-Type: application/json' \
  -d '{
    "question": "what discussions about token design happened in the past week?",
    "limit": 10
  }' | jq '.results[0:3]'

# Explicit date range with include_undated=true
curl -s http://localhost:8301/api/koi/query \
  -H 'Content-Type: application/json' \
  -d '{
    "question": "token design",
    "limit": 10,
    "filters": {
      "date_range": { "start": "2025-10-09", "end": "2025-10-16" },
      "include_undated": true
    }
  }' | jq '.results[0:3]'
```

Within MCP, the `search_knowledge` tool accepts:

- `published_from` / `published_to` (YYYY-MM-DD)
- `include_undated` (boolean)
If you omit dates but include phrases like “past week”, the MCP infers the date range automatically.

## 📊 Evaluation

Run the built‑in harness and inspect results:

```bash
node scripts/eval-nl2sparql.js
```

- Persists JSON to `results/eval_*.json` with focused/broad sizes, union/overlap, latency, noise rate.
- Current baseline: 100% queries answered, 0% noise, ~1.5 s average latency.

## 📋 Prerequisites

- Node.js 18 or higher
- Claude Desktop or compatible MCP client
- Internet connection (connects to hosted KOI API)

## 🛠️ Troubleshooting

### "KOI API not accessible"
The setup connects to our hosted KOI API at `https://regen.gaiaai.xyz/api/koi`. If you see connection errors, check your internet connection or firewall settings.

### "Tools not showing in Claude"
1. Restart Claude Desktop after configuration
2. Check the config file syntax is valid JSON
3. Ensure the path to `index.js` is absolute

### "Command not found"
Make sure Node.js is installed and in your PATH. The setup script uses `node` command.

### "Connection error: localhost:8301" or "localhost:8910"

**Cause:** Claude caches MCP configurations in `~/.claude.json`. If you previously ran a local dev server, it may have cached `localhost` URLs that override your current config.

**Fix:**
```bash
# 1. Check for cached localhost configs
grep -i "localhost.*8301\|localhost.*8910" ~/.claude.json

# 2. Backup your config
cp ~/.claude.json ~/.claude.json.backup

# 3. Replace localhost with public API
sed -i '' 's|http://localhost:8301/api/koi|https://regen.gaiaai.xyz/api/koi|g' ~/.claude.json
sed -i '' 's|http://localhost:8910/api/koi|https://regen.gaiaai.xyz/api/koi|g' ~/.claude.json

# 4. Restart Claude Code/Desktop
```

**Prevention:** Always use `https://regen.gaiaai.xyz/api/koi` in MCP configs unless you're actively developing the API server locally.

## 📚 Example Usage

Once configured, you can ask Claude:

- "Search the KOI knowledge base for information about carbon credits"
- "Get statistics about the knowledge base"
- "List active Regen Registry credit classes"
- "Find recent activity on the Regen Network"
- "Generate a weekly digest of Regen Network activity from the past week"
- "Create a digest of discussions from January 1 to January 7, 2025"

### Weekly Digest Tool

The `generate_weekly_digest` tool creates comprehensive markdown summaries of Regen Network activity:

**Features:**
- Automatically aggregates content from the past 7 days (or custom date range)
- Returns markdown content that can be used directly in Claude Desktop as an artifact
- Optionally saves to a file for use with NotebookLM or other tools
- Includes proper source citations and statistics

**Examples:**

```javascript
// In Claude Desktop or Claude Code CLI:
"Generate a weekly digest of Regen Network activity"

// With custom date range:
"Create a digest from December 1 to December 8, 2024"

// Save to file:
"Generate a weekly digest and save it to weekly_summary.md"
```

**Note:** The digest content is returned in the response, so in Claude Desktop it will be displayed inline (and may be created as an artifact). The `save_to_file` option is useful when you want a persistent copy on disk.

## 🤝 Contributing

Contributions welcome! Please feel free to submit issues and pull requests.

## 📄 License

MIT License - see LICENSE file for details

## 🔗 Links

- [GitHub Repository](https://github.com/regen-network/regen-koi-mcp)
- [Regen Network](https://www.regen.network)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [Claude Desktop](https://claude.ai/download)

## 🌟 Credits

Built by the Regen Network community to make ecological knowledge accessible to AI assistants everywhere.

---

## 🛠️ Developer & Deployment Documentation

For developers and operators who want to run their own instance or contribute:

| Document | Description |
|----------|-------------|
| [docs/INFRASTRUCTURE.md](docs/INFRASTRUCTURE.md) | Server requirements, PostgreSQL setup, Apache AGE installation |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Production deployment guide, systemd setup, monitoring |
| [docs/TECHNICAL_ASSISTANT_PROJECT.md](docs/TECHNICAL_ASSISTANT_PROJECT.md) | Full project tracking and implementation details |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System architecture and component overview |

### Quick Local Development with Docker

Spin up a complete development stack with PostgreSQL + pgvector + Apache AGE:

```bash
cd docker/
docker-compose up -d
```

This starts everything needed for full functionality including graph queries.

### Deploy Scripts

```bash
# Install Apache AGE on existing PostgreSQL
./scripts/deploy/install-apache-age.sh

# Setup database schema and extensions
./scripts/deploy/setup-database.sh

# Load graph data (entities, summaries, relationships)
./scripts/deploy/load-graph-data.sh
```

---

## 🏗️ Related Repositories

This MCP client is part of the larger KOI ecosystem:

- **[koi-sensors](https://github.com/gaiaaiagent/koi-sensors)** - Real-time data collection from Discourse, Regen Ledger, websites, etc.
- **[koi-processor](https://github.com/gaiaaiagent/koi-processor)** - Batch processing pipeline for chunking, embedding, and graph construction

See [ARCHITECTURE.md](ARCHITECTURE.md) for how these components work together.
