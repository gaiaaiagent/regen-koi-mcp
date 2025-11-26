-- Verification Queries for Regen Graph Database
-- Run these queries to verify the graph was loaded correctly

-- Load AGE extension
LOAD 'age';
SET search_path = ag_catalog, "$user", public;

-- ============================================
-- QUERY 1: Count all nodes by type
-- ============================================
SELECT * FROM cypher('regen_graph', $$
    MATCH (n)
    RETURN labels(n) as type, count(*) as node_count
$$) as (type agtype, node_count agtype);

-- Expected: Keeper: 3, Msg: 60

-- ============================================
-- QUERY 2: Count all relationships
-- ============================================
SELECT * FROM cypher('regen_graph', $$
    MATCH ()-[r]->()
    RETURN type(r) as rel_type, count(*) as rel_count
$$) as (rel_type agtype, rel_count agtype);

-- Expected: HANDLES: 60

-- ============================================
-- QUERY 3: List all Keepers with their modules
-- ============================================
SELECT * FROM cypher('regen_graph', $$
    MATCH (k:Keeper)
    RETURN k.name as name, k.module as module, k.file_path as file_path
$$) as (name agtype, module agtype, file_path agtype);

-- ============================================
-- QUERY 4: Count Msgs per module
-- ============================================
SELECT * FROM cypher('regen_graph', $$
    MATCH (m:Msg)
    RETURN m.module as module, count(*) as msg_count
    ORDER BY msg_count DESC
$$) as (module agtype, msg_count agtype);

-- ============================================
-- QUERY 5: List Keepers and their Msg counts
-- ============================================
SELECT * FROM cypher('regen_graph', $$
    MATCH (k:Keeper)-[:HANDLES]->(m:Msg)
    RETURN k.name as keeper_name, k.module as module, count(*) as msg_count
$$) as (keeper_name agtype, module agtype, msg_count agtype);

-- ============================================
-- QUERY 6: Find all Msgs handled by basket Keeper
-- ============================================
SELECT * FROM cypher('regen_graph', $$
    MATCH (k:Keeper {module: 'basket'})-[:HANDLES]->(m:Msg)
    RETURN m.name as msg_name, m.docstring as docstring
$$) as (msg_name agtype, docstring agtype);

-- ============================================
-- QUERY 7: Find all Msgs handled by marketplace Keeper
-- ============================================
SELECT * FROM cypher('regen_graph', $$
    MATCH (k:Keeper {module: 'marketplace'})-[:HANDLES]->(m:Msg)
    RETURN m.name as msg_name, m.docstring as docstring
$$) as (msg_name agtype, docstring agtype);

-- ============================================
-- QUERY 8: Find all Msgs handled by base Keeper
-- ============================================
SELECT * FROM cypher('regen_graph', $$
    MATCH (k:Keeper {module: 'base'})-[:HANDLES]->(m:Msg)
    RETURN m.name as msg_name, m.line_number as line_number
    LIMIT 10
$$) as (msg_name agtype, line_number agtype);

-- ============================================
-- QUERY 9: Search for specific Msg patterns
-- ============================================
-- Find all Msgs with 'Create' in the name
SELECT * FROM cypher('regen_graph', $$
    MATCH (m:Msg)
    WHERE m.name CONTAINS 'Create'
    RETURN m.name as msg_name, m.module as module
$$) as (msg_name agtype, module agtype);

-- ============================================
-- QUERY 10: Verify no orphaned nodes
-- ============================================
-- Find Keepers with no HANDLES relationships
SELECT * FROM cypher('regen_graph', $$
    MATCH (k:Keeper)
    WHERE NOT EXISTS((k)-[:HANDLES]->())
    RETURN k.name as keeper_name, k.module as module
$$) as (keeper_name agtype, module agtype);

-- Find Msgs with no incoming HANDLES relationships
SELECT * FROM cypher('regen_graph', $$
    MATCH (m:Msg)
    WHERE NOT EXISTS(()-[:HANDLES]->(m))
    RETURN m.name as msg_name, m.module as module
$$) as (msg_name agtype, module agtype);

-- ============================================
-- QUERY 11: Sample complete node properties
-- ============================================
SELECT * FROM cypher('regen_graph', $$
    MATCH (k:Keeper {module: 'basket'})
    RETURN k
$$) as (keeper agtype);

SELECT * FROM cypher('regen_graph', $$
    MATCH (m:Msg)
    WHERE m.name = 'MsgCreate'
    RETURN m
$$) as (msg agtype);
