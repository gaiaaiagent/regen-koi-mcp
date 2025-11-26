#!/usr/bin/env python3
"""
Load entities from multi_repo_entities.json and create CONTAINS edges to Modules.
Preserves existing Module nodes - does NOT clear the graph.
"""

import json
import psycopg2
from pathlib import Path


def escape_cypher(s: str) -> str:
    """Escape string for Cypher query."""
    if s is None:
        return ''
    return s.replace("\\", "\\\\").replace("'", "\\'").replace("\n", " ").replace("\r", "")


def main():
    DB_CONNECTION = "postgresql://darrenzal@localhost:5432/eliza"
    GRAPH_NAME = "regen_graph"
    JSON_FILE = Path(__file__).parent / "tools" / "data" / "multi_repo_entities.json"

    print("=" * 70)
    print("Entity Loader - Preserves Modules, Creates CONTAINS edges")
    print("=" * 70)

    # Connect
    conn = psycopg2.connect(DB_CONNECTION)
    cursor = conn.cursor()
    cursor.execute("LOAD 'age';")
    cursor.execute('SET search_path = ag_catalog, "$user", public;')
    print("✓ Connected to database")

    # Load JSON
    with open(JSON_FILE, 'r') as f:
        data = json.load(f)

    repos_data = data.get('repos', {})
    print(f"✓ Loaded data for {len(repos_data)} repositories")

    # Count total entities
    total = sum(len(entities) for entities in repos_data.values())
    print(f"  Total entities: {total}")

    # Stats
    stats = {'loaded': 0, 'by_type': {}, 'by_repo': {}, 'errors': 0}

    # Load entities by repo
    for repo_name, entities in repos_data.items():
        print(f"\nLoading {len(entities)} entities from {repo_name}...")
        repo_stats = {'loaded': 0, 'errors': 0}

        for entity in entities:
            try:
                entity_type = entity.get('entity_type', 'Unknown')
                name = escape_cypher(entity.get('name', 'unnamed'))
                file_path = escape_cypher(entity.get('file_path', ''))
                line_number = entity.get('line_number', 0)
                language = entity.get('language', 'unknown')
                docstring = escape_cypher(entity.get('docstring', '') or '')[:500]

                # Build extra properties
                extra_props = ""
                if 'methods' in entity:
                    methods = json.dumps(entity['methods'][:10])
                    extra_props += f", methods: '{escape_cypher(methods)}'"
                if 'fields' in entity:
                    fields = json.dumps(entity['fields'][:10])
                    extra_props += f", fields: '{escape_cypher(fields)}'"

                label = entity_type.replace(' ', '_')

                query = f"""
                SELECT * FROM cypher('{GRAPH_NAME}', $$
                    CREATE (n:{label} {{
                        name: '{name}',
                        file_path: '{file_path}',
                        line_number: {line_number},
                        language: '{language}',
                        repo: '{repo_name}',
                        docstring: '{docstring}'
                        {extra_props}
                    }})
                    RETURN id(n)
                $$) as (id agtype);
                """
                cursor.execute(query)
                conn.commit()

                stats['loaded'] += 1
                repo_stats['loaded'] += 1
                stats['by_type'][entity_type] = stats['by_type'].get(entity_type, 0) + 1
                stats['by_repo'][repo_name] = stats['by_repo'].get(repo_name, 0) + 1

            except Exception as e:
                stats['errors'] += 1
                repo_stats['errors'] += 1
                conn.rollback()
                if repo_stats['errors'] <= 2:
                    print(f"  Error: {entity.get('name', 'unknown')} - {e}")

        print(f"  ✓ Loaded: {repo_stats['loaded']}, Errors: {repo_stats['errors']}")

    print("\n" + "=" * 70)
    print(f"ENTITIES LOADED: {stats['loaded']}")
    print("=" * 70)

    print("\nBy Type:")
    for t, c in sorted(stats['by_type'].items(), key=lambda x: -x[1]):
        print(f"  {t}: {c}")

    print("\nBy Repo:")
    for r, c in sorted(stats['by_repo'].items(), key=lambda x: -x[1]):
        print(f"  {r}: {c}")

    # Now create CONTAINS edges
    print("\n" + "=" * 70)
    print("CREATING CONTAINS EDGES (Module -> Entity)")
    print("=" * 70)

    entity_labels = list(stats['by_type'].keys())
    total_edges = 0

    for label in entity_labels:
        try:
            # Match entities to modules by repo + file_path STARTS WITH module.path
            query = f"""
            SELECT * FROM cypher('{GRAPH_NAME}', $$
                MATCH (m:Module), (e:{label})
                WHERE e.repo = m.repo AND e.file_path STARTS WITH (m.repo + '/' + m.path)
                MERGE (m)-[:CONTAINS]->(e)
                RETURN count(*) as cnt
            $$) as (cnt agtype);
            """
            cursor.execute(query)
            result = cursor.fetchone()
            count = int(str(result[0]))
            conn.commit()

            if count > 0:
                print(f"  {label}: {count} edges")
                total_edges += count

        except Exception as e:
            print(f"  {label}: Error - {e}")
            conn.rollback()

    print(f"\nTotal CONTAINS edges: {total_edges}")

    # Verify
    print("\n" + "=" * 70)
    print("VERIFICATION")
    print("=" * 70)

    cursor.execute(f"""
        SELECT * FROM cypher('{GRAPH_NAME}', $$
            MATCH (m:Module)-[r:CONTAINS]->(e)
            RETURN m.repo as repo, m.name as module, count(e) as entities
        $$) as (repo agtype, module agtype, entities agtype)
        ORDER BY entities DESC
        LIMIT 15;
    """)
    results = cursor.fetchall()

    print("\nTop modules by entity count:")
    for row in results:
        repo = str(row[0]).strip('"')
        module = str(row[1]).strip('"')
        count = row[2]
        print(f"  {repo}/{module}: {count}")

    cursor.close()
    conn.close()
    print("\n✓ Done")


if __name__ == "__main__":
    main()
