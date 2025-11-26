"""
Create MENTIONS edges by scanning documentation and linking to code entities in the graph.

This script:
1. Queries existing documents from KOI database
2. Loads entities from extracted_entities.json
3. For each document, extracts entity mentions using entity_linker
4. Creates Document nodes in the graph
5. Creates MENTIONS edges connecting docs to Keepers/Msgs
"""

import json
import psycopg2
from psycopg2.extras import RealDictCursor
import age
from entity_linker import Entity, extract_entity_mentions
from typing import List, Dict, Any


def load_entities_from_json(json_path: str) -> List[Entity]:
    """
    Load entities from extracted_entities.json and convert to Entity format.

    Args:
        json_path: Path to extracted_entities.json

    Returns:
        List of Entity objects
    """
    with open(json_path, 'r') as f:
        data = json.load(f)

    entities = []
    for item in data:
        entity_type = item['entity_type']
        name = item['name']

        # Extract module from file_path (e.g., x/ecocredit/basket/... -> basket)
        file_path = item.get('file_path', '')
        module = 'unknown'
        if 'x/ecocredit/' in file_path:
            parts = file_path.split('x/ecocredit/')[1].split('/')
            if len(parts) > 0:
                module = parts[0]

        # Create entity_id
        entity_id = f"{entity_type.lower()}:{name}"

        # Create aliases for Keeper entities
        aliases = []
        if entity_type == "Keeper":
            aliases = [f"{module} keeper", f"{module} Keeper"]

        entities.append(Entity(
            entity_id=entity_id,
            entity_type=entity_type,
            name=name,
            module=module,
            aliases=aliases
        ))

    return entities


def get_koi_documents(conn, limit: int = 100) -> List[Dict[str, Any]]:
    """
    Query existing documents from KOI database.

    Args:
        conn: psycopg2 connection to KOI database
        limit: Maximum number of documents to retrieve

    Returns:
        List of document dictionaries with id, content, and file_path
    """
    with conn.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute("""
            SELECT
                id,
                content->>'text' as content,
                metadata->>'source_url' as file_path,
                metadata->>'original_id' as title
            FROM koi_memories
            WHERE metadata->>'source_url' LIKE '%%regen-ledger%%'
            LIMIT %s
        """, (limit,))

        documents = cursor.fetchall()
        return [dict(doc) for doc in documents]


def create_document_node(conn, doc_id: str, file_path: str, title: str = None):
    """
    Create a Document node in the graph if it doesn't already exist.

    Args:
        conn: psycopg2 connection with AGE extension loaded
        doc_id: Document ID
        file_path: Path to the document file
        title: Optional title for the document
    """
    with conn.cursor() as cursor:
        cursor.execute("SET search_path = ag_catalog, public;")

        # Use MERGE to avoid duplicates
        # Use format() to inject variables directly into the Cypher query
        query = """
        SELECT * FROM cypher('regen_graph', $$
            MERGE (d:Document {{id: '{doc_id}', file_path: '{file_path}', title: '{title}'}})
            RETURN d
        $$) as (result agtype);
        """.format(
            doc_id=doc_id.replace("'", "''"),
            file_path=(file_path or 'unknown').replace("'", "''"),
            title=(title or file_path or 'unknown').replace("'", "''")
        )

        cursor.execute(query)


def create_mentions_edge(conn, doc_id: str, entity_name: str, surface_form: str,
                         confidence: float, start_offset: int):
    """
    Create a MENTIONS edge from a Document to an entity (Keeper or Msg).

    Args:
        conn: psycopg2 connection with AGE extension loaded
        doc_id: Document ID
        entity_name: Name of the entity being mentioned
        surface_form: Exact text that matched
        confidence: Confidence score (0.0-1.0)
        start_offset: Character position in document
    """
    with conn.cursor() as cursor:
        cursor.execute("SET search_path = ag_catalog, public;")

        # Find the entity by name (could be Keeper or Msg)
        # Use format() to inject variables directly into the Cypher query
        query = """
        SELECT * FROM cypher('regen_graph', $$
            MATCH (d:Document {{id: '{doc_id}'}})
            MATCH (e {{name: '{entity_name}'}})
            MERGE (d)-[r:MENTIONS {{surface_form: '{surface_form}', confidence: {confidence}, start_offset: {start_offset}}}]->(e)
            RETURN r
        $$) as (result agtype);
        """.format(
            doc_id=doc_id.replace("'", "''"),
            entity_name=entity_name.replace("'", "''"),
            surface_form=surface_form.replace("'", "''"),
            confidence=confidence,
            start_offset=start_offset
        )

        try:
            cursor.execute(query)
        except Exception as e:
            print(f"Warning: Could not create MENTIONS edge for {entity_name}: {e}")


