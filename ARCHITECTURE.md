# 🏗️ KOI MCP Architecture

This document explains the different ways to deploy and use the Regen KOI MCP server.

## 📋 Deployment Options

### Option 1: Hosted API (Recommended for Most Users)

**What you get:**
- ✅ Instant access to 15,000+ documents about Regen Network
- ✅ No infrastructure to maintain
- ✅ Weekly digest generation
- ✅ Hybrid search with vectors + graph

**What you need:**
- Node.js 16+
- Claude Desktop or other MCP client
- Internet connection

**Setup:**
```bash
git clone https://github.com/gaiaaiagent/regen-koi-mcp
cd regen-koi-mcp
./setup.sh
```

That's it! The MCP client connects to `https://regen.gaiaai.xyz/api/koi`

---

### Option 2: Self-Hosted API Server (Database Access Only)

**What you get:**
- ✅ Full control over API server
- ✅ Direct database access
- ✅ Custom configuration
- ⚠️ Database is **read-only** - you query existing data but don't collect new data

**What you need:**
- Everything from Option 1
- PostgreSQL database with KOI data
- (Optional) BGE embedding server

**Setup:**
```bash
# 1. Clone the repo
git clone https://github.com/gaiaaiagent/regen-koi-mcp
cd regen-koi-mcp

# 2. Setup MCP client
./setup.sh

# 3. Setup API server
cd server
./setup.sh

# 4. Configure database connection
cat > .env << EOF
KOI_DB_HOST=localhost
KOI_DB_PORT=5432
KOI_DB_NAME=eliza
KOI_DB_USER=postgres
KOI_DB_PASSWORD=postgres
BGE_SERVER_URL=http://localhost:8090
KOI_API_PORT=8301
EOF

# 5. Start the server
./start.sh -b

# 6. Update MCP client config to use local server
# Edit claude_desktop_config.json:
# "KOI_API_ENDPOINT": "http://localhost:8301/api/koi"
```

