#!/usr/bin/env python3
"""
Apache AGE Entity Loader for Regen Network Codebase
Loads Keepers and Msgs from extracted_entities.json into regen_graph
Creates HANDLES relationships based on module extraction from file paths
"""

import json
import psycopg2
import re
from typing import Dict, List, Optional
from pathlib import Path


class AGEEntityLoader:
    """Loads entities into Apache AGE graph database"""

    def __init__(self, db_connection_string: str, graph_name: str = 'regen_graph'):
        """
        Initialize the loader

        Args:
            db_connection_string: PostgreSQL connection string
            graph_name: Name of the AGE graph
        """
        self.db_connection_string = db_connection_string
        self.graph_name = graph_name
        self.conn = None
        self.cursor = None

        # Statistics
        self.stats = {
            'keepers_loaded': 0,
            'msgs_loaded': 0,
            'relationships_created': 0,
            'errors': [],
            'module_counts': {}
        }

    def connect(self):
        """Establish database connection and setup AGE"""
        try:
            self.conn = psycopg2.connect(self.db_connection_string)
            self.cursor = self.conn.cursor()

            # Load AGE extension
            self.cursor.execute("LOAD 'age';")

            # Set search path
            self.cursor.execute('SET search_path = ag_catalog, "$user", public;')

            print("✓ Connected to database")
            print("✓ AGE extension loaded")

        except Exception as e:
            print(f"✗ Database connection failed: {e}")
            raise

    def extract_module(self, file_path: str) -> str:
        """
        Extract module name from file path

        Examples:
            x/ecocredit/basket/keeper/keeper.go → basket
            x/ecocredit/base/types/v1/tx.pb.go → base
            x/ecocredit/marketplace/keeper/keeper.go → marketplace

        Args:
            file_path: Absolute or relative file path

        Returns:
            Module name (basket, base, marketplace) or 'unknown'
        """
        # Pattern to extract module from path
        match = re.search(r'/x/ecocredit/([^/]+)/', file_path)
        if match:
            return match.group(1)

        # Fallback: try without leading slash
        match = re.search(r'x/ecocredit/([^/]+)/', file_path)
        if match:
            return match.group(1)

        return 'unknown'

    def make_relative_path(self, file_path: str) -> str:
        """
        Convert absolute path to relative path from regen-ledger root

        Args:
            file_path: Absolute file path

        Returns:
            Relative path starting from x/ecocredit/
        """
        # Find the position of 'x/ecocredit'
        match = re.search(r'(x/ecocredit/.*)', file_path)
        if match:
            return match.group(1)
        return file_path

    def clear_existing_data(self):
        """Clear all existing nodes and relationships from the graph"""
        try:
            query = f"""
            SELECT * FROM cypher('{self.graph_name}', $$
                MATCH (n)
                DETACH DELETE n
            $$) as (result agtype);
            """
            self.cursor.execute(query)
            self.conn.commit()
            print("✓ Cleared existing graph data")
        except Exception as e:
            print(f"✗ Error clearing data: {e}")
            self.stats['errors'].append(f"Clear data error: {e}")

    def load_keeper(self, entity: Dict) -> bool:
        """
        Load a Keeper node into the graph

        Args:
            entity: Entity dictionary from JSON

        Returns:
            True if successful, False otherwise
        """
        try:
            name = entity['name']
            file_path = self.make_relative_path(entity['file_path'])
            line_number = entity['line_number']
            docstring = entity.get('docstring', '')
            fields = entity.get('fields', [])
            module = self.extract_module(entity['file_path'])

            # Convert None to empty string for docstring
            if docstring is None:
                docstring = ''

            # Escape single quotes in strings for Cypher
            name_escaped = name.replace("'", "\\'")
            docstring_escaped = docstring.replace("'", "\\'")
            file_path_escaped = file_path.replace("'", "\\'")

            # Convert fields array to JSON string
            import json
            fields_json = json.dumps(fields)

            query = f"""
            SELECT * FROM cypher('{self.graph_name}', $$
                CREATE (k:Keeper {{
                    name: '{name_escaped}',
                    file_path: '{file_path_escaped}',
                    line_number: {line_number},
                    docstring: '{docstring_escaped}',
                    module: '{module}'
                }})
                RETURN k
            $$) as (k agtype);
            """

            self.cursor.execute(query)
            self.conn.commit()

            self.stats['keepers_loaded'] += 1
            self.stats['module_counts'][module] = self.stats['module_counts'].get(module, {'keepers': 0, 'msgs': 0})
            self.stats['module_counts'][module]['keepers'] += 1

            return True

        except Exception as e:
            error_msg = f"Error loading Keeper '{entity.get('name', 'unknown')}': {e}"
            print(f"✗ {error_msg}")
            self.stats['errors'].append(error_msg)
            self.conn.rollback()
            return False

    def load_msg(self, entity: Dict) -> bool:
        """
        Load a Msg node into the graph

        Args:
            entity: Entity dictionary from JSON

        Returns:
            True if successful, False otherwise
        """
        try:
            name = entity['name']
            file_path = self.make_relative_path(entity['file_path'])
            line_number = entity['line_number']
            docstring = entity.get('docstring', '')
            fields = entity.get('fields', [])
            module = self.extract_module(entity['file_path'])

            # Convert None to empty string for docstring
            if docstring is None:
                docstring = ''

            # Escape single quotes in strings for Cypher
            name_escaped = name.replace("'", "\\'")
            docstring_escaped = docstring.replace("'", "\\'")
            file_path_escaped = file_path.replace("'", "\\'")

            # Convert fields array to JSON string
            import json
            fields_json = json.dumps(fields)

            query = f"""
            SELECT * FROM cypher('{self.graph_name}', $$
                CREATE (m:Msg {{
                    name: '{name_escaped}',
                    file_path: '{file_path_escaped}',
                    line_number: {line_number},
                    docstring: '{docstring_escaped}',
                    module: '{module}'
                }})
                RETURN m
            $$) as (m agtype);
            """

            self.cursor.execute(query)
            self.conn.commit()

            self.stats['msgs_loaded'] += 1
            self.stats['module_counts'][module] = self.stats['module_counts'].get(module, {'keepers': 0, 'msgs': 0})
            self.stats['module_counts'][module]['msgs'] += 1

            return True

        except Exception as e:
            error_msg = f"Error loading Msg '{entity.get('name', 'unknown')}': {e}"
            print(f"✗ {error_msg}")
            self.stats['errors'].append(error_msg)
            self.conn.rollback()
            return False

    def create_handles_relationships(self):
        """
        Create HANDLES relationships between Keepers and Msgs
        based on module matching
        """
        print("\nCreating HANDLES relationships...")

        try:
            # Get all modules
            modules = list(self.stats['module_counts'].keys())

            for module in modules:
                if module == 'unknown':
                    continue

                query = f"""
                SELECT * FROM cypher('{self.graph_name}', $$
                    MATCH (k:Keeper {{module: '{module}'}})
                    MATCH (m:Msg {{module: '{module}'}})
                    CREATE (k)-[r:HANDLES]->(m)
                    RETURN r
                $$) as (r agtype);
                """

                self.cursor.execute(query)
                results = self.cursor.fetchall()
                count = len(results)
                self.conn.commit()

                self.stats['relationships_created'] += count
                print(f"  ✓ Created HANDLES relationships for module '{module}': {count}")

        except Exception as e:
            error_msg = f"Error creating relationships: {e}"
            print(f"✗ {error_msg}")
            self.stats['errors'].append(error_msg)
            self.conn.rollback()

    def verify_graph(self):
        """Run verification queries to confirm data was loaded correctly"""
        print("\n" + "="*60)
        print("VERIFICATION RESULTS")
        print("="*60)

        try:
            # Count nodes by type
            print("\n1. Node counts by type:")
            query = f"""
            SELECT * FROM cypher('{self.graph_name}', $$
                MATCH (n)
                RETURN labels(n) as type, count(*) as node_count
            $$) as (type agtype, node_count agtype);
            """
            self.cursor.execute(query)
            results = self.cursor.fetchall()
            for row in results:
                print(f"   {row[0]}: {row[1]}")

            # Count relationships by type
            print("\n2. Relationship counts by type:")
            query = f"""
            SELECT * FROM cypher('{self.graph_name}', $$
                MATCH ()-[r]->()
                RETURN type(r) as rel_type, count(*) as rel_count
            $$) as (rel_type agtype, rel_count agtype);
            """
            self.cursor.execute(query)
            results = self.cursor.fetchall()
            for row in results:
                print(f"   {row[0]}: {row[1]}")

            # List Keepers with their Msg counts
            print("\n3. Keepers and their message counts:")
            query = f"""
            SELECT * FROM cypher('{self.graph_name}', $$
                MATCH (k:Keeper)-[:HANDLES]->(m:Msg)
                RETURN k.name as keeper_name, k.module as keeper_module, count(*) as msg_count
            $$) as (keeper_name agtype, keeper_module agtype, msg_count agtype);
            """
            self.cursor.execute(query)
            results = self.cursor.fetchall()
            for row in results:
                print(f"   {row[0]} ({row[1]}): {row[2]} messages")

            # Sample: Find all Msgs handled by basket Keeper
            print("\n4. Sample Msgs handled by basket Keeper:")
            query = f"""
            SELECT * FROM cypher('{self.graph_name}', $$
                MATCH (k:Keeper {{module: 'basket'}})-[:HANDLES]->(m:Msg)
                RETURN m.name
                LIMIT 5
            $$) as (msg_name agtype);
            """
            self.cursor.execute(query)
            results = self.cursor.fetchall()
            for row in results:
                print(f"   - {row[0]}")
            print(f"   ... (showing first 5)")

        except Exception as e:
            print(f"✗ Verification error: {e}")
            self.stats['errors'].append(f"Verification error: {e}")

    def load_entities_from_file(self, json_file_path: str, clear_existing: bool = True):
        """
        Load all entities from JSON file

        Args:
            json_file_path: Path to extracted_entities.json
            clear_existing: Whether to clear existing data first
        """
        print(f"Loading entities from: {json_file_path}")

        # Read JSON file
        with open(json_file_path, 'r') as f:
            entities = json.load(f)

        print(f"Found {len(entities)} entities to load\n")

        # Clear existing data if requested
        if clear_existing:
            self.clear_existing_data()

        # Load entities
        print("Loading entities...")
        for i, entity in enumerate(entities, 1):
            entity_type = entity.get('entity_type')

            if entity_type == 'Keeper':
                success = self.load_keeper(entity)
            elif entity_type == 'Msg':
                success = self.load_msg(entity)
            else:
                print(f"✗ Unknown entity type: {entity_type}")
                continue

            # Progress indicator
            if i % 10 == 0:
                print(f"  Progress: {i}/{len(entities)} entities loaded")

        print(f"\n✓ Finished loading {len(entities)} entities")

        # Create relationships
        self.create_handles_relationships()

        # Verify
        self.verify_graph()

        # Print summary
        self.print_summary()

    def print_summary(self):
        """Print loading summary and statistics"""
        print("\n" + "="*60)
        print("LOADING SUMMARY")
        print("="*60)
        print(f"\nTotal Keepers loaded: {self.stats['keepers_loaded']}")
        print(f"Total Msgs loaded: {self.stats['msgs_loaded']}")
        print(f"Total HANDLES relationships created: {self.stats['relationships_created']}")

        print("\nModule breakdown:")
        for module, counts in self.stats['module_counts'].items():
            print(f"  {module}:")
            print(f"    Keepers: {counts.get('keepers', 0)}")
            print(f"    Msgs: {counts.get('msgs', 0)}")

        if self.stats['errors']:
            print(f"\n⚠ Errors encountered: {len(self.stats['errors'])}")
            for error in self.stats['errors'][:5]:  # Show first 5 errors
                print(f"  - {error}")
            if len(self.stats['errors']) > 5:
                print(f"  ... and {len(self.stats['errors']) - 5} more")
        else:
            print("\n✓ No errors encountered")

        print("\n" + "="*60)

    def close(self):
        """Close database connection"""
        if self.cursor:
            self.cursor.close()
        if self.conn:
            self.conn.close()
        print("\n✓ Database connection closed")


