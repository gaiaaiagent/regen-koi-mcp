# 🌱 Regen KOI MCP Server

Access Regen Network's Knowledge Organization Infrastructure (KOI) through Model Context Protocol (MCP) tools in Claude Desktop, VSCode, and other MCP-compatible clients.

## 🚀 Quick Start

```bash
# Clone the repository
git clone https://github.com/gaiaaiagent/regen-koi-mcp
cd regen-koi-mcp

# Install dependencies
npm install

# Run automated setup (configures Claude Desktop & VSCode automatically)
npm run setup
```

That's it! The setup script will automatically configure the MCP server for your installed clients. Just restart Claude Desktop or reload VSCode to see the tools.

## 🎯 What This Does

This MCP server gives AI assistants access to Regen Network's comprehensive knowledge base with 15,000+ documents about:
- Carbon credits and ecological assets
- Regenerative agriculture practices
- Blockchain and Web3 sustainability
- Climate action and environmental data
- Regen Registry credit classes

**Note:** This MCP server connects to our hosted KOI API at `http://202.61.196.119:8301`, so you don't need to run any infrastructure locally.

## 📦 Available Tools

| Tool | Description | Example Query |
|------|-------------|---------------|
| `search_knowledge` | Search the KOI knowledge base | "carbon sequestration methods" |
| `get_entity` | Get specific entity information | "regen1234..." |
| `query_graph` | Execute SPARQL queries | Complex graph queries |
| `get_stats` | Get knowledge base statistics | Database metrics |
| `list_credit_classes` | List Regen Registry credit classes | Active carbon credits |
| `get_recent_activity` | Get recent network activity | Last 24 hours |

### Graph‑Aware Tools (Enhanced)
- `predicate_community_summary` — View predicate communities (size, members)
- `canonical_summary` — View canonical categories and top predicates per category

## 💻 Supported Clients

### Claude Desktop ✅

The setup script automatically configures Claude Desktop. After running `npm run setup`, just restart Claude Desktop and you'll see the tools available.

### Claude Code CLI ✅

The setup script automatically configures Claude Code CLI. After running `npm run setup`, just restart Claude Code and you'll see the tools available.

### VSCode Extensions

#### Cline (Claude Dev) ✅
Install from: [VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=saoudrizwan.claude-dev)

#### Continue ✅
Install from: [VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=Continue.continue)

The setup script configures both extensions automatically.

### Other Clients

Any MCP-compatible client can use this server. Configure with:

```json
{
  "command": "node",
  "args": ["/path/to/regen-koi-mcp/dist/index.js"],
  "env": {
    "KOI_API_ENDPOINT": "http://localhost:8301/api/koi"
  }
}
```

## 🔧 Manual Setup

### Claude Desktop

1. Find your config file:
   - **Mac**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
   - **Linux**: `~/.config/Claude/claude_desktop_config.json`

2. Add the server configuration:

```json
{
  "mcpServers": {
    "regen-koi": {
      "command": "node",
      "args": ["/absolute/path/to/regen-koi-mcp/dist/index.js"],
      "env": {
        "KOI_API_ENDPOINT": "http://202.61.196.119:8301/api/koi"
      }
    }
  }
}
```

3. Restart Claude Desktop

### Claude Code CLI

Run the following command to configure the MCP server:

```bash
claude mcp add-json regen-koi '{"command":"node","args":["/absolute/path/to/regen-koi-mcp/dist/index.js"],"env":{"KOI_API_ENDPOINT":"http://202.61.196.119:8301/api/koi"}}'
```

Replace `/absolute/path/to/regen-koi-mcp` with the actual path to your installation.

### NPX Usage (No Installation)

You can also run directly from npm:

```json
{
  "mcpServers": {
    "regen-koi": {
      "command": "npx",
      "args": ["-y", "regen-koi-mcp"],
      "env": {
        "KOI_API_ENDPOINT": "http://localhost:8301/api/koi"
      }
    }
  }
}
```

## 🌍 Environment Configuration

Create a `.env` file in the project root:

```env
# Required: KOI API endpoint
KOI_API_ENDPOINT=http://localhost:8301/api/koi

# Optional: API key if your KOI server requires authentication
# KOI_API_KEY=your_api_key_here

# Graph + NL→SPARQL configuration
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

- Adaptive dual‑branch execution:
  - Focused: top‑K predicates via embeddings + usage + community expansion
  - Broad: entity/topic regex over all predicates
  - Canonical‑aware filtering (keywords → `regx:canonicalPredicate`) applied by default
  - Smart fallback: if canonical returns 0 results, retry broad without canonical to recover recall
- Results fused with Reciprocal Rank Fusion (RRF) for precision + recall

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
The setup connects to our hosted KOI API at `http://202.61.196.119:8301`. If you see connection errors, check your internet connection or firewall settings.

### "Tools not showing in Claude"
1. Restart Claude Desktop after configuration
2. Check the config file syntax is valid JSON
3. Ensure the path to `index.js` is absolute

### "Command not found"
Make sure Node.js is installed and in your PATH. The setup script uses `node` command.

## 📚 Example Usage

Once configured, you can ask Claude:

- "Search the KOI knowledge base for information about carbon credits"
- "Get statistics about the knowledge base"
- "List active Regen Registry credit classes"
- "Find recent activity on the Regen Network"

## 🤝 Contributing

Contributions welcome! Please feel free to submit issues and pull requests.

## 📄 License

MIT License - see LICENSE file for details

## 🔗 Links

- [GitHub Repository](https://github.com/gaiaaiagent/regen-koi-mcp)
- [Regen Network](https://www.regen.network)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [Claude Desktop](https://claude.ai/download)

## 🌟 Credits

Built by the Regen Network community to make ecological knowledge accessible to AI assistants everywhere.

---

*For self-hosting the KOI knowledge processing pipeline, see our [KOI Processor](https://github.com/gaiaaiagent/koi-processor) repository.*
