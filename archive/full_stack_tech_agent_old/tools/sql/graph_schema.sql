-- Apache AGE Graph Schema for Regen Network Code Search
-- Created: 2025-11-25
-- Database: eliza
-- PostgreSQL Version: 14.15
-- Apache AGE Version: 1.6.0

-- ============================================
-- PART 1: Setup and Extension Installation
-- ============================================

-- Create AGE extension (if not already created)
CREATE EXTENSION IF NOT EXISTS age;

-- Load AGE module
LOAD 'age';

-- Set search path for AGE catalog
SET search_path = ag_catalog, "$user", public;

-- ============================================
-- PART 2: Create Graph
-- ============================================

-- Create the regen_graph
SELECT * FROM ag_catalog.create_graph('regen_graph');

-- Verify graph creation
SELECT * FROM ag_catalog.ag_graph;

-- ============================================
-- PART 3: Graph Schema Definition
-- ============================================

/*
  NODE TYPES:

  1. Keeper
     - name: string (e.g., "Keeper")
     - file_path: string (absolute path to source file)
     - line_number: int (line number in source file)
     - docstring: string (nullable, documentation string)
     - fields: array of strings (struct fields)

  2. Msg
     - name: string (e.g., "MsgCreateBatch")
     - file_path: string (absolute path to .pb.go file)
     - line_number: int (line number in source file)
     - docstring: string (nullable, documentation string)
     - fields: array of strings (message fields)

  3. Document (future use)
     - title: string (document title)
     - file_path: string (path to markdown/doc file)
     - rid: string (resource ID for linking to KOI system)
     - content: string (document content)

  EDGE TYPES:

  1. HANDLES: Keeper → Msg
     - Indicates that a Keeper handles/processes this message type

  2. MENTIONS: Document → Msg (future use)
     - Indicates that a document mentions this message type

  3. MENTIONS: Document → Keeper (future use)
     - Indicates that a document mentions this keeper

  4. DEFINES: File → Keeper (future use)
     - Indicates which file defines this keeper

  5. DEFINES: File → Msg (future use)
     - Indicates which file defines this message
*/

-- ============================================
-- PART 4: Helper Functions
-- ============================================

-- Function to insert a Keeper node
CREATE OR REPLACE FUNCTION insert_keeper(
  p_name text,
  p_file_path text,
  p_line_number int,
  p_docstring text DEFAULT NULL,
  p_fields jsonb DEFAULT '[]'::jsonb
) RETURNS void AS $$
BEGIN
  PERFORM * FROM cypher('regen_graph', format($$
    CREATE (k:Keeper {
      name: %L,
      file_path: %L,
      line_number: %s,
      docstring: %L,
      fields: %s
    })
    RETURN k
  $$, p_name, p_file_path, p_line_number, p_docstring, p_fields::text))
  as (keeper agtype);
END;
$$ LANGUAGE plpgsql;

-- Function to insert a Msg node
CREATE OR REPLACE FUNCTION insert_msg(
  p_name text,
  p_file_path text,
  p_line_number int,
  p_docstring text DEFAULT NULL,
  p_fields jsonb DEFAULT '[]'::jsonb
) RETURNS void AS $$
BEGIN
  PERFORM * FROM cypher('regen_graph', format($$
    CREATE (m:Msg {
      name: %L,
      file_path: %L,
      line_number: %s,
      docstring: %L,
      fields: %s
    })
    RETURN m
  $$, p_name, p_file_path, p_line_number, p_docstring, p_fields::text))
  as (msg agtype);
END;
$$ LANGUAGE plpgsql;

-- Function to create a HANDLES edge between Keeper and Msg
CREATE OR REPLACE FUNCTION create_handles_edge(
  p_keeper_file_path text,
  p_msg_name text
) RETURNS void AS $$
BEGIN
  PERFORM * FROM cypher('regen_graph', format($$
    MATCH (k:Keeper {file_path: %L})
    MATCH (m:Msg {name: %L})
    CREATE (k)-[r:HANDLES]->(m)
    RETURN r
  $$, p_keeper_file_path, p_msg_name))
  as (relationship agtype);
END;
$$ LANGUAGE plpgsql;

-- Function to query all Keepers
CREATE OR REPLACE FUNCTION get_all_keepers()
RETURNS TABLE (
  name text,
  file_path text,
  line_number int,
  docstring text
) AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM cypher('regen_graph', $$
    MATCH (k:Keeper)
    RETURN k.name, k.file_path, k.line_number, k.docstring
  $$) as (name text, file_path text, line_number int, docstring text);
END;
$$ LANGUAGE plpgsql;

-- Function to query all Msgs
CREATE OR REPLACE FUNCTION get_all_msgs()
RETURNS TABLE (
  name text,
  file_path text,
  line_number int,
  docstring text
) AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM cypher('regen_graph', $$
    MATCH (m:Msg)
    RETURN m.name, m.file_path, m.line_number, m.docstring
  $$) as (name text, file_path text, line_number int, docstring text);
END;
$$ LANGUAGE plpgsql;

-- Function to find which Keeper handles a specific Msg
CREATE OR REPLACE FUNCTION get_keeper_for_msg(p_msg_name text)
RETURNS TABLE (
  keeper_name text,
  keeper_file_path text,
  msg_name text,
  relationship text
) AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM cypher('regen_graph', format($$
    MATCH (k:Keeper)-[r:HANDLES]->(m:Msg {name: %L})
    RETURN k.name, k.file_path, m.name, type(r)
  $$, p_msg_name)) as (
    keeper_name text,
    keeper_file_path text,
    msg_name text,
    relationship text
  );
END;
$$ LANGUAGE plpgsql;