def main():
    """Main execution function"""
    import argparse
    import os

    # Parse command-line arguments
    parser = argparse.ArgumentParser(description='Load entities from JSON into Apache AGE graph database')
    parser.add_argument('--db-host', default=os.getenv('GRAPH_DB_HOST', 'localhost'),
                        help='Database host (default: localhost or GRAPH_DB_HOST env var)')
    parser.add_argument('--db-port', type=int, default=int(os.getenv('GRAPH_DB_PORT', '5432')),
                        help='Database port (default: 5432 or GRAPH_DB_PORT env var)')
    parser.add_argument('--db-name', default=os.getenv('GRAPH_DB_NAME', 'eliza'),
                        help='Database name (default: eliza or GRAPH_DB_NAME env var)')
    parser.add_argument('--db-user', default=os.getenv('GRAPH_DB_USER', os.getenv('USER', 'postgres')),
                        help='Database user (default: current user or GRAPH_DB_USER env var)')
    parser.add_argument('--db-password', default=os.getenv('GRAPH_DB_PASSWORD', ''),
                        help='Database password (default: empty or GRAPH_DB_PASSWORD env var)')
    parser.add_argument('--graph-name', default=os.getenv('GRAPH_NAME', 'regen_graph'),
                        help='Graph name (default: regen_graph or GRAPH_NAME env var)')
    parser.add_argument('--json-file', default='../../data/extracted_entities.json',
                        help='Path to extracted_entities.json (default: ../../data/extracted_entities.json)')
    parser.add_argument('--no-clear', action='store_true',
                        help='Do not clear existing data before loading')

    args = parser.parse_args()

    # Build connection string
    password_part = f":{args.db_password}" if args.db_password else ""
    DB_CONNECTION = f"postgresql://{args.db_user}{password_part}@{args.db_host}:{args.db_port}/{args.db_name}"

    # Resolve JSON file path (relative to script location if not absolute)
    json_file = args.json_file
    if not os.path.isabs(json_file):
        script_dir = Path(__file__).parent
        json_file = str((script_dir / json_file).resolve())

    print(f"Configuration:")
    print(f"  Database: {args.db_user}@{args.db_host}:{args.db_port}/{args.db_name}")
    print(f"  Graph: {args.graph_name}")
    print(f"  JSON File: {json_file}")
    print(f"  Clear existing: {not args.no_clear}\n")

    # Create loader instance
    loader = AGEEntityLoader(DB_CONNECTION, args.graph_name)

    try:
        # Connect to database
        loader.connect()

        # Load entities
        loader.load_entities_from_file(json_file, clear_existing=not args.no_clear)

    except Exception as e:
        print(f"\n✗ Fatal error: {e}")
        import traceback
        traceback.print_exc()

    finally:
        # Close connection
        loader.close()


if __name__ == "__main__":
    main()
