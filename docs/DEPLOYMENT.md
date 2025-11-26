# Production Deployment Guide

Step-by-step guide for deploying the Regen KOI MCP server to production.

## Prerequisites

Before deploying, ensure you have:
- SSH access to the production server
- PostgreSQL with pgvector running
- (Optional) Apache AGE for graph queries
- Node.js 18+ or Bun installed

## Deployment Steps

### 1. Pull Latest Code

```bash
ssh your-server
cd /opt/projects/regen-koi-mcp
git pull origin main
```

### 2. Install Dependencies

```bash
npm install
# or
bun install
```

### 3. Build the Project

```bash
npm run build
# or
bun run build
```

### 4. Configure Environment

```bash
# Copy example if first time
cp .env.example .env

# Edit with production values
nano .env
```

Required variables:
```bash
KOI_API_ENDPOINT=http://localhost:8301/api/koi
# Add others as needed - see .env.example
```

### 5. Verify Database Connection

```bash
# Test PostgreSQL connection
PGPASSWORD=your_password psql -h localhost -p 5432 -U postgres -d eliza -c "SELECT 1;"

# Check required extensions
PGPASSWORD=your_password psql -h localhost -p 5432 -U postgres -d eliza -c "SELECT extname FROM pg_extension;"
```

### 6. Apply Database Migrations (if needed)

```bash
# Apply any new SQL schemas
./scripts/deploy/setup-database.sh
```

### 7. Test the Server

```bash
# Run in foreground to test
node dist/index.js

# Or test specific tools
npm run test
```

### 8. Configure Systemd Service

```bash
# Copy service file
sudo cp regen-koi-mcp.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable and start
sudo systemctl enable regen-koi-mcp
sudo systemctl start regen-koi-mcp

# Check status
sudo systemctl status regen-koi-mcp
```

### 9. Verify Deployment

```bash
# Check logs
journalctl -u regen-koi-mcp -f

# Test MCP connection (if Claude Code configured)
# The tools should appear in Claude Code's tool list
```

## Updating an Existing Deployment

```bash
cd /opt/projects/regen-koi-mcp
git pull origin main
npm install
npm run build
sudo systemctl restart regen-koi-mcp
```

## Adding Apache AGE (Graph Queries)

If deploying to a server without Apache AGE:

### Option A: Install in Existing PostgreSQL

```bash
# Run the installation script
./scripts/deploy/install-apache-age.sh

# Apply graph schema
PGPASSWORD=your_password psql -h localhost -p 5432 -U postgres -d eliza \
  -f scripts/sql/graph_schema.sql
```

### Option B: Use Docker with AGE

See `docker/docker-compose.yml` for a pre-configured PostgreSQL with AGE.

### Option C: Skip Graph Queries

The server works without AGE - `query_code_graph` will return a helpful error message explaining the tool is unavailable.

## Loading Graph Data

After Apache AGE is installed:

```bash
cd /opt/projects/regen-koi-mcp

# 1. Extract entities from repositories
python python/scripts/multi_lang_extractor.py

# 2. Load entities into graph
python python/scripts/load_entities.py

# 3. Generate RAPTOR summaries (optional but recommended)
python python/scripts/raptor_summarizer.py

# 4. Create relationship edges
python python/scripts/create_mentions.py
```

## Rollback

If something goes wrong:

```bash
# Stop the service
sudo systemctl stop regen-koi-mcp

# Checkout previous version
git checkout <previous-commit-hash>

# Rebuild and restart
npm run build
sudo systemctl start regen-koi-mcp
```

## Monitoring

### Check Service Status
```bash
sudo systemctl status regen-koi-mcp
```

### View Logs
```bash
# Recent logs
journalctl -u regen-koi-mcp -n 100

# Follow logs
journalctl -u regen-koi-mcp -f
```

### Check Database
```bash
# Document count
psql -c "SELECT COUNT(*) FROM koi_memories;"

# Embedding count
psql -c "SELECT COUNT(*) FROM koi_embeddings;"

# Graph nodes (if AGE installed)
psql -c "SELECT * FROM cypher('regen_graph', \$\$ MATCH (n) RETURN labels(n), count(*) \$\$) as (label agtype, count agtype);"
```

## Troubleshooting

### Service won't start
1. Check logs: `journalctl -u regen-koi-mcp -n 50`
2. Test manually: `node dist/index.js`
3. Check environment: `cat .env`

### Tools not appearing in Claude Code
1. Verify MCP config in `~/.claude.json`
2. Check the path to `dist/index.js` is correct
3. Restart Claude Code

### Database connection errors
1. Check PostgreSQL is running: `pg_isready -h localhost -p 5432`
2. Verify credentials in `.env`
3. Check firewall rules

### Graph queries failing
1. Check AGE is installed: `SELECT * FROM pg_extension WHERE extname = 'age';`
2. Check graph exists: `SELECT * FROM ag_graph;`
3. Re-run: `psql -f scripts/sql/graph_schema.sql`
