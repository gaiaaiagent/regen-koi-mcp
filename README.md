# Regen KOI MCP Server

Access Regen Network's Knowledge Organization Infrastructure (KOI) through the Model Context Protocol (MCP) for AI agents like Claude.

## Features

- 🔍 **Semantic Search**: Query 15,000+ documents about ecological credits, methodologies, and governance
- 🌐 **Knowledge Graph**: Access structured data via SPARQL queries
- 📊 **Real-time Data**: Get latest credit issuances, proposals, and market activity
- 🤖 **AI-Optimized**: Designed for LLM agents with rich context and metadata

## Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/gaiaaiagent/regen-koi-mcp.git
cd regen-koi-mcp

# Install dependencies
npm install

# Build the server
npm run build
```

### Configuration

1. Copy the example environment file:
```bash
cp .env.example .env
```

2. (Optional) Add your API key for enhanced access:
```bash
# Edit .env and add your API key
KOI_API_KEY=your-api-key-here
```

> **Note**: The server works without an API key using anonymous access with rate limits.

### Usage with Claude Desktop

Add to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json` on Mac):

```json
{
  "mcpServers": {
    "regen-koi": {
      "command": "node",
      "args": ["/path/to/regen-koi-mcp/dist/index.js"],
      "env": {
        "KOI_API_ENDPOINT": "http://localhost:8301/api/koi"
      }
    }
  }
}
```

Or using npx (no installation required):

```json
{
  "mcpServers": {
    "regen-koi": {
      "command": "npx",
      "args": ["regen-koi-mcp"]
    }
  }
}
```

## Available Tools

### 🔎 `search_knowledge`
Search the KOI knowledge base using hybrid RAG (semantic + keyword search).

**Example queries:**
- "What are carbon credits?"
- "Biodiversity methodology requirements"
- "Recent governance proposals"

### 📋 `get_entity`
Retrieve detailed information about specific entities by RID or name.

**Examples:**
- Credit classes: `"orn:credit_class:C03"`
- Projects: `"Amazon Rainforest Conservation"`
- Methodologies: `"VM0042"`

### 🗄️ `query_graph`
Execute SPARQL queries for complex relationship queries.

**Example:**
```sparql
SELECT ?project ?class ?methodology
WHERE {
  ?project rdf:type koi:Project ;
           koi:creditClass ?class ;
           koi:methodology ?methodology .
}
LIMIT 10
```

### 📊 `get_stats`
Get statistics about the knowledge base including document counts and sources.

### 🌿 `list_credit_classes`
List all credit classes in the Regen Registry with their properties.

### 🔄 `get_recent_activity`
Get recent ecosystem activity including new credits, projects, and proposals.

## Advanced Configuration

### Self-Hosted Deployment

If you're running your own KOI infrastructure:

```bash
# .env configuration for self-hosted
KOI_API_ENDPOINT=http://your-server:8301/api/koi
KOI_SEARCH_ENDPOINT=http://your-server:8301/api/koi/query
KOI_STATS_ENDPOINT=http://your-server:8301/api/koi/stats
```

### API Rate Limits

- **Anonymous**: 100 requests/hour
- **Authenticated**: 1000 requests/hour
- **Enterprise**: Unlimited (contact us)

## Development

```bash
# Run in development mode
npm run dev

# Clean build artifacts
npm run clean

# Type checking
npm run type-check
```

## Architecture

This MCP server acts as a bridge between AI agents and Regen Network's KOI system:

```
Claude/AI Agent <-> MCP Protocol <-> KOI MCP Server <-> KOI Infrastructure
                                                          ├── Knowledge Graph (Jena)
                                                          ├── Vector Database (pgvector)
                                                          ├── Document Store (PostgreSQL)
                                                          └── Blockchain Data (Regen Ledger)
```

## Data Sources

The KOI system indexes and processes data from:

- 📚 **Documentation**: docs.regen.network, guides, whitepapers
- 🏛️ **Governance**: Forum discussions, proposals, voting records
- 🔬 **Methodologies**: Credit class specifications, validation procedures
- 🌍 **Projects**: Conservation initiatives, impact reports
- ⛓️ **Blockchain**: Real-time ledger data via Regen Network nodes
- 💬 **Community**: Discord, Twitter, blog posts

## Support

- **Documentation**: [docs.regen.network](https://docs.regen.network)
- **Issues**: [GitHub Issues](https://github.com/gaiaaiagent/regen-koi-mcp/issues)
- **Discord**: [Regen Network Discord](https://discord.gg/regen-network)
- **API Keys**: Contact team@regen.network

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Acknowledgments

Built by [Regen Network](https://regen.network) to enable AI agents to accurately understand and communicate about ecological assets and regenerative finance.

Special thanks to:
- Anthropic for the MCP specification
- The Regen Network community for continuous feedback
- Contributors to the KOI knowledge base