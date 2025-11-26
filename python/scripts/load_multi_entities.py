#!/usr/bin/env python3
"""
Multi-Language Entity Loader for Apache AGE Graph Database.
Loads entities from multi_repo_entities.json into regen_graph.
"""

import json
import psycopg2
import re
from typing import Dict, List
from pathlib import Path


class MultiLangEntityLoader:
    """Loads multi-language entities into Apache AGE graph."""

    def __init__(self, db_connection: str, graph_name: str = 'regen_graph'):
        self.db_connection = db_connection
        self.graph_name = graph_name
        self.conn = None
        self.cursor = None
        self.stats = {
            'loaded': 0,
            'by_type': {},
            'by_language': {},
            'by_repo': {},
            'errors': []
        }

    def connect(self):
        """Connect to database and load AGE."""
        self.conn = psycopg2.connect(self.db_connection)
        self.cursor = self.conn.cursor()
        self.cursor.execute("LOAD 'age';")
        self.cursor.execute('SET search_path = ag_catalog, "$user", public;')
        print("✓ Connected to database, AGE loaded")

    def escape_cypher(self, s: str) -> str:
        """Escape string for Cypher query."""
        if s is None:
            return ''
        return s.replace("\\", "\\\\").replace("'", "\\'").replace("\n", " ").replace("\r", "")

    def extract_repo(self, file_path: str) -> str:
        """Extract repository name from file path."""
        parts = file_path.split('/')
        if parts:
            return parts[0]
        return 'unknown'

    def clear_graph(self):
        """Clear all existing nodes and relationships."""
        query = f"""
        SELECT * FROM cypher('{self.graph_name}', $$
            MATCH (n)
            DETACH DELETE n
        $$) as (result agtype);
        """
        self.cursor.execute(query)
        self.conn.commit()
        print("✓ Cleared existing graph data")

    def load_entity(self, entity: Dict) -> bool:
        """Load a single entity into the graph."""
        try:
            entity_type = entity.get('entity_type', 'Unknown')
            name = self.escape_cypher(entity.get('name', 'unnamed'))
            file_path = self.escape_cypher(entity.get('file_path', ''))
            line_number = entity.get('line_number', 0)
            language = entity.get('language', 'unknown')
            docstring = self.escape_cypher(entity.get('docstring', ''))[:500]  # Limit docstring length
            repo = self.extract_repo(file_path)

            # Build properties based on entity type
            extra_props = ""

            # Handle methods/fields/properties
            if 'methods' in entity:
                methods = json.dumps(entity['methods'][:10])  # Limit methods
                extra_props += f", methods: '{self.escape_cypher(methods)}'"
            if 'fields' in entity:
                fields = json.dumps(entity['fields'][:10])
                extra_props += f", fields: '{self.escape_cypher(fields)}'"
            if 'properties' in entity:
                properties = json.dumps(entity['properties'][:10])
                extra_props += f", properties: '{self.escape_cypher(properties)}'"

            # Use entity_type as the node label
            label = entity_type.replace(' ', '_')

            query = f"""
            SELECT * FROM cypher('{self.graph_name}', $$
                CREATE (n:{label} {{
                    name: '{name}',
                    file_path: '{file_path}',
                    line_number: {line_number},
                    language: '{language}',
                    repo: '{repo}',
                    docstring: '{docstring}'
                    {extra_props}
                }})
                RETURN n
            $$) as (n agtype);
            """

            self.cursor.execute(query)
            self.conn.commit()

            # Update stats
            self.stats['loaded'] += 1
            self.stats['by_type'][entity_type] = self.stats['by_type'].get(entity_type, 0) + 1
            self.stats['by_language'][language] = self.stats['by_language'].get(language, 0) + 1
            self.stats['by_repo'][repo] = self.stats['by_repo'].get(repo, 0) + 1

            return True

        except Exception as e:
            error_msg = f"Error loading {entity.get('name', 'unknown')}: {e}"
            self.stats['errors'].append(error_msg)
            self.conn.rollback()
            return False

    def create_repo_relationships(self):
        """Create CONTAINS relationships from Repo nodes to entities."""
        print("\nCreating repository structure...")

        # Get unique repos
        repos = list(self.stats['by_repo'].keys())

        for repo in repos:
            try:
                # Create Repository node
                query = f"""
                SELECT * FROM cypher('{self.graph_name}', $$
                    CREATE (r:Repository {{name: '{repo}'}})
                    RETURN r
                $$) as (r agtype);
                """
                self.cursor.execute(query)
                self.conn.commit()

                # Create CONTAINS relationships to all entities in this repo
                # We'll do this by matching on the repo property
                query = f"""
                SELECT * FROM cypher('{self.graph_name}', $$
                    MATCH (r:Repository {{name: '{repo}'}})
                    MATCH (n) WHERE n.repo = '{repo}' AND NOT n:Repository
                    CREATE (r)-[:CONTAINS]->(n)
                    RETURN count(*) as cnt
                $$) as (cnt agtype);
                """
                self.cursor.execute(query)
                result = self.cursor.fetchone()
                self.conn.commit()
                print(f"  ✓ Repository '{repo}' → {result[0]} entities")

            except Exception as e:
                print(f"  ✗ Error creating repo {repo}: {e}")
                self.conn.rollback()

    def create_module_relationships(self):
        """Create relationships based on file path structure (module/package grouping)."""
        print("\nCreating module relationships...")

        # For TypeScript/Python, group by directory
        try:
            # Create SAME_MODULE relationships for entities in the same directory
            query = f"""
            SELECT * FROM cypher('{self.graph_name}', $$
                MATCH (a), (b)
                WHERE a <> b
                  AND a.file_path IS NOT NULL
                  AND b.file_path IS NOT NULL
                  AND split(a.file_path, '/')[0..-2] = split(b.file_path, '/')[0..-2]
                  AND id(a) < id(b)
                CREATE (a)-[:SAME_MODULE]->(b)
                RETURN count(*) as cnt
            $$) as (cnt agtype);
            """
            # This query might be too slow for large graphs, skip for now
            print("  ⚠ Skipping SAME_MODULE (can be slow for large graphs)")
        except Exception as e:
            print(f"  ⚠ Module relationships: {e}")

    def verify_graph(self):
        """Verify the loaded graph."""
        print("\n" + "=" * 60)
        print("VERIFICATION")
        print("=" * 60)

        try:
            # Count by label
            query = f"""
            SELECT * FROM cypher('{self.graph_name}', $$
                MATCH (n)
                RETURN labels(n) as label, count(*) as cnt
                ORDER BY cnt DESC
            $$) as (label agtype, cnt agtype);
            """
            self.cursor.execute(query)
            results = self.cursor.fetchall()

            print("\nNode counts by type:")
            for row in results:
                print(f"  {row[0]}: {row[1]}")

            # Count relationships
            query = f"""
            SELECT * FROM cypher('{self.graph_name}', $$
                MATCH ()-[r]->()
                RETURN type(r) as rel_type, count(*) as cnt
            $$) as (rel_type agtype, cnt agtype);
            """
            self.cursor.execute(query)
            results = self.cursor.fetchall()

            print("\nRelationship counts:")
            for row in results:
                print(f"  {row[0]}: {row[1]}")

            # Sample entities
            print("\nSample entities:")
            for label in ['Class', 'Interface', 'Function', 'Sensor', 'Handler']:
                query = f"""
                SELECT * FROM cypher('{self.graph_name}', $$
                    MATCH (n:{label})
                    RETURN n.name, n.repo, n.file_path
                    LIMIT 2
                $$) as (name agtype, repo agtype, path agtype);
                """
                try:
                    self.cursor.execute(query)
                    results = self.cursor.fetchall()
                    if results:
                        print(f"\n  {label}:")
                        for row in results:
                            print(f"    - {row[0]} ({row[1]})")
                except:
                    pass

        except Exception as e:
            print(f"Verification error: {e}")

    def load_from_file(self, json_path: str, clear_existing: bool = True):
        """Load entities from JSON file."""
        print(f"Loading from: {json_path}")

        with open(json_path, 'r') as f:
            data = json.load(f)

        entities = data.get('all_entities', data)  # Handle both formats
        print(f"Found {len(entities)} entities\n")

        if clear_existing:
            self.clear_graph()

        # Load entities with progress
        for i, entity in enumerate(entities, 1):
            self.load_entity(entity)
            if i % 500 == 0:
                print(f"  Progress: {i}/{len(entities)}")

        print(f"\n✓ Loaded {self.stats['loaded']} entities")

        # Create relationships
        self.create_repo_relationships()

        # Verify
        self.verify_graph()

        # Summary
        self.print_summary()

    def print_summary(self):
        """Print loading summary."""
        print("\n" + "=" * 60)
        print("SUMMARY")
        print("=" * 60)

        print(f"\nTotal entities loaded: {self.stats['loaded']}")

        print("\nBy Type:")
        for t, c in sorted(self.stats['by_type'].items(), key=lambda x: -x[1])[:10]:
            print(f"  {t}: {c}")

        print("\nBy Language:")
        for l, c in self.stats['by_language'].items():
            print(f"  {l}: {c}")

        print("\nBy Repository:")
        for r, c in self.stats['by_repo'].items():
            print(f"  {r}: {c}")

        if self.stats['errors']:
            print(f"\n⚠ Errors: {len(self.stats['errors'])}")
            for e in self.stats['errors'][:3]:
                print(f"  - {e}")

    def close(self):
        """Close database connection."""
        if self.cursor:
            self.cursor.close()
        if self.conn:
            self.conn.close()
        print("\n✓ Connection closed")


def main():
    """Main entry point."""
    DB_CONNECTION = "postgresql://darrenzal@localhost:5432/eliza"
    GRAPH_NAME = "regen_graph"
    JSON_FILE = Path(__file__).parent.parent / "data" / "multi_repo_entities.json"

    loader = MultiLangEntityLoader(DB_CONNECTION, GRAPH_NAME)

    try:
        loader.connect()
        loader.load_from_file(str(JSON_FILE), clear_existing=True)
    except Exception as e:
        print(f"\n✗ Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        loader.close()


if __name__ == "__main__":
    main()
