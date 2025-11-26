#!/usr/bin/env python3
"""Create CONTAINS edges between Modules and their Entities."""

import psycopg2

def main():
    conn = psycopg2.connect("postgresql://darrenzal@localhost:5432/eliza")
    cursor = conn.cursor()
    cursor.execute("LOAD 'age';")
    cursor.execute('SET search_path = ag_catalog, "$user", public;')

    # Known entity labels from the extraction
    labels = ["Function", "Class", "Sensor", "Handler", "Interface", "Type", "Constant", "Variable", "MsgHandler"]

    print("Creating CONTAINS edges between Modules and Entities...")

    total_edges = 0
    for label in labels:
        # Create CONTAINS edges for this entity type
        query = f"""
            SELECT * FROM cypher('regen_graph', $$
                MATCH (m:Module), (e:{label})
                WHERE e.repo = m.repo AND e.file_path STARTS WITH m.path
                MERGE (m)-[:CONTAINS]->(e)
                RETURN count(*) as cnt
            $$) as (cnt agtype);
        """
        try:
            cursor.execute(query)
            result = cursor.fetchone()
            count = int(str(result[0]))
            print(f"  {label}: {count} edges")
            total_edges += count
            conn.commit()
        except Exception as e:
            print(f"  {label}: Error - {e}")
            conn.rollback()

    print(f"\nTotal CONTAINS edges created: {total_edges}")

    # Verify by checking module entity counts
    print("\nTop modules by entity count:")
    cursor.execute("""
        SELECT * FROM cypher('regen_graph', $$
            MATCH (m:Module)-[r:CONTAINS]->(e)
            RETURN m.repo as repo, m.name as name, count(e) as cnt
        $$) as (repo agtype, name agtype, cnt agtype)
        ORDER BY cnt DESC
        LIMIT 10;
    """)
    for row in cursor.fetchall():
        repo = str(row[0]).strip('"')
        name = str(row[1]).strip('"')
        cnt = row[2]
        print(f"  {repo}/{name}: {cnt} entities")

    cursor.close()
    conn.close()

if __name__ == "__main__":
    main()
