#!/bin/bash
# Setup database schema for Regen KOI MCP
# Applies migrations and enables extensions

set -e

echo "================================================"
echo "Regen KOI MCP - Database Setup"
echo "================================================"

# Configuration from environment or defaults
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-koi}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-postgres}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Find script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SQL_DIR="$PROJECT_ROOT/scripts/sql"

echo -e "\n${YELLOW}Database Configuration:${NC}"
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo "  Database: $DB_NAME"
echo "  User: $DB_USER"

# Export password for psql
export PGPASSWORD="$DB_PASSWORD"

# Test connection
echo -e "\n${YELLOW}Testing database connection...${NC}"
if ! psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" > /dev/null 2>&1; then
    echo -e "${RED}Error: Could not connect to database${NC}"
    echo "Please check your connection settings"
    exit 1
fi
echo -e "${GREEN}Connection successful!${NC}"

# Enable extensions
echo -e "\n${YELLOW}Enabling PostgreSQL extensions...${NC}"

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" << 'EOF'
-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Enable fuzzy matching
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Enable UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Try to enable Apache AGE (may not be installed)
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS age;
    LOAD 'age';
    SET search_path = ag_catalog, "$user", public;

    -- Create graph if AGE is available
    IF NOT EXISTS (SELECT * FROM ag_graph WHERE name = 'regen_graph') THEN
        PERFORM create_graph('regen_graph');
    END IF;

    RAISE NOTICE 'Apache AGE enabled and graph created';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Apache AGE not available - graph queries will be disabled';
END $$;

-- Show installed extensions
SELECT extname, extversion FROM pg_extension ORDER BY extname;
EOF

# Apply SQL schemas
echo -e "\n${YELLOW}Applying SQL schemas...${NC}"

if [ -d "$SQL_DIR" ]; then
    for sql_file in "$SQL_DIR"/*.sql; do
        if [ -f "$sql_file" ]; then
            echo "  Applying: $(basename "$sql_file")"
            psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$sql_file" 2>&1 | grep -v "^NOTICE:" || true
        fi
    done
else
    echo -e "${YELLOW}No SQL directory found at $SQL_DIR${NC}"
fi

# Verify setup
echo -e "\n${YELLOW}Verifying setup...${NC}"

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" << 'EOF'
\echo 'Checking tables...'
SELECT
    CASE
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'koi_memories')
        THEN 'koi_memories: EXISTS'
        ELSE 'koi_memories: MISSING'
    END as status
UNION ALL
SELECT
    CASE
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'koi_embeddings')
        THEN 'koi_embeddings: EXISTS'
        ELSE 'koi_embeddings: MISSING'
    END;

\echo ''
\echo 'Checking graph (if AGE installed)...'
SELECT name, namespace FROM ag_graph WHERE name = 'regen_graph';
EOF

echo -e "\n${GREEN}Database setup complete!${NC}"
