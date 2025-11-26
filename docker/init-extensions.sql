-- Initialize PostgreSQL extensions for Regen KOI MCP
-- This script runs automatically when the container starts

-- Enable pgvector for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Enable Apache AGE for graph queries
CREATE EXTENSION IF NOT EXISTS age;

-- Load AGE into search path
LOAD 'age';
SET search_path = ag_catalog, "$user", public;

-- Enable fuzzystrmatch for fuzzy string matching
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;

-- Enable pg_trgm for trigram similarity (fuzzy search)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Enable uuid-ossp for UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create the graph for code entities
SELECT create_graph('regen_graph');

-- Grant permissions
GRANT USAGE ON SCHEMA ag_catalog TO PUBLIC;

-- Verify extensions are installed
DO $$
BEGIN
    RAISE NOTICE 'Extensions installed:';
    RAISE NOTICE '  - pgvector: %', (SELECT extversion FROM pg_extension WHERE extname = 'vector');
    RAISE NOTICE '  - Apache AGE: %', (SELECT extversion FROM pg_extension WHERE extname = 'age');
    RAISE NOTICE '  - fuzzystrmatch: %', (SELECT extversion FROM pg_extension WHERE extname = 'fuzzystrmatch');
    RAISE NOTICE '  - pg_trgm: %', (SELECT extversion FROM pg_extension WHERE extname = 'pg_trgm');
END $$;
