-- =============================================================================
-- Entity Lookup Setup with Trigram Index
-- =============================================================================
-- Purpose: Create a fast entity lookup table with trigram similarity matching
-- for intelligent query routing. This enables pg_trgm-based entity detection
-- in natural language queries without JavaScript array scanning.
--
-- Database: eliza (where AGE graph resides)
-- Graph: regen_graph
-- Expected entities: 63 (3 Keepers, 60 Msgs)
-- =============================================================================

-- Enable trigram extension for fuzzy text matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Drop existing table if re-running
DROP TABLE IF EXISTS entity_lookup CASCADE;

-- Create entity lookup table
-- This table provides fast entity name lookups using trigram similarity
CREATE TABLE entity_lookup (
    name TEXT PRIMARY KEY,           -- Entity name (unique identifier)
    entity_type TEXT NOT NULL,       -- Type: 'Keeper' or 'Msg'
    node_id TEXT,                    -- AGE vertex ID for graph queries
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create trigram index for fuzzy matching
-- This enables similarity searches like: WHERE name % 'query_text'
CREATE INDEX entity_lookup_trgm_idx ON entity_lookup USING gin(name gin_trgm_ops);

-- Create index on entity_type for filtering
CREATE INDEX entity_lookup_type_idx ON entity_lookup(entity_type);

-- =============================================================================
-- Populate from AGE graph
-- =============================================================================

-- Load AGE module and set search path
LOAD 'age';
SET search_path = ag_catalog, "$user", public;

-- Insert Keeper entities
-- Note: Multiple Keepers may share the same name (e.g., "Keeper" struct in different modules)
-- We use DISTINCT ON to pick one representative node_id per name for entity detection
WITH keeper_data AS (
    SELECT DISTINCT ON (name::text)
        name::text as entity_name,
        'Keeper' as entity_type,
        vertex_id::text as node_id
    FROM cypher('regen_graph', $$
        MATCH (k:Keeper)
        RETURN k.name, id(k)
    $$) as (name agtype, vertex_id agtype)
    WHERE name IS NOT NULL
    ORDER BY name::text, vertex_id::text
)
INSERT INTO entity_lookup (name, entity_type, node_id)
SELECT entity_name, entity_type, node_id
FROM keeper_data;

-- Insert Msg entities
-- Note: Multiple Msgs may share the same name (e.g., "MsgSend" in different modules)
-- We use DISTINCT ON to pick one representative node_id per name for entity detection
WITH msg_data AS (
    SELECT DISTINCT ON (name::text)
        name::text as entity_name,
        'Msg' as entity_type,
        vertex_id::text as node_id
    FROM cypher('regen_graph', $$
        MATCH (m:Msg)
        RETURN m.name, id(m)
    $$) as (name agtype, vertex_id agtype)
    WHERE name IS NOT NULL
    ORDER BY name::text, vertex_id::text
)
INSERT INTO entity_lookup (name, entity_type, node_id)
SELECT entity_name, entity_type, node_id
FROM msg_data;

-- =============================================================================
-- Verification and Stats
-- =============================================================================

-- Show entity counts by type
SELECT
    entity_type,
    COUNT(*) as count
FROM entity_lookup
GROUP BY entity_type
ORDER BY entity_type;

-- Show total count (should be 63)
SELECT COUNT(*) as total_entities FROM entity_lookup;

-- Test trigram similarity (example)
-- This shows how the router will detect entities in natural language queries
SELECT
    name,
    entity_type,
    similarity(name, 'keeper for messages') as score
FROM entity_lookup
WHERE name % 'keeper for messages'
ORDER BY score DESC
LIMIT 5;

-- =============================================================================
-- Helper Function: Find Entities in Query
-- =============================================================================
-- This function will be used by the query router to detect entities

CREATE OR REPLACE FUNCTION detect_entities_in_query(query_text TEXT, threshold REAL DEFAULT 0.3)
RETURNS TABLE(name TEXT, entity_type TEXT, node_id TEXT, score REAL) AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.name,
        e.entity_type,
        e.node_id,
        similarity(e.name, query_text) as score
    FROM entity_lookup e
    WHERE e.name % query_text
       OR query_text ILIKE '%' || e.name || '%'
    ORDER BY similarity(e.name, query_text) DESC
    LIMIT 10;
END;
$$ LANGUAGE plpgsql;

-- Test the helper function
SELECT * FROM detect_entities_in_query('What does the pong keeper handle?');

-- =============================================================================
-- Performance Notes
-- =============================================================================
-- 1. The GIN trigram index enables fast similarity searches
-- 2. The % operator uses the trigram index for fuzzy matching
-- 3. The similarity() function returns a score between 0.0 and 1.0
-- 4. The ILIKE fallback catches exact substring matches
-- 5. Typical query time: < 5ms for entity detection