def main():
    """Main execution function."""

    # Configuration
    DB_HOST = "localhost"
    DB_PORT = 5432
    DB_NAME = "eliza"  # Changed from "koi" to "eliza"
    GRAPH_NAME = "regen_graph"
    ENTITIES_JSON = "../../data/extracted_entities.json"
    DOC_LIMIT = 10000  # Process all documents (current total: 5,875)

    print("=" * 80)
    print("MENTIONS Edge Creation Script")
    print("=" * 80)

    # Load entities from JSON
    print(f"\n1. Loading entities from {ENTITIES_JSON}...")
    entities = load_entities_from_json(ENTITIES_JSON)
    print(f"   Loaded {len(entities)} entities:")
    keeper_count = sum(1 for e in entities if e.entity_type == "Keeper")
    msg_count = sum(1 for e in entities if e.entity_type == "Msg")
    print(f"   - {keeper_count} Keepers")
    print(f"   - {msg_count} Msgs")

    # Connect to database
    print(f"\n2. Connecting to PostgreSQL database '{DB_NAME}'...")
    conn = psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        database=DB_NAME,
        user="darrenzal"  # Changed to match system user
    )
    conn.autocommit = True

    # Load AGE extension
    print("   Loading AGE extension...")
    with conn.cursor() as cursor:
        cursor.execute("LOAD 'age';")
        cursor.execute("SET search_path = ag_catalog, public;")

    # Get documents from KOI
    print(f"\n3. Querying documents from koi_memories table (limit {DOC_LIMIT})...")
    documents = get_koi_documents(conn, limit=DOC_LIMIT)
    print(f"   Retrieved {len(documents)} documents")

    # Process each document
    print(f"\n4. Processing documents and creating graph nodes/edges...")

    total_mentions = 0
    doc_count = 0
    mention_details = []  # Store details for report

    for doc in documents:
        doc_id = str(doc['id'])
        content = doc.get('content', '')
        file_path = doc.get('file_path', 'unknown')
        title = doc.get('title', None)

        if not content:
            continue

        # Create Document node
        create_document_node(conn, doc_id, file_path, title)
        doc_count += 1

        # Extract mentions
        mentions = extract_entity_mentions(content, entities)

        if mentions:
            print(f"\n   Document {doc_id} ({file_path}):")
            print(f"   Found {len(mentions)} mentions")

            # Create MENTIONS edges
            for mention in mentions:
                create_mentions_edge(
                    conn,
                    doc_id,
                    mention.entity_name,
                    mention.surface_form,
                    mention.confidence,
                    mention.start_offset
                )

                total_mentions += 1

                # Store for report
                mention_details.append({
                    'doc_id': doc_id,
                    'file_path': file_path,
                    'entity_name': mention.entity_name,
                    'entity_type': mention.entity_type,
                    'surface_form': mention.surface_form,
                    'confidence': mention.confidence,
                    'context': mention.context
                })

                print(f"     - {mention.entity_name} ({mention.entity_type}): '{mention.surface_form}' [conf: {mention.confidence:.2f}]")

    # Summary
    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"Documents processed: {doc_count}")
    print(f"Total MENTIONS edges created: {total_mentions}")
    print(f"Average mentions per document: {total_mentions/doc_count:.2f}" if doc_count > 0 else "N/A")

    # Save results for report
    results = {
        'doc_count': doc_count,
        'total_mentions': total_mentions,
        'entities_loaded': len(entities),
        'keeper_count': keeper_count,
        'msg_count': msg_count,
        'mention_details': mention_details[:50]  # Top 50 for report
    }

    with open('mention_results.json', 'w') as f:
        json.dump(results, f, indent=2)

    print(f"\nResults saved to mention_results.json")

    # Close connection
    conn.close()
    print("\nDone!")


if __name__ == "__main__":
    main()