-- Function to find all Msgs handled by a specific Keeper
CREATE OR REPLACE FUNCTION get_msgs_for_keeper(p_keeper_file_path text)
RETURNS TABLE (
  keeper_name text,
  msg_name text,
  msg_docstring text
) AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM cypher('regen_graph', format($$
    MATCH (k:Keeper {file_path: %L})-[r:HANDLES]->(m:Msg)
    RETURN k.name, m.name, m.docstring
  $$, p_keeper_file_path)) as (
    keeper_name text,
    msg_name text,
    msg_docstring text
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- PART 5: Sample Data (for testing)
-- ============================================

-- Insert sample Keeper nodes
SELECT insert_keeper(
  'Keeper',
  '/Users/darrenzal/projects/RegenAI/regen-ledger/x/ecocredit/basket/keeper/keeper.go',
  19,
  'Keeper is the basket keeper.',
  '["stateStore", "baseStore", "bankKeeper", "moduleAddress", "authority", "ac"]'::jsonb
);

SELECT insert_keeper(
  'Keeper',
  '/Users/darrenzal/projects/RegenAI/regen-ledger/x/ecocredit/marketplace/keeper/keeper.go',
  19,
  NULL,
  '["stateStore", "baseStore", "bankKeeper", "authority", "feePoolName", "ac"]'::jsonb
);

-- Insert sample Msg nodes
SELECT insert_msg(
  'MsgCreate',
  '/Users/darrenzal/projects/RegenAI/regen-ledger/x/ecocredit/basket/types/v1/tx.pb.go',
  35,
  'MsgCreateBasket is the Msg/CreateBasket request type.',
  '["Curator", "Name", "Description", "Exponent", "DisableAutoRetire", "CreditTypeAbbrev", "AllowedClasses", "DateCriteria", "Fee"]'::jsonb
);

SELECT insert_msg(
  'MsgPut',
  '/Users/darrenzal/projects/RegenAI/regen-ledger/x/ecocredit/basket/types/v1/tx.pb.go',
  226,
  'MsgAddToBasket is the Msg/AddToBasket request type.',
  '["Owner", "BasketDenom", "Credits"]'::jsonb
);

SELECT insert_msg(
  'MsgSell',
  '/Users/darrenzal/projects/RegenAI/regen-ledger/x/ecocredit/marketplace/types/v1/tx.pb.go',
  39,
  'MsgSell is the Msg/Sell request type.',
  '["Seller", "Orders"]'::jsonb
);

SELECT insert_msg(
  'MsgBuyDirect',
  '/Users/darrenzal/projects/RegenAI/regen-ledger/x/ecocredit/marketplace/types/v1/tx.pb.go',
  500,
  'MsgBuyDirect is the Msg/BuyDirect request type.',
  '["Buyer", "Orders"]'::jsonb
);

-- Create sample HANDLES relationship
SELECT create_handles_edge(
  '/Users/darrenzal/projects/RegenAI/regen-ledger/x/ecocredit/basket/keeper/keeper.go',
  'MsgCreate'
);

-- ============================================
-- PART 6: Verification Queries
-- ============================================

-- Query all Keepers
SELECT * FROM get_all_keepers();

-- Query all Msgs
SELECT * FROM get_all_msgs();

-- Find which Keeper handles MsgCreate
SELECT * FROM get_keeper_for_msg('MsgCreate');

-- Find all Msgs handled by basket keeper
SELECT * FROM get_msgs_for_keeper('/Users/darrenzal/projects/RegenAI/regen-ledger/x/ecocredit/basket/keeper/keeper.go');

-- Count nodes by type
SELECT * FROM cypher('regen_graph', $$
  MATCH (n)
  RETURN label(n) as node_type, count(*) as count
$$) as (node_type agtype, count agtype);

-- Count relationships by type
SELECT * FROM cypher('regen_graph', $$
  MATCH ()-[r]->()
  RETURN type(r) as relationship_type, count(*) as count
$$) as (relationship_type agtype, count agtype);

-- ============================================
-- PART 7: Useful Queries for Development
-- ============================================

-- Find all paths from Keeper to Msg (up to 3 hops)
-- SELECT * FROM cypher('regen_graph', $$
--   MATCH path = (k:Keeper)-[*1..3]->(m:Msg)
--   RETURN k.name, m.name, length(path) as path_length
-- $$) as (keeper_name agtype, msg_name agtype, path_length agtype);

-- Search for Msgs by name pattern
-- SELECT * FROM cypher('regen_graph', $$
--   MATCH (m:Msg)
--   WHERE m.name =~ 'Msg.*Basket.*'
--   RETURN m.name, m.docstring
-- $$) as (name agtype, docstring agtype);

-- ============================================
-- PART 8: Cleanup (if needed)
-- ============================================

-- Drop all helper functions
-- DROP FUNCTION IF EXISTS insert_keeper(text, text, int, text, jsonb);
-- DROP FUNCTION IF EXISTS insert_msg(text, text, int, text, jsonb);
-- DROP FUNCTION IF EXISTS create_handles_edge(text, text);
-- DROP FUNCTION IF EXISTS get_all_keepers();
-- DROP FUNCTION IF EXISTS get_all_msgs();
-- DROP FUNCTION IF EXISTS get_keeper_for_msg(text);
-- DROP FUNCTION IF EXISTS get_msgs_for_keeper(text);

-- Drop the graph (WARNING: This will delete all data!)
-- SELECT * FROM ag_catalog.drop_graph('regen_graph', true);

-- Drop AGE extension (WARNING: This will remove all AGE functionality!)
-- DROP EXTENSION age CASCADE;

-- ============================================
-- END OF SCHEMA
-- ============================================
