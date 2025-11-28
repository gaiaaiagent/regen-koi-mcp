# Deployment Runbook

**Document Version:** 2.0 (Phase 7 Production-Ready)
**Last Updated:** 2025-11-27
**Maintainer:** Regen Network Development Team

---

## Table of Contents

1. [Production Environment](#production-environment)
2. [Pre-Deployment Checklist](#pre-deployment-checklist)
3. [Deployment Process](#deployment-process)
4. [Rollback Procedure](#rollback-procedure)
5. [Health Checks](#health-checks)
6. [Monitoring and Logs](#monitoring-and-logs)
7. [Troubleshooting](#troubleshooting)
8. [Server-Side Tasks](#server-side-tasks)

---

## Production Environment

### Server Details

- **Host:** `202.61.196.119`
- **User:** `darren`
- **SSH Access:** `ssh darren@202.61.196.119`
- **Project Directory:** `/opt/projects/regen-koi-mcp` (verify actual location on server)
- **Node Version:** v18+ (LTS recommended)
- **Process Manager:** PM2 (or systemd - verify on server)

### Architecture

```
┌─────────────────────────────────────────────┐
│  Claude Code (MCP Client)                   │
└─────────────┬───────────────────────────────┘
              │ stdio
              ▼
┌─────────────────────────────────────────────┐
│  KOI MCP Server (index.ts)                  │
│  - Port: N/A (stdio-based MCP protocol)     │
│  - Logging: stderr (via pino)               │
│  - Metrics: in-memory                       │
│  - Features: Retry, Circuit Breaker, Cache  │
└─────────────┬───────────────────────────────┘
              │ HTTP API calls
              ▼
┌─────────────────────────────────────────────┐
│  KOI Query API (koi-query-api.ts)           │
│  - Port: 3030 (verify on server)            │
│  - Runtime: Bun                             │
└─────────────┬───────────────────────────────┘
              │ Cypher queries
              ▼
┌─────────────────────────────────────────────┐
│  PostgreSQL + Apache AGE                    │
│  - Port: 5432                               │
│  - Database: postgres                       │
│  - Graph: regen_graph_v2                    │
└─────────────────────────────────────────────┘
```

### Dependencies

- **PostgreSQL** with Apache AGE extension
- **Node.js** v18+ (for MCP server)
- **Bun** v1.0+ (for Query API)
- **npm packages:** pino, lru-cache, zod, @modelcontextprotocol/sdk

---

## Pre-Deployment Checklist

Before deploying to production, verify:

- [ ] All tests pass locally (`npm run build`)
- [ ] Code reviewed and approved (see PHASE_7_REVIEW.md)
- [ ] Dependencies updated (`npm install`)
- [ ] Environment variables set (if any - check .env.example)
- [ ] Database migrations applied (if any)
- [ ] Backup created (see [Backup Procedure](#backup-procedure))
- [ ] Team notified of deployment window
- [ ] Rollback plan ready

---

## Deployment Process

### Standard Deployment (Local Development → Production Server)

#### Step 1: Prepare Local Changes

```bash
# On local machine (/Users/darrenzal/projects/RegenAI/regen-koi-mcp)

# Verify build passes
npm run build

# Commit changes
git add .
git commit -m "feat: [description of changes]"

# Push to GitHub
git push origin main
```

#### Step 2: SSH to Production Server

```bash
ssh darren@202.61.196.119
```

#### Step 3: Navigate to Project Directory

```bash
cd /opt/projects/regen-koi-mcp
# (Verify actual path - may be ~/regen-koi-mcp or elsewhere)
```

#### Step 4: Pull Latest Changes

```bash
# Backup current version (optional but recommended)
git rev-parse HEAD > .last-deploy-commit

# Fetch and pull
git fetch origin
git pull origin main

# Verify correct branch
git branch
```

#### Step 5: Install Dependencies

```bash
# Install production dependencies
npm install --production

# If dev dependencies needed for build:
npm install
```

#### Step 6: Build TypeScript

```bash
npm run build
```

**Expected Output:**
```
> build
> tsc
[no errors]
```

#### Step 7: Restart MCP Server

**If using PM2:**
```bash
pm2 restart regen-koi-mcp
# OR
pm2 restart all
```

**If using systemd:**
```bash
sudo systemctl restart regen-koi-mcp
```

**If manual process:**
```bash
# Find process ID
ps aux | grep "node.*index.js"

# Kill gracefully
kill -SIGTERM <PID>

# Restart (method depends on how it's launched)
npm start &
```

#### Step 8: Verify Deployment

See [Health Checks](#health-checks) section below.

---

## Rollback Procedure

If deployment fails or introduces critical issues:

### Quick Rollback (Last Commit)

```bash
# On production server
cd /opt/projects/regen-koi-mcp

# Get last working commit
LAST_COMMIT=$(cat .last-deploy-commit)

# Rollback code
git reset --hard $LAST_COMMIT

# Reinstall dependencies (in case package.json changed)
npm install --production

# Rebuild
npm run build

# Restart
pm2 restart regen-koi-mcp
# OR
sudo systemctl restart regen-koi-mcp
```

### Rollback to Specific Version

```bash
# View recent commits
git log --oneline -10

# Rollback to specific commit
git reset --hard <commit-hash>

# Follow steps 5-7 from deployment process
npm install --production
npm run build
pm2 restart regen-koi-mcp
```

### Emergency Rollback (Database Issues)

If database schema changes caused issues:

```bash
# Restore database from backup (see Backup Procedure)
# Rollback code to matching version
git reset --hard <pre-migration-commit>

# Restart services
pm2 restart all
```

---

## Health Checks

### After Deployment Verification

#### 1. Process Running Check

**PM2:**
```bash
pm2 status

# Expected output:
# ┌─────┬──────────────────┬─────────┬─────────┐
# │ id  │ name             │ status  │ restart │
# ├─────┼──────────────────┼─────────┼─────────┤
# │ 0   │ regen-koi-mcp    │ online  │ 0       │
# └─────┴──────────────────┴─────────┴─────────┘
```

**systemd:**
```bash
sudo systemctl status regen-koi-mcp

# Expected output includes:
# Active: active (running)
```

#### 2. Log Check

```bash
# PM2 logs (last 50 lines)
pm2 logs regen-koi-mcp --lines 50

# systemd logs
journalctl -u regen-koi-mcp -n 50 --no-pager

# Check for errors
pm2 logs --err
```

**Look for:**
- ✅ "MCP server running on stdio"
- ✅ No error messages
- ✅ Structured JSON logs (pino format)

#### 3. Functional Test

**Option A: Use Claude Code (MCP Client)**

In Claude Code, run a test query:
```
Can you test the KOI MCP server by running:
1. get_stats with detailed=true
2. query_code_graph with query_type=list_repos
```

**Expected Results:**
- Tool executes successfully
- Returns structured data
- No validation errors

**Option B: Check Metrics Tool**

```
Can you run get_mcp_metrics and verify:
- Cache hit rates are reported
- Latency percentiles show reasonable values (p95 < 500ms)
- No circuit breakers in "open" state
```

#### 4. Database Connectivity Check

```bash
# On server, test PostgreSQL connection
psql -U postgres -c "SELECT count(*) FROM ag_catalog.ag_graph WHERE name = 'regen_graph_v2';"

# Expected output: count = 1
```

#### 5. API Connectivity Check

```bash
# Test KOI Query API (if running separately)
curl http://localhost:3030/health
# Expected: {"status": "ok"}

# Test graph query endpoint
curl -X POST http://localhost:3030/query \
  -H "Content-Type: application/json" \
  -d '{"query_type": "list_repos"}'

# Expected: JSON array of repositories
```

---

## Monitoring and Logs

### Log Locations

#### MCP Server Logs

**PM2 Logs:**
```bash
# Real-time logs
pm2 logs regen-koi-mcp

# Error logs only
pm2 logs regen-koi-mcp --err

# Last 100 lines
pm2 logs regen-koi-mcp --lines 100

# Log files location
~/.pm2/logs/regen-koi-mcp-out.log
~/.pm2/logs/regen-koi-mcp-error.log
```

**systemd Logs:**
```bash
# Real-time logs
journalctl -u regen-koi-mcp -f

# Last 100 lines
journalctl -u regen-koi-mcp -n 100

# Since specific time
journalctl -u regen-koi-mcp --since "1 hour ago"

# Filter by priority (errors only)
journalctl -u regen-koi-mcp -p err
```

#### PostgreSQL Logs

```bash
# Default location (verify with `SHOW log_directory;` in psql)
sudo tail -f /var/log/postgresql/postgresql-*.log
```

#### System Logs

```bash
# General system logs
sudo journalctl -xe

# Disk space
df -h

# Memory usage
free -m

# Process info
top -b -n 1 | head -20
```

### Metrics Monitoring

#### Using get_mcp_metrics Tool

In Claude Code:
```
Run get_mcp_metrics to see:
- Query latencies (p50, p95, p99)
- Cache hit rates
- Error rates by tool
- Circuit breaker states
```

#### Analyzing Metrics

**Good Health Indicators:**
- ✅ p95 latency < 500ms
- ✅ Cache hit rate > 50%
- ✅ Error rate < 5%
- ✅ All circuit breakers in "closed" state

**Warning Signs:**
- ⚠️ p95 latency > 1000ms → Check database performance
- ⚠️ Cache hit rate < 20% → Cache not warming properly
- ⚠️ Error rate > 10% → Investigate error logs
- ⚠️ Circuit breaker "open" → Dependency is down

---

## Troubleshooting

### Common Issues

#### Issue 1: MCP Server Won't Start

**Symptoms:**
```bash
pm2 status
# Status: errored or stopped
```

**Diagnosis:**
```bash
pm2 logs regen-koi-mcp --err --lines 50
```

**Common Causes:**

1. **TypeScript Build Failed**
   ```bash
   npm run build
   # Check for compilation errors
   ```

2. **Missing Dependencies**
   ```bash
   npm install
   npm run build
   pm2 restart regen-koi-mcp
   ```

3. **Port Already in Use** (if using HTTP)
   ```bash
   lsof -i :3000
   kill -9 <PID>
   ```

4. **Database Connection Failed**
   ```bash
   psql -U postgres -c "SELECT 1"
   # Verify PostgreSQL is running
   sudo systemctl status postgresql
   ```

---

#### Issue 2: Slow Query Performance

**Symptoms:**
- get_mcp_metrics shows p95 > 2000ms
- Queries timeout

**Diagnosis:**

1. **Check Database Load**
   ```sql
   -- Connect to PostgreSQL
   psql -U postgres

   -- Check active queries
   SELECT pid, state, query, query_start
   FROM pg_stat_activity
   WHERE state = 'active'
   ORDER BY query_start;

   -- Check slow queries
   SELECT query, calls, mean_exec_time
   FROM pg_stat_statements
   ORDER BY mean_exec_time DESC
   LIMIT 10;
   ```

2. **Check Cache Hit Rate**
   ```
   Run get_mcp_metrics
   # If cache hit rate < 20%, cache may not be warming
   ```

3. **Check System Resources**
   ```bash
   top -b -n 1 | head -20
   df -h
   iostat -x 1 5
   ```

**Solutions:**

- **Add Database Indexes** (see [Server-Side Tasks](#server-side-tasks))
- **Increase Cache TTLs** (edit src/cache.ts)
- **Optimize Cypher Queries** (see slow query log)
- **Scale Database** (increase memory/CPU if needed)

---

#### Issue 3: Validation Errors

**Symptoms:**
```
Validation Error: entity_name: Invalid characters
```

**Diagnosis:**
- Check input parameters in client
- Review validation.ts schemas

**Solutions:**

1. **Check Input Format**
   - Entity names: `[a-zA-Z0-9_\-. ]+`
   - Dates: `YYYY-MM-DD`
   - Identifiers: Start with letter, alphanumeric + underscore

2. **Update Schema if Needed**
   ```typescript
   // In src/validation.ts
   // Adjust regex patterns if legitimate inputs are being rejected
   ```

---

#### Issue 4: Circuit Breaker Open

**Symptoms:**
```
Error: Circuit breaker 'graph-api' is open
```

**Diagnosis:**
```bash
# Check if API is responding
curl http://localhost:3030/health

# Check API logs
pm2 logs koi-query-api

# Check error count in metrics
# Run get_mcp_metrics
```

**Solutions:**

1. **Verify Dependency Health**
   ```bash
   # Restart Query API
   pm2 restart koi-query-api

   # Restart Database
   sudo systemctl restart postgresql
   ```

2. **Manual Circuit Breaker Reset**
   ```typescript
   // In src/resilience.ts, call:
   circuitBreakers.graphApi.reset();
   ```

3. **Adjust Thresholds** (if false positives)
   ```typescript
   // In src/resilience.ts
   graphApi: new CircuitBreaker('graph-api', {
     failureThreshold: 10,  // Increase from 5
     resetTimeoutMs: 120000  // Increase from 60s
   })
   ```

---

#### Issue 5: Memory Leak

**Symptoms:**
- Process memory grows over time
- Server becomes unresponsive
- OOM (Out of Memory) errors

**Diagnosis:**
```bash
# Monitor memory usage
watch -n 5 'ps aux | grep node'

# PM2 monitoring
pm2 monit

# Node.js heap dump (requires --inspect flag)
node --inspect dist/index.js
# Then use Chrome DevTools
```

**Solutions:**

1. **Check Cache Size**
   ```typescript
   // In src/cache.ts, verify max sizes
   static: { maxSize: 100 }     // ~1MB
   semi_static: { maxSize: 200 } // ~2MB
   dynamic: { maxSize: 500 }     // ~5MB
   volatile: { maxSize: 100 }    // ~1MB
   ```

2. **Check Metrics Storage**
   ```typescript
   // In src/metrics.ts, verify sliding window
   private maxSamples = 1000; // Limits latency array size
   ```

3. **Restart Process** (temporary fix)
   ```bash
   pm2 restart regen-koi-mcp
   ```

4. **Implement Restart Cron** (if persistent)
   ```bash
   # Add to crontab: Restart daily at 3am
   0 3 * * * pm2 restart regen-koi-mcp
   ```

---

## Server-Side Tasks

These tasks must be performed on the production server.

### Database Optimization

#### Add Indexes for Common Queries

```sql
-- Connect to PostgreSQL
psql -U postgres

-- Switch to AGE-enabled database
\c postgres

-- Add indexes on vertex properties
CREATE INDEX IF NOT EXISTS idx_vertex_name
  ON ag_catalog.regen_graph_v2_vertex ((properties->>'name'));

CREATE INDEX IF NOT EXISTS idx_vertex_entity_type
  ON ag_catalog.regen_graph_v2_vertex ((properties->>'entity_type'));

CREATE INDEX IF NOT EXISTS idx_vertex_repo
  ON ag_catalog.regen_graph_v2_vertex ((properties->>'repo'));

CREATE INDEX IF NOT EXISTS idx_vertex_module
  ON ag_catalog.regen_graph_v2_vertex ((properties->>'module'));

-- Add indexes on edge properties (if needed)
CREATE INDEX IF NOT EXISTS idx_edge_relationship
  ON ag_catalog.regen_graph_v2_edge ((properties->>'relationship_type'));

-- Verify indexes
\di ag_catalog.*vertex*
\di ag_catalog.*edge*

-- Analyze tables
ANALYZE ag_catalog.regen_graph_v2_vertex;
ANALYZE ag_catalog.regen_graph_v2_edge;
```

#### Analyze Query Performance

```sql
-- Enable query timing
\timing on

-- Run EXPLAIN ANALYZE on slow queries
EXPLAIN ANALYZE
SELECT * FROM cypher('regen_graph_v2', $$
  MATCH (e:Entity {name: 'MsgCreateBatch'})
  RETURN e
$$) AS (e agtype);

-- Check for sequential scans (bad) vs index scans (good)
-- Look for "Seq Scan" in output → add index
-- Look for "Index Scan" → good performance
```

---

### Backup Procedure

#### Manual Database Backup

```bash
# On production server
cd /opt/backups  # Or preferred backup location

# Create backup directory
mkdir -p db-backups

# Full database dump
pg_dump -U postgres -Fc postgres > db-backups/postgres-$(date +%Y%m%d-%H%M%S).dump

# Verify backup
ls -lh db-backups/

# Keep last 30 days only
find db-backups/ -name "postgres-*.dump" -mtime +30 -delete
```

#### Automated Backup Script

Create `/opt/scripts/backup-koi-db.sh`:

```bash
#!/bin/bash

BACKUP_DIR="/opt/backups/db-backups"
DATE=$(date +%Y%m%d-%H%M%S)
FILENAME="postgres-$DATE.dump"

# Create backup
pg_dump -U postgres -Fc postgres > "$BACKUP_DIR/$FILENAME"

# Compress (optional)
gzip "$BACKUP_DIR/$FILENAME"

# Delete backups older than 30 days
find "$BACKUP_DIR" -name "postgres-*.dump.gz" -mtime +30 -delete

# Log
echo "[$DATE] Backup completed: $FILENAME.gz" >> /var/log/koi-backup.log
```

**Make executable:**
```bash
chmod +x /opt/scripts/backup-koi-db.sh
```

**Schedule with cron:**
```bash
crontab -e

# Add daily backup at 2am
0 2 * * * /opt/scripts/backup-koi-db.sh
```

#### Restore from Backup

```bash
# List available backups
ls -lh /opt/backups/db-backups/

# Restore (CAUTION: overwrites database)
pg_restore -U postgres -d postgres -c /opt/backups/db-backups/postgres-20251127-020000.dump.gz

# Verify
psql -U postgres -c "SELECT count(*) FROM ag_catalog.ag_graph WHERE name = 'regen_graph_v2';"
```

---

### API Rate Limiting

**Location:** `/opt/projects/koi-processor/koi-query-api.ts` (or similar)

Add rate limiting middleware to the Bun server:

```typescript
import { RateLimiter } from 'bun-rate-limit';

const limiter = new RateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 60,     // 60 requests per minute
  message: 'Too many requests, please try again later.'
});

// Apply to all routes
server.use(limiter.middleware());
```

**Or use IP-based rate limiting:**

```typescript
const ipLimits = new Map<string, { count: number; resetTime: number }>();

function rateLimitMiddleware(req: Request): Response | null {
  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  const now = Date.now();
  const limit = ipLimits.get(ip);

  if (!limit || now > limit.resetTime) {
    ipLimits.set(ip, { count: 1, resetTime: now + 60000 });
    return null; // Allow
  }

  if (limit.count >= 60) {
    return new Response('Rate limit exceeded', { status: 429 });
  }

  limit.count++;
  return null; // Allow
}
```

---

### Connection Pooling

PostgreSQL connection pooling should be handled server-side in the Query API.

**Example using `pg` library:**

```typescript
import { Pool } from 'pg';

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: process.env.DB_PASSWORD,
  max: 20,              // Max connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Use pooled connections
export async function query(sql: string, params: any[]) {
  const client = await pool.connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}
```

---

## Emergency Contacts

**For Production Issues:**

- **Primary:** Darren (server owner)
- **Secondary:** Regen Network DevOps Team
- **Database Issues:** PostgreSQL DBA (if available)

**Escalation Path:**

1. Check logs and metrics
2. Attempt standard troubleshooting (see above)
3. Rollback if critical issue
4. Contact team lead
5. Document incident for postmortem

---

## Appendix

### Useful Commands Cheat Sheet

```bash
# SSH to server
ssh darren@202.61.196.119

# Navigate to project
cd /opt/projects/regen-koi-mcp

# View logs
pm2 logs regen-koi-mcp
pm2 logs regen-koi-mcp --err
journalctl -u regen-koi-mcp -f

# Restart services
pm2 restart regen-koi-mcp
pm2 restart all
sudo systemctl restart regen-koi-mcp

# Check status
pm2 status
sudo systemctl status regen-koi-mcp

# Database access
psql -U postgres
# In psql:
\c postgres
\dt ag_catalog.*
\q

# Disk space
df -h

# Process monitoring
top
htop
pm2 monit

# Git operations
git status
git log --oneline -10
git pull origin main
git reset --hard <commit>
```

### Environment Variables

**Check current environment:**
```bash
# On server
cat .env  # If using .env file
pm2 env 0  # Show PM2 environment variables
```

**Common Variables:**
- `LOG_LEVEL` - pino log level (default: "info")
- `GRAPH_API_URL` - KOI Query API endpoint
- `DB_HOST`, `DB_PORT`, `DB_NAME` - PostgreSQL config (server-side)

---

## Document History

| Version | Date       | Author | Changes                        |
|---------|------------|--------|--------------------------------|
| 1.0     | 2025-11-XX | Team   | Initial deployment guide       |
| 2.0     | 2025-11-27 | Claude | Phase 7 production hardening   |

---

**End of Deployment Runbook**
