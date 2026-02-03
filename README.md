# 🌱 Regen KOI MCP Server

Access Regen Network's Knowledge Organization Infrastructure (KOI) through Model Context Protocol (MCP) tools in Claude Desktop, VSCode, and other MCP-compatible clients.

## 🚀 Quick Start

**Choose your installation method:**
- **Native CLI commands** (Recommended) - Most transparent and secure
- **Automated install script** - Convenient for multiple clients at once
- **Manual configuration** - Full control over your setup

### Recommended: Native CLI Commands

The simplest and most secure way to install for supported clients:

**Claude Code CLI:**
```bash
claude mcp add regen-koi npx regen-koi-mcp@latest
```

**Codex:** (requires manual config - see [Codex section](#codex) for full instructions)
```bash
# CLI adds the server, but you must manually add startup_timeout_sec = 30
codex mcp add regen-koi npx "-y regen-koi-mcp@latest"
```

**Warp:**
```bash
/add-mcp regen-koi npx -y regen-koi-mcp@latest
```

**Amp:**
```bash
amp mcp add regen-koi -- npx -y regen-koi-mcp@latest
```

**Factory:**
```bash
droid mcp add regen-koi "npx -y regen-koi-mcp@latest"
```

Then configure the environment variable (see [client-specific sections](#-supported-clients) below for details).

### Alternative: Automated Install Script

**⚠️ Security Note:** This script requires bash access and modifies config files. Review the [install script](https://raw.githubusercontent.com/gaiaaiagent/regen-koi-mcp/main/install.sh) before running.

```bash
curl -fsSL https://raw.githubusercontent.com/gaiaaiagent/regen-koi-mcp/main/install.sh | bash
```

**What this does:**
- Automatically configures Claude Desktop and Claude Code CLI
- Sets up environment variables
- Works for multiple clients at once

**Quick Test:** After installation, restart your client and ask: _"What repositories are indexed in KOI?"_ to verify the tools are working.

---

### Manual Configuration (All Clients)

**For clients without a CLI command**, manually add this configuration:

```json
{
  "mcpServers": {
    "regen-koi": {
      "command": "npx",
      "args": ["regen-koi-mcp@latest"],
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

If you previously installed via `git clone`, switch to npx for automatic updates.

⚠️ **Security Note:** Review the [migrate script](https://raw.githubusercontent.com/gaiaaiagent/regen-koi-mcp/main/migrate.sh) before running.

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

**Contract test (prevents schema drift):**
```bash
# Defaults to https://regen.gaiaai.xyz/api/koi
npm run test:contract

# Or override endpoint
KOI_API_ENDPOINT=https://regen.gaiaai.xyz/api/koi npm run test:contract
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

## 🔐 Authentication (Optional - Team Members Only)

### Public Data (No Auth Required)
KOI provides access to extensive public Regen Network knowledge:
- ✅ Regen Ledger code and documentation
- ✅ Regen Network forum discussions
- ✅ Public GitHub repositories
- ✅ Website content and blogs

**Most users don't need authentication** - just install and start querying!

### Internal Documentation (Regen Network Team)
Regen Network team members with `@regen.network` emails can optionally authenticate to access additional internal documentation.

**To authenticate:**
```
User: "Please use the regen_koi_authenticate tool"

MCP: ## Authentication Required

     🌐 Your browser should open automatically. If not, click:
     [Open Activation Page](https://regen.gaiaai.xyz/activate)

     Enter this code: NWDV-FCFC

     Sign in with your @regen.network email.

     After completing, run this tool again to retrieve your session token.

User: [Completes authentication in browser]
      "Please use the regen_koi_authenticate tool again"

MCP: ✅ Authentication Successful!
     You now have access to internal Regen Network documentation.

     Authenticated as: yourname@regen.network
```

**After authentication:**
- Queries automatically include internal documentation
- Token is saved locally in `~/.koi-auth.json` and cached in memory
- Session expires after ~1 hour
- Browser auto-opens to activation page for convenience

### What Permissions Are Requested

The OAuth flow requests **minimal, identity-only permissions**:
- ✅ `openid` - Verify your identity
- ✅ `email` - Confirm you're @regen.network
- ✅ `profile` - Basic profile info

**NOT requested:**
- ❌ Access to your personal Drive files
- ❌ Access to your Gmail
- ❌ Any write/modification permissions

The service account (not your OAuth token) handles all data access.

### Example: Team Member Workflow

```
# First time - authenticate
User: "Use regen_koi_authenticate to authenticate me"

MCP: Opening browser...
     ✅ Authenticated as: alice@regen.network

# Now all queries include internal docs
User: "How do I register a carbon project?"

MCP: Found 23 results from multiple sources:
     - Project Registration Guide (2024)
     - Registry Standards Documentation
     - Carbon Methodology Overview
     ...
```

### Token Security

Your authentication tokens are:
- 🔒 **Local Storage**: Saved in `~/.koi-auth.json` with `0o600` permissions (owner read/write only)
- 🔒 **Database**: SHA-256 hashed when stored in PostgreSQL (no plain tokens stored)
- 🔒 **User-Specific**: Never shared between users; each session is isolated
- 🔒 **Short-Lived**: Sessions expire after 1 hour; tokens are revocable
- 🔒 **Domain Enforcement**: Only `@regen.network` emails are permitted (verified in JWT claims)
- 🔒 **Phishing Prevention**: RFC 8628 Device Authorization Grant with user-typed codes
- 🔒 **Rate Limited**: 5 attempts/min on activation, 60 req/min on token endpoint
- 🔒 **No Secrets in URLs**: All authentication flows use POST requests to prevent logging
- 🔒 **Hardcoded URLs**: Activation page URL is hardcoded in the client (not from server)
- 🔒 **JWT Validation**: Google ID tokens validated locally with signature verification

**Production-Ready:** This authentication system follows RFC 8628 and industry best practices.

See [docs/AUTHENTICATION.md](docs/AUTHENTICATION.md) for complete security documentation and threat model.

### Troubleshooting

**"Authentication window opened but nothing happened"**
- Check if your browser blocked the popup
- Try manually clicking the URL shown in the terminal

**"Access denied" after logging in**
- Ensure you're using your `@regen.network` email (not personal Gmail)
- Contact your Workspace admin if you don't have access

**Still having issues?**
- Open an issue: https://github.com/gaiaaiagent/regen-koi-mcp/issues

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

### 🔎 Source Filtering & Date Sorting

```
"Get the latest 5 documents from the Notion database"
"Show me recent Discourse forum posts sorted by date"
"Search GitHub for ecocredit documentation"
"Find the newest content from any source"
```

**What you'll get:** Documents filtered by source (notion, github, discourse, youtube, podcast, web, gitlab) and sorted chronologically. Available sources can be discovered via `get_stats`.

---

## 📦 Available Tools

### Knowledge Base Search
| Tool | Description | Key Inputs |
|------|-------------|-----------|
| `search` | Hybrid search (vectors + graph with RRF) | `query` (string), `intent` (enum: general, person_activity, person_bio, technical_howto - use `person_activity` for "what is X working on" queries), `source` (filter by source: notion, github, discourse, etc.), `sort_by` (relevance, date_desc, date_asc), `limit` (1–50, default 10), `published_from` (YYYY‑MM‑DD), `published_to` (YYYY‑MM‑DD), `include_undated` (bool, default false) |
| `get_full_document` | Retrieve complete document content by RID and save to local file | `rid` (string, document or chunk RID), `output_path` (string, where to save), `include_metadata_header` (bool, default true) |
| `get_stats` | Knowledge base statistics | `detailed` (boolean) |
| `generate_weekly_digest` | Generate weekly digest SUMMARY of Regen Network activity | `start_date` (YYYY-MM-DD, default: 7 days ago), `end_date` (YYYY-MM-DD, default: today), `save_to_file` (bool, default false), `output_path` (string), `format` ('markdown' or 'json', default: 'markdown') |
| `get_notebooklm_export` | Get FULL NotebookLM export with complete forum posts, Notion pages, and source material | `save_to_file` (bool, default false), `output_path` (string) |

### Code Knowledge Graph
| Tool | Description | Key Inputs |
|------|-------------|-----------|
| `query_code_graph` | Query relationships between Keepers, Messages, Events, and Documentation | `query_type` (enum: keeper_for_msg, msgs_for_keeper, docs_mentioning, entities_in_doc, related_entities, list_keepers, list_messages, find_callers, find_callees, trace_call_chain, find_orphaned_code), `entity_name` (string), `doc_path` (string), `limit` (1-200, default 50), `offset` (pagination offset, default 0), `from_entity` (for trace_call_chain), `to_entity` (for trace_call_chain), `max_depth` (1-8, default 4) |

### SPARQL Power Tools (Advanced)
| Tool | Description | Key Inputs |
|------|-------------|-----------|
| `sparql_query` | Execute raw SPARQL queries against the Regen Knowledge Graph (Apache Jena). Power tool for advanced graph investigations. | `query` (string, SPARQL SELECT query), `format` ('json' or 'table', default: json), `limit` (1-1000, default: 100), `timeout_ms` (1000-60000, default: 30000) |

### GitHub Documentation
| Tool | Description | Key Inputs |
|------|-------------|-----------|
| `search_github_docs` | Search Regen GitHub repos for documentation and technical content | `query` (string), `repository` (optional: regen-ledger, regen-web, regen-data-standards, regenie-corpus), `limit` (1-20, default 10) |
| `get_repo_overview` | Get structured overview of a Regen repository | `repository` (enum: regen-ledger, regen-web, regen-data-standards, regenie-corpus) |
| `get_tech_stack` | Get technical stack information for Regen repositories | `repository` (optional, omit to show all repos) |

### Authentication (Team Members Only)
| Tool | Description | Key Inputs |
|------|-------------|-----------|
| `regen_koi_authenticate` | Authenticate with @regen.network email to access internal documentation | None (opens browser for OAuth login) |

### User Profile & Personalization
| Tool | Description | Key Inputs |
|------|-------------|-----------|
| `get_my_profile` | Get your profile for personalized responses based on experience level | None (requires auth) |
| `update_my_profile` | Update experience level, role, and preferences to customize responses | `experience_level` (junior/mid/senior/staff/principal), `role` (string), `preferences` (object), `managed_by` (email) |

**Experience Levels:**
- **junior**: Detailed explanations, shows examples, explains approach before code
- **mid**: Balanced explanations with examples (default)
- **senior/staff/principal**: Concise responses, assumes expertise

### Feedback & Metrics
| Tool | Description | Key Inputs |
|------|-------------|-----------|
| `submit_feedback` | Submit feedback about your KOI MCP experience | `rating` (1-5), `category` (success, partial, bug, suggestion, question, other), `notes` (string), `task_description` (optional), `include_session_context` (bool, default true) |
| `get_mcp_metrics` | Get MCP server health and performance metrics | None |

---

## 🤔 What Can I Ask? User Guide

This table helps you understand which tool to use for different tasks. Just ask Claude in natural language - it will automatically use the right tool.

| **When You Want To...**                                  | **Ask Claude**                                           | **Tool Used**            |
|----------------------------------------------------------|----------------------------------------------------------|--------------------------|
| **Discover what's indexed**                              |                                                          |                          |
| See what repositories are available                      | "What repositories are indexed?"                         | `list_repos`             |
| See what types of code entities exist                    | "What entity types are available?"                       | `list_entity_types`      |
| Get comprehensive statistics                             | "Show me statistics about the knowledge base"            | `get_entity_stats`       |
| List all Keepers                                         | "Show me all Keepers"                                    | `list_keepers`           |
| List all Messages                                        | "List all message types"                                 | `list_messages`          |
| **Find specific code**                                   |                                                          |                          |
| Find all entities of a type                              | "Show me all Keepers in regen-ledger"                    | `find_by_type`           |
| Search for entities by name                              | "Find entities related to MsgCreateBatch"                | `search_entities`        |
| Find related code entities                               | "What's related to the ecocredit Keeper?"                | `related_entities`       |
| **Understand relationships**                             |                                                          |                          |
| Find which Keeper handles a Message                      | "Which Keeper handles MsgCreateBatch?"                   | `keeper_for_msg`         |
| Find what Messages a Keeper handles                      | "What messages does the ecocredit Keeper handle?"        | `msgs_for_keeper`        |
| Find what documentation mentions an entity               | "What docs mention MsgRetire?"                           | `docs_mentioning`        |
| Find entities in a file                                  | "What entities are in keeper.go?"                        | `entities_in_doc`        |
| **Trace code paths**                                     |                                                          |                          |
| Find what calls a function                               | "What functions call CreateBatch?"                       | `find_callers`           |
| Find what a function calls                               | "What does NewKeeper call?"                              | `find_callees`           |
| Trace call chain between functions                       | "How does handleMsgSend reach validateBalance?"          | `trace_call_chain`       |
| Find dead code                                           | "Find orphaned code with no callers"                     | `find_orphaned_code`     |
| **Personalize responses**                                |                                                          |                          |
| Get your profile                                         | "Show my profile settings"                               | `get_my_profile`         |
| Set experience level                                     | "Set my experience level to senior"                      | `update_my_profile`      |
| Configure preferences                                    | "I'm a junior developer, give me detailed explanations"  | `update_my_profile`      |
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
| Semantic search across code and docs                     | "How does credit retirement work?"                       | `search`                 |
| Advanced filtering by date                               | "Find discussions about tokens from last week"           | `search`                 |
| Filter by source                                         | "Get the latest 5 Notion documents"                      | `search`                 |
| Sort by date                                             | "Show newest Discourse posts"                            | `search`                 |
| **Retrieve full documents**                              |                                                          |                          |
| Get complete document after search                       | "Get me the full document for that first result"         | `get_full_document`      |
| Save document to local file                              | "Save the full text of that Notion page to my desktop"   | `get_full_document`      |
| **Get activity summaries**                               |                                                          |                          |
| Generate weekly digest summary                           | "Create a weekly digest of Regen activity"               | `generate_weekly_digest` |
| Get full content for NotebookLM                          | "Get the full NotebookLM export with all forum posts"    | `get_notebooklm_export`  |
| **Advanced graph queries (SPARQL)**                      |                                                          |                          |
| Run custom SPARQL query                                  | "Run this SPARQL: SELECT ?s ?p ?o WHERE {...}"           | `sparql_query`           |

### Query Type Reference

The `query_code_graph` tool supports these query types:

#### Discovery
- **`list_repos`** - Show all indexed repositories with entity counts
- **`list_entity_types`** - Show all entity types (Function, Class, Keeper, Message, etc.) with counts
- **`get_entity_stats`** - Comprehensive statistics: entities by type, language, repository
- **`list_keepers`** - List all Keeper entities with pagination (supports `limit` and `offset`)
- **`list_messages`** - List all Message entities with pagination (supports `limit` and `offset`)
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

#### Call Graph Queries
- **`find_callers`** - Find what functions/methods call a given entity (requires `entity_name`)
- **`find_callees`** - Find what a function/method calls (requires `entity_name`)
- **`trace_call_chain`** - Find the call path between two entities (requires `from_entity`, `to_entity`, optional `max_depth` 1-8)
- **`find_orphaned_code`** - Find code with no callers (dead code detection)

#### Module Queries
- **`get_module`** - Get details about a specific module (requires `module_name` parameter)
- **`search_modules`** - Search modules by keyword (requires `entity_name` parameter)
- **`module_entities`** - Get entities in a module (requires `module_name` parameter)
- **`module_for_entity`** - Find which module contains an entity (requires `entity_name` parameter)

---

### When to Use Which Tool

| Use Case | Recommended Tool | Why |
|----------|------------------|-----|
| Find a specific entity by name | `resolve_entity` or `search_entities` | Fast label-to-URI resolution |
| Get entity relationships | `get_entity_neighborhood` | Pre-built relationship queries |
| List all Keepers/Messages | `list_keepers` / `list_messages` | Optimized paginated listing |
| Complex relationship patterns | `sparql_query` | Full SPARQL expressiveness |
| Aggregate statistics | `sparql_query` with GROUP BY | Custom aggregations |
| Cross-entity analysis | `sparql_query` | Join across entity types |

**Rule of thumb:**
- Use **`query_code_graph`** for common queries (keepers, messages, relationships)
- Use **`resolve_entity`** / **`get_entity_neighborhood`** for entity lookups
- Use **`sparql_query`** for complex queries not covered by other tools

---

### SPARQL Query Examples

The `sparql_query` tool executes raw SPARQL against the Apache Jena knowledge graph. Common prefixes are auto-added if not specified.

#### Example 1: Simple SELECT - Find all Organizations
```sparql
SELECT ?org ?label WHERE {
  ?org a schema:Organization .
  OPTIONAL { ?org rdfs:label ?label }
}
```

#### Example 2: Relationship Lookup - Find statements about a topic
```sparql
SELECT ?stmt ?predicate ?object WHERE {
  ?stmt regen:subject ?subject .
  ?stmt regen:predicate ?predicate .
  ?stmt regen:object ?object .
  FILTER(CONTAINS(LCASE(STR(?subject)), "carbon credit"))
}
```

#### Example 3: Find All Messages/Keepers with Relationships
```sparql
SELECT ?keeper ?msg ?msgName WHERE {
  ?keeper a <Keeper> .
  ?keeper <HANDLES> ?msg .
  ?msg rdfs:label ?msgName .
}
ORDER BY ?keeper
```

#### Safety Features

The `sparql_query` tool enforces several safety measures:
- **Max query length:** 5,000 characters
- **Result row cap:** 1,000 rows (configurable via `limit` parameter)
- **Timeout:** Default 30s, max 60s
- **Read-only:** Only SELECT queries allowed (no DELETE, INSERT, DROP)
- **Privacy:** Raw queries are never logged; only query hash + summary are recorded

---

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

**Recommended: Manual configuration**

Add to your config file:
- **Mac:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux:** `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "regen-koi": {
      "command": "npx",
      "args": ["regen-koi-mcp@latest"],
      "env": {
        "KOI_API_ENDPOINT": "https://regen.gaiaai.xyz/api/koi"
      }
    }
  }
}
```

**Alternative: Automated installer**

⚠️ **Security Note:** Review the [install script](https://raw.githubusercontent.com/gaiaaiagent/regen-koi-mcp/main/install.sh) before running.

```bash
curl -fsSL https://raw.githubusercontent.com/gaiaaiagent/regen-koi-mcp/main/install.sh | bash
```

---

### Claude Code CLI

**Recommended: One-line command**
```bash
claude mcp add regen-koi npx regen-koi-mcp@latest
```

Then manually add the environment variable to your Claude Code settings file:

**Mac/Linux:** `~/.config/claude/claude_code_config.json`
**Windows:** `%APPDATA%\claude\claude_code_config.json`

```json
{
  "mcpServers": {
    "regen-koi": {
      "command": "npx",
      "args": ["regen-koi-mcp@latest"],
      "env": {
        "KOI_API_ENDPOINT": "https://regen.gaiaai.xyz/api/koi"
      }
    }
  }
}
```

**Alternative: Use the automated installer**

⚠️ **Security Note:** Review the [install script](https://raw.githubusercontent.com/gaiaaiagent/regen-koi-mcp/main/install.sh) before running.

```bash
curl -fsSL https://raw.githubusercontent.com/gaiaaiagent/regen-koi-mcp/main/install.sh | bash
```

This configures both Claude Desktop and Claude Code CLI with the correct environment variables.

**Verification:** After installation, restart Claude Code and ask: "What repositories are indexed?" to verify the tools are working.

---

### VS Code / VS Code Insiders

**Recommended: CLI command**

For VS Code:
```bash
code --add-mcp '{"name":"regen-koi","command":"npx","args":["regen-koi-mcp@latest"],"env":{"KOI_API_ENDPOINT":"https://regen.gaiaai.xyz/api/koi"}}'
```

For VS Code Insiders:
```bash
code-insiders --add-mcp '{"name":"regen-koi","command":"npx","args":["regen-koi-mcp@latest"],"env":{"KOI_API_ENDPOINT":"https://regen.gaiaai.xyz/api/koi"}}'
```

**Alternative: Manual configuration**

Add to your VS Code MCP settings with the command, args, and env values shown above.

---

### Cursor

**Via Settings:**
1. Open Cursor Settings
2. Go to MCP section
3. Click "Add new MCP Server"
4. Enter:
   - Name: `regen-koi`
   - Command: `npx`
   - Args: `regen-koi-mcp@latest`
   - Env: `KOI_API_ENDPOINT=https://regen.gaiaai.xyz/api/koi`

---

### Windsurf

Add to your Windsurf MCP config:
```json
{
  "mcpServers": {
    "regen-koi": {
      "command": "npx",
      "args": ["regen-koi-mcp@latest"],
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
      "args": ["regen-koi-mcp@latest"],
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
      "args": ["regen-koi-mcp@latest"],
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
   - Args: `regen-koi-mcp@latest`
   - Env: `KOI_API_ENDPOINT=https://regen.gaiaai.xyz/api/koi`

---

### Warp

**Recommended: Slash command**
```bash
/add-mcp regen-koi npx -y regen-koi-mcp@latest
```

Then add the environment variable `KOI_API_ENDPOINT=https://regen.gaiaai.xyz/api/koi` in the server settings.

**Alternative: Manual configuration via Settings**
1. Open Settings → AI → Manage MCP Servers
2. Add new server
3. Configure:
   - Command: `npx`
   - Args: `regen-koi-mcp@latest`
   - Env: `KOI_API_ENDPOINT=https://regen.gaiaai.xyz/api/koi`

---

### Amp

**Recommended: One-line command**
```bash
amp mcp add regen-koi -- npx -y regen-koi-mcp@latest
```

Then manually add the environment variable `KOI_API_ENDPOINT=https://regen.gaiaai.xyz/api/koi` to the server configuration.

---

### Factory

**Recommended: One-line command**
```bash
droid mcp add regen-koi "npx -y regen-koi-mcp@latest"
```

Then manually add the environment variable `KOI_API_ENDPOINT=https://regen.gaiaai.xyz/api/koi` to the server configuration.

**Alternative: Interactive UI**

Use the `/mcp` command in Factory to add the server interactively.

---

### Codex

**Recommended: Manual configuration**

Edit `~/.codex/config.toml` directly:
```toml
[[mcp.servers]]
name = "regen-koi"
command = "npx"
args = ["-y", "regen-koi-mcp@latest"]
startup_timeout_sec = 30
[mcp.servers.env]
KOI_API_ENDPOINT = "https://regen.gaiaai.xyz/api/koi"
```

**Note:** The `startup_timeout_sec = 30` is required because the MCP server takes longer than Codex's default 10-second timeout to initialize (especially on first run when npx downloads the package).

**Alternative: CLI command + manual edit**
```bash
codex mcp add regen-koi npx "-y regen-koi-mcp@latest"
```
Then edit `~/.codex/config.toml` to add `startup_timeout_sec = 30` under the `[mcp_servers.regen-koi]` section.

---

### Opencode

Add to `~/.config/opencode/opencode.json`:
```json
{
  "mcpServers": {
    "regen-koi": {
      "command": "npx",
      "args": ["regen-koi-mcp@latest"],
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
      "args": ["regen-koi-mcp@latest"],
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
3. Add server with npx command: `npx regen-koi-mcp@latest`

---

### Qodo Gen (VS Code / IntelliJ)

**Via Chat Panel:**
1. Open Qodo Gen chat
2. Click "Connect more tools"
3. Add MCP server:
   - Command: `npx`
   - Args: `regen-koi-mcp@latest`
   - Env: `KOI_API_ENDPOINT=https://regen.gaiaai.xyz/api/koi`

---

### Gemini CLI

Add to Gemini CLI MCP config:
```json
{
  "mcpServers": {
    "regen-koi": {
      "command": "npx",
      "args": ["regen-koi-mcp@latest"],
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
  "args": ["regen-koi-mcp@latest"],
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

# Tool Filtering (useful for personal/custom deployments)
# Whitelist mode - only these tools are available:
# KOI_ENABLED_TOOLS=search,get_stats,query_code_graph

# Blacklist mode - all tools except these:
# KOI_DISABLED_TOOLS=regen_koi_authenticate,list_governance_proposals
```

### Tool Filtering for Custom Deployments

You can customize which tools are exposed by setting environment variables. This is useful when:
- Running a personal KOI instance without Regen-specific features
- Creating a focused deployment with only certain tools
- Disabling authentication for public-only access

**Blacklist Mode** (disable specific tools):
```json
{
  "env": {
    "KOI_API_ENDPOINT": "http://localhost:8080/api/koi",
    "KOI_DISABLED_TOOLS": "regen_koi_authenticate,list_governance_proposals,get_validator_commission"
  }
}
```

**Whitelist Mode** (enable only specific tools):
```json
{
  "env": {
    "KOI_API_ENDPOINT": "http://localhost:8080/api/koi",
    "KOI_ENABLED_TOOLS": "search,get_stats,query_code_graph,sparql_query"
  }
}
```

> **Note:** Whitelist mode takes precedence. If `KOI_ENABLED_TOOLS` is set, `KOI_DISABLED_TOOLS` is ignored.

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

Within MCP, the `search` tool accepts:

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

### Weekly Digest Tools

There are two tools for getting weekly activity information, each designed for different use cases:

#### `generate_weekly_digest` - Curated Summary

Creates a condensed, curated markdown summary of Regen Network activity. Best for quick overview and reading in Claude.

**Features:**
- Executive summary with key highlights
- Curated selection of important discussions and updates
- Governance analysis and community insights
- On-chain metrics summary
- Automatically aggregates content from the past 7 days (or custom date range)

**Examples:**
```
"Generate a weekly digest of Regen Network activity"
"Create a digest from December 1 to December 8, 2024"
"Generate a weekly digest and save it to weekly_summary.md"
```

#### `get_notebooklm_export` - Full Content Export

Returns the complete, unabridged source material. Best for deep analysis or loading into NotebookLM.

**Features:**
- **Full forum thread posts** - Complete text of all posts, not just summaries
- **Complete Notion page content** - All chunks combined into full documents
- **Enriched URLs** - Metadata and context for linked resources
- **Detailed source material** - Everything you need for thorough analysis
- Generates on demand if no recent cached version exists (takes 2-3 minutes)

**Examples:**
```
"Get the full NotebookLM export"
"Get the complete weekly content with all forum posts"
"Export the full source material and save it to notebooklm_export.md"
```

**When to use which:**
- Use `generate_weekly_digest` for a quick, readable summary
- Use `get_notebooklm_export` when you need raw source content for deep analysis, fact-checking, or loading into external tools like NotebookLM

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