**Database Requirements:**
- PostgreSQL 14+ with pgvector extension
- Tables: `koi_memories`, `koi_embeddings`
- Schema: See [koi-processor](https://github.com/gaiaaiagent/koi-processor) for schema details

---

### Option 3: Full Self-Hosted Pipeline (Data Collection + Processing + API)

**What you get:**
- ✅ Complete control over data sources
- ✅ Live data collection from Discourse, Ledger, etc.
- ✅ Custom processing pipeline
- ✅ Full data sovereignty

**What you need:**
- Everything from Option 2
- Additional repositories:
  - [koi-sensors](https://github.com/gaiaaiagent/koi-sensors) - Data collection
  - [koi-processor](https://github.com/gaiaaiagent/koi-processor) - Data processing

**Architecture:**
```
┌─────────────────────────────────────────────────────────────┐
│                     KOI Full Pipeline                        │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐      ┌──────────────┐      ┌───────────┐ │
│  │ koi-sensors  │ ───▶ │  PostgreSQL  │ ◀─── │ koi-      │ │
│  │              │      │  (Database)  │      │ processor │ │
│  │ - Discourse  │      │              │      │           │ │
│  │ - Ledger     │      │ koi_memories │      │ - Batch   │ │
│  │ - Website    │      │ koi_embed... │      │ - Graph   │ │
│  └──────────────┘      └──────────────┘      └───────────┘ │
│                               │                              │
│                               ▼                              │
│                     ┌──────────────────┐                     │
│                     │  KOI API Server  │                     │
│                     │  (FastAPI)       │                     │
│                     │  - Search        │                     │
│                     │  - Digest        │                     │
│                     │  - Stats         │                     │
│                     └──────────────────┘                     │
│                               │                              │
└───────────────────────────────┼──────────────────────────────┘
                                ▼
                     ┌──────────────────┐
                     │  MCP Client      │
                     │  (This Repo)     │
                     └──────────────────┘
                                │
                                ▼
                     ┌──────────────────┐
                     │ Claude Desktop   │
                     │ VSCode/Cline     │
                     │ Claude Code CLI  │
                     └──────────────────┘
```

**Setup:**
```bash
# 1. Clone all repositories
git clone https://github.com/gaiaaiagent/koi-sensors
git clone https://github.com/gaiaaiagent/koi-processor
git clone https://github.com/gaiaaiagent/regen-koi-mcp

# 2. Setup PostgreSQL database
# See koi-processor/docs/database-setup.md

# 3. Setup and start sensors
cd koi-sensors
./setup_all.sh
./start_all.sh

# 4. Setup processor (for batch processing)
cd ../koi-processor
./setup.sh

# 5. Setup KOI API server
cd ../regen-koi-mcp/server
./setup.sh
./start.sh -b

# 6. Setup MCP client
cd ..
./setup.sh
# Configure to use local server in claude_desktop_config.json
```

**Additional Setup Required:**
- Discourse API keys
- Regen Ledger RPC endpoints
- BGE embedding server
- Apache Jena Fuseki (for graph queries)

See individual repository READMEs for detailed setup:
- [koi-sensors README](https://github.com/gaiaaiagent/koi-sensors)
- [koi-processor README](https://github.com/gaiaaiagent/koi-processor)

---

## 🔍 Component Breakdown

### This Repository (`regen-koi-mcp`)

**Contains:**
- MCP client (TypeScript) - Connects to KOI API
- KOI API server (Python/FastAPI) - Serves knowledge base via REST API
- Weekly digest generator (Python) - Creates comprehensive summaries

**Does NOT contain:**
- Data collection sensors
- Batch processing pipeline
- Database schema/migrations

### External Dependencies

**For data collection:**
- [koi-sensors](https://github.com/gaiaaiagent/koi-sensors) - Real-time data collectors
  - Discourse sensor (forum posts)
  - Ledger sensor (blockchain data)
  - Website sensor (regentokenomics.org)
  - And more...

**For data processing:**
- [koi-processor](https://github.com/gaiaaiagent/koi-processor) - Batch processing pipeline
  - Document chunking
  - Embedding generation
  - Graph construction
  - Weekly curator (LLM-enhanced digests)

---

## 🎯 Which Option Should You Choose?

### Choose Option 1 (Hosted API) if:
- ✅ You just want to use KOI in Claude Desktop/VSCode
- ✅ You don't need to customize data sources
- ✅ You're okay with using our hosted infrastructure
- ✅ You want zero maintenance

### Choose Option 2 (Self-Hosted API) if:
- ✅ You want direct database access
- ✅ You have privacy/sovereignty requirements
- ✅ You want to run custom queries
- ✅ You're okay with using our data collection
- ⚠️ You can maintain PostgreSQL + Python services

### Choose Option 3 (Full Pipeline) if:
- ✅ You want complete control over data sources
- ✅ You need to customize what data is collected
- ✅ You want to add your own sensors
- ✅ You want to modify processing logic
- ⚠️ You can maintain multiple services (DB, sensors, processor, API)

---

## 🔒 Security & Privacy

### Hosted API (Option 1)
- Your queries are sent to `https://regen.gaiaai.xyz/api/koi`
- HTTPS encrypted in transit
- No query logging (we don't store search queries)
- Authentication via HTTP Basic Auth

### Self-Hosted (Options 2 & 3)
- All data stays on your infrastructure
- You control access and logging
- Full audit trail capability

---

## 📊 Performance Considerations

### Hosted API
- **Latency:** ~500ms for search queries (includes network + processing)
- **Availability:** 99.5% uptime target
- **Rate Limits:** None currently, fair use expected

### Self-Hosted
- **Latency:** ~100-200ms for search queries (local network)
- **Availability:** Your responsibility
- **Scaling:** You control resources

---

## 🆘 Support

### For Option 1 (Hosted API):
- GitHub Issues: https://github.com/gaiaaiagent/regen-koi-mcp/issues
- Discord: [Regen Network Discord](https://discord.gg/regen-network)

### For Options 2 & 3 (Self-Hosted):
- Check repository-specific docs:
  - [koi-sensors issues](https://github.com/gaiaaiagent/koi-sensors/issues)
  - [koi-processor issues](https://github.com/gaiaaiagent/koi-processor/issues)
- Community support in Discord

---

## 🔮 Future Enhancements

**Planned for regen-koi-mcp:**
- [ ] Database schema migrations in this repo
- [ ] Docker compose for easy self-hosting
- [ ] One-command setup for Option 2
- [ ] Monitoring and health checks
- [ ] Rate limiting and API key support

**Contribute:**
We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## 📚 Additional Resources

- [Main README](README.md) - Quick start guide
- [MCP Protocol Docs](https://modelcontextprotocol.io)
- [Regen Network](https://www.regen.network)
- [KOI Overview](https://docs.regen.network/koi) *(coming soon)*
