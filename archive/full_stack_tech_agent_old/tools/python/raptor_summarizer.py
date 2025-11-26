#!/usr/bin/env python3
"""
RAPTOR Summarizer - Recursive Abstractive Processing for Tree-Organized Retrieval

Generates hierarchical module-level summaries for the Regen codebase, enabling
high-level navigation queries like "Which module handles carbon credits?"

This script:
1. Discovers modules from indexed code entities
2. Aggregates content per module (entities, docstrings, related docs)
3. Generates LLM summaries using OpenAI
4. Embeds summaries using the BGE server
5. Loads Module nodes with CONTAINS edges into the Apache AGE graph

Usage:
    python raptor_summarizer.py [--dry-run] [--skip-llm] [--skip-embed]
"""

import json
import os
import sys
import re
import requests
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple
from dataclasses import dataclass, field
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
import psycopg2

# Checkpoint configuration
CHECKPOINT_FILE = Path(__file__).parent / "raptor_checkpoint.json"
CHECKPOINT_INTERVAL = 10  # Save every N modules
PARALLEL_WORKERS = 5  # Number of concurrent API calls


@dataclass
class Entity:
    """Represents a code entity (function, class, etc.)"""
    name: str
    entity_type: str
    file_path: str
    line_number: int
    language: str
    docstring: Optional[str] = None
    methods: List[str] = field(default_factory=list)
    fields: List[str] = field(default_factory=list)
    repo: Optional[str] = None


@dataclass
class Module:
    """Represents a module with aggregated content"""
    name: str
    repo: str
    path: str
    entities: List[Entity] = field(default_factory=list)
    entity_types: Dict[str, int] = field(default_factory=dict)
    summary: Optional[str] = None
    embedding: Optional[List[float]] = None

    @property
    def entity_count(self) -> int:
        return len(self.entities)

    def get_content_for_summary(self, max_chars: int = 8000) -> str:
        """Generate content string for LLM summarization."""
        lines = [
            f"# Module: {self.name}",
            f"Repository: {self.repo}",
            f"Path: {self.path}",
            f"Total Entities: {self.entity_count}",
            "",
            "## Entity Types:",
        ]

        for etype, count in sorted(self.entity_types.items(), key=lambda x: -x[1]):
            lines.append(f"- {etype}: {count}")

        lines.extend(["", "## Key Entities:"])

        # Group entities by type and include docstrings
        by_type = defaultdict(list)
        for entity in self.entities:
            by_type[entity.entity_type].append(entity)

        chars_used = len('\n'.join(lines))

        for etype, entities in sorted(by_type.items(), key=lambda x: -len(x[1])):
            type_header = f"\n### {etype}s ({len(entities)}):\n"
            if chars_used + len(type_header) > max_chars:
                break
            lines.append(type_header)
            chars_used += len(type_header)

            for entity in entities[:10]:  # Limit per type
                entry = f"- **{entity.name}**"
                if entity.docstring:
                    # Truncate long docstrings
                    doc = entity.docstring[:200].replace('\n', ' ')
                    entry += f": {doc}"
                if entity.methods:
                    entry += f" (methods: {', '.join(entity.methods[:5])})"

                entry += "\n"
                if chars_used + len(entry) > max_chars:
                    break
                lines.append(entry)
                chars_used += len(entry)

        return '\n'.join(lines)


class RaptorSummarizer:
    """RAPTOR implementation for module-level summaries."""

    def __init__(
        self,
        db_connection: str = "postgresql://darrenzal@localhost:5432/eliza",
        graph_name: str = "regen_graph",
        bge_url: str = "http://localhost:8090",
        openai_api_key: Optional[str] = None
    ):
        self.db_connection = db_connection
        self.graph_name = graph_name
        self.bge_url = bge_url
        self.openai_api_key = openai_api_key or os.environ.get("OPENAI_API_KEY")
        self.conn = None
        self.cursor = None

        # Module discovery patterns
        self.regen_ledger_modules = [
            'x/ecocredit', 'x/data', 'x/intertx', 'x/marketplace',
            'app', 'cmd', 'types', 'api', 'proto'
        ]

        self.stats = {
            'modules_discovered': 0,
            'summaries_generated': 0,
            'embeddings_created': 0,
            'nodes_created': 0,
            'edges_created': 0,
            'errors': []
        }

    def connect(self):
        """Connect to database and load AGE."""
        self.conn = psycopg2.connect(self.db_connection)
        self.cursor = self.conn.cursor()
        self.cursor.execute("LOAD 'age';")
        self.cursor.execute('SET search_path = ag_catalog, "$user", public;')
        print("✓ Connected to database, AGE loaded")

    def close(self):
        """Close database connection."""
        if self.cursor:
            self.cursor.close()
        if self.conn:
            self.conn.close()
        print("✓ Connection closed")

    # ============= Checkpointing =============

    def load_checkpoint(self) -> Dict[str, Dict]:
        """Load existing checkpoint data."""
        if CHECKPOINT_FILE.exists():
            try:
                with open(CHECKPOINT_FILE, 'r') as f:
                    data = json.load(f)
                print(f"✓ Loaded checkpoint: {len(data)} modules already processed")
                return data
            except Exception as e:
                print(f"⚠ Could not load checkpoint: {e}")
        return {}

    def save_checkpoint(self, checkpoint_data: Dict[str, Dict]):
        """Save checkpoint data to file."""
        try:
            with open(CHECKPOINT_FILE, 'w') as f:
                json.dump(checkpoint_data, f, indent=2)
            print(f"   💾 Checkpoint saved: {len(checkpoint_data)} modules")
        except Exception as e:
            print(f"   ⚠ Checkpoint save failed: {e}")

    def clear_checkpoint(self):
        """Remove checkpoint file after successful completion."""
        if CHECKPOINT_FILE.exists():
            CHECKPOINT_FILE.unlink()
            print("✓ Checkpoint cleared")

    def escape_cypher(self, s: str) -> str:
        """Escape string for Cypher query."""
        if s is None:
            return ''
        return s.replace("\\", "\\\\").replace("'", "\\'").replace("\n", " ").replace("\r", "")

    # ============= Module Discovery =============

    def discover_modules_from_entities(self, entities_file: str) -> Dict[str, Module]:
        """Discover modules by analyzing file paths of entities."""
        print(f"\n📁 Discovering modules from {entities_file}...")

        with open(entities_file, 'r') as f:
            data = json.load(f)

        all_entities = data.get('all_entities', [])
        print(f"   Loaded {len(all_entities)} entities")

        modules: Dict[str, Module] = {}

        for entity_data in all_entities:
            entity = Entity(
                name=entity_data.get('name', ''),
                entity_type=entity_data.get('entity_type', 'Unknown'),
                file_path=entity_data.get('file_path', ''),
                line_number=entity_data.get('line_number', 0),
                language=entity_data.get('language', 'unknown'),
                docstring=entity_data.get('docstring'),
                methods=entity_data.get('methods', []),
                fields=entity_data.get('fields', [])
            )

            # Extract module info from file path
            module_info = self._extract_module_info(entity.file_path)
            if module_info:
                repo, module_path, module_name = module_info
                entity.repo = repo

                # Create module key
                module_key = f"{repo}/{module_name}"

                if module_key not in modules:
                    modules[module_key] = Module(
                        name=module_name,
                        repo=repo,
                        path=module_path
                    )

                modules[module_key].entities.append(entity)

                # Track entity type counts
                etype = entity.entity_type
                modules[module_key].entity_types[etype] = \
                    modules[module_key].entity_types.get(etype, 0) + 1

        self.stats['modules_discovered'] = len(modules)
        print(f"   ✓ Discovered {len(modules)} modules")

        return modules

    def _extract_module_info(self, file_path: str) -> Optional[Tuple[str, str, str]]:
        """Extract (repo, module_path, module_name) from file path."""
        if not file_path:
            return None

        parts = file_path.split('/')
        if len(parts) < 2:
            return None

        repo = parts[0]

        # For regen-ledger, look for x/ modules
        if repo == 'regen-ledger' and len(parts) >= 3 and parts[1] == 'x':
            module_name = parts[2]  # e.g., 'ecocredit'
            module_path = f"x/{module_name}"
            return (repo, module_path, module_name)

        # For other repos, use top-level directory as module
        # Common patterns: src/, lib/, packages/, etc.
        if len(parts) >= 2:
            # Check for common package structures
            if parts[1] in ['src', 'lib', 'packages', 'internal', 'pkg']:
                if len(parts) >= 3:
                    module_name = parts[2]
                    module_path = '/'.join(parts[1:3])
                else:
                    module_name = parts[1]
                    module_path = parts[1]
            else:
                # Use first directory as module
                module_name = parts[1]
                module_path = parts[1]

            return (repo, module_path, module_name)

        return None

    def discover_regen_ledger_modules(self, ledger_path: str) -> Dict[str, Module]:
        """Discover modules specifically from regen-ledger x/ directory."""
        print(f"\n📁 Discovering regen-ledger modules from {ledger_path}...")

        modules: Dict[str, Module] = {}
        x_path = Path(ledger_path) / 'x'

        if not x_path.exists():
            print(f"   ⚠ x/ directory not found at {x_path}")
            return modules

        for module_dir in x_path.iterdir():
            if module_dir.is_dir() and not module_dir.name.startswith('.'):
                module_name = module_dir.name
                module_key = f"regen-ledger/{module_name}"

                modules[module_key] = Module(
                    name=module_name,
                    repo='regen-ledger',
                    path=f"x/{module_name}"
                )

                print(f"   Found module: x/{module_name}")

        return modules

    # ============= Summary Generation =============

    def generate_summary(self, module: Module) -> Optional[str]:
        """Generate LLM summary for a module using OpenAI."""
        if not self.openai_api_key:
            print(f"   ⚠ No OpenAI API key, skipping summary for {module.name}")
            return None

        content = module.get_content_for_summary()

        prompt = f"""You are a technical documentation expert analyzing the Regen Network codebase.

Generate a concise 2-3 paragraph summary of the following module. Cover:
1. The primary purpose and responsibility of this module
2. Key entities and their roles (classes, functions, types)
3. How this module might relate to other parts of the Regen ecosystem (carbon credits, ecological data, blockchain)

Be specific and technical. Avoid generic statements.

{content}

---
Summary:"""

        try:
            response = requests.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.openai_api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "gpt-4.1-mini",
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 500,
                    "temperature": 0.3
                },
                timeout=30
            )

            if response.status_code == 200:
                data = response.json()
                summary = data['choices'][0]['message']['content'].strip()
                self.stats['summaries_generated'] += 1
                return summary
            else:
                error = f"OpenAI API error {response.status_code}: {response.text}"
                self.stats['errors'].append(error)
                print(f"   ✗ {error}")
                return None

        except Exception as e:
            error = f"Summary generation error for {module.name}: {e}"
            self.stats['errors'].append(error)
            print(f"   ✗ {error}")
            return None

    # ============= Embedding Generation =============

    def generate_embedding(self, text: str) -> Optional[List[float]]:
        """Generate embedding using the BGE server."""
        try:
            response = requests.post(
                f"{self.bge_url}/encode",
                json={"text": text},
                timeout=30
            )

            if response.status_code == 200:
                data = response.json()
                embedding = data.get('embedding', data.get('embeddings', []))
                if embedding:
                    self.stats['embeddings_created'] += 1
                    return embedding
            else:
                print(f"   ⚠ BGE error {response.status_code}")

        except Exception as e:
            print(f"   ⚠ Embedding error: {e}")

        return None

    def process_module(self, key: str, module: Module, skip_llm: bool, skip_embed: bool) -> Tuple[str, Optional[str], Optional[List[float]]]:
        """Process a single module (summary + embedding). Thread-safe for parallel execution."""
        summary = None
        embedding = None

        # Generate LLM summary
        if not skip_llm:
            summary = self.generate_summary(module)

        # Generate embedding
        if not skip_embed and summary:
            embedding = self.generate_embedding(summary)

        return key, summary, embedding

    # ============= Graph Loading =============

    def create_module_node(self, module: Module) -> bool:
        """Create a Module node in the graph."""
        try:
            name = self.escape_cypher(module.name)
            repo = self.escape_cypher(module.repo)
            path = self.escape_cypher(module.path)
            summary = self.escape_cypher(module.summary or '')[:2000]  # Limit length

            # Create node
            query = f"""
            SELECT * FROM cypher('{self.graph_name}', $$
                CREATE (m:Module {{
                    name: '{name}',
                    repo: '{repo}',
                    path: '{path}',
                    summary: '{summary}',
                    entity_count: {module.entity_count}
                }})
                RETURN m
            $$) as (m agtype);
            """

            self.cursor.execute(query)
            self.conn.commit()
            self.stats['nodes_created'] += 1
            return True

        except Exception as e:
            error = f"Error creating Module node {module.name}: {e}"
            self.stats['errors'].append(error)
            self.conn.rollback()
            return False

    def create_contains_edges(self, module: Module) -> int:
        """Create CONTAINS edges from Module to its entities."""
        edges_created = 0

        # Group entities by type for efficient edge creation
        for entity in module.entities:
            try:
                entity_name = self.escape_cypher(entity.name)
                module_name = self.escape_cypher(module.name)

                # Match existing entity and create edge
                # This requires entities to already exist in the graph
                query = f"""
                SELECT * FROM cypher('{self.graph_name}', $$
                    MATCH (m:Module {{name: '{module_name}', repo: '{module.repo}'}})
                    MATCH (e {{name: '{entity_name}', repo: '{module.repo}'}})
                    WHERE NOT (m)-[:CONTAINS]->(e)
                    CREATE (m)-[:CONTAINS]->(e)
                    RETURN e
                $$) as (e agtype);
                """

                self.cursor.execute(query)
                result = self.cursor.fetchall()
                if result:
                    edges_created += 1
                self.conn.commit()

            except Exception as e:
                # Entity might not exist in graph - that's ok
                self.conn.rollback()
                continue

        self.stats['edges_created'] += edges_created
        return edges_created

    def store_module_embedding(self, module: Module) -> bool:
        """Store module summary embedding in koi_embeddings."""
        if not module.embedding or not module.summary:
            return False

        try:
            # First, create or get memory entry for the module summary
            rid = f"module:{module.repo}/{module.name}"

            # Content must be JSONB
            content_json = json.dumps({
                'text': module.summary,
                'type': 'module_summary'
            })

            metadata_json = json.dumps({
                'repo': module.repo,
                'path': module.path,
                'entity_count': module.entity_count,
                'title': f"Module: {module.name}"
            })

            # Insert into koi_memories (content is jsonb, requires event_type and source_sensor)
            self.cursor.execute("""
                INSERT INTO koi_memories (rid, event_type, source_sensor, content, metadata, created_at)
                VALUES (%s, %s, %s, %s::jsonb, %s::jsonb, NOW())
                ON CONFLICT (rid) DO UPDATE
                SET content = EXCLUDED.content, metadata = EXCLUDED.metadata
                RETURNING id
            """, (
                rid,
                'NEW',
                'raptor_summarizer',
                content_json,
                metadata_json
            ))

            memory_id = self.cursor.fetchone()[0]

            # Insert embedding (1024 dims from BGE/OpenAI text-embedding-3-large)
            embedding_str = f"[{','.join(str(x) for x in module.embedding)}]"

            self.cursor.execute(f"""
                INSERT INTO koi_embeddings (memory_id, dim_1024)
                VALUES (%s, %s::vector)
                ON CONFLICT (memory_id) DO UPDATE
                SET dim_1024 = EXCLUDED.dim_1024
            """, (memory_id, embedding_str))

            self.conn.commit()
            return True

        except Exception as e:
            error = f"Error storing embedding for {module.name}: {e}"
            self.stats['errors'].append(error)
            self.conn.rollback()
            return False

    # ============= Main Pipeline =============

    def run(
        self,
        entities_file: str,
        dry_run: bool = False,
        skip_llm: bool = False,
        skip_embed: bool = False
    ):
        """Run the full RAPTOR pipeline."""
        print("=" * 60)
        print("🌳 RAPTOR Summarizer - Module-Level Abstraction")
        print("=" * 60)

        if dry_run:
            print("⚠ DRY RUN MODE - No changes will be made")

        # Step 1: Discover modules
        modules = self.discover_modules_from_entities(entities_file)

        # Print module summary
        print(f"\n📊 Module Discovery Summary:")
        print(f"   Total modules: {len(modules)}")

        by_repo = defaultdict(list)
        for key, module in modules.items():
            by_repo[module.repo].append(module)

        for repo, repo_modules in sorted(by_repo.items()):
            print(f"\n   {repo}:")
            for m in sorted(repo_modules, key=lambda x: -x.entity_count)[:10]:
                print(f"      - {m.name} ({m.entity_count} entities)")

        if dry_run:
            print("\n✓ Dry run complete - no changes made")
            return

        # Connect to database
        self.connect()

        try:
            # Load checkpoint
            checkpoint = self.load_checkpoint()

            # Step 2: Generate summaries and embeddings
            print(f"\n📝 Generating summaries and embeddings ({PARALLEL_WORKERS} parallel workers)...")

            # Separate cached vs to-process modules
            to_process = {}
            for key, module in modules.items():
                if key in checkpoint:
                    module.summary = checkpoint[key].get('summary')
                    module.embedding = checkpoint[key].get('embedding')
                    print(f"   Cached: {key}")
                else:
                    to_process[key] = module

            if not to_process:
                print("   All modules already cached!")
            else:
                print(f"\n   Processing {len(to_process)} modules in parallel...")
                processed_count = 0

                # Process in parallel using ThreadPoolExecutor
                with ThreadPoolExecutor(max_workers=PARALLEL_WORKERS) as executor:
                    # Submit all tasks
                    futures = {
                        executor.submit(self.process_module, key, module, skip_llm, skip_embed): key
                        for key, module in to_process.items()
                    }

                    # Collect results as they complete
                    for future in as_completed(futures):
                        key = futures[future]
                        try:
                            result_key, summary, embedding = future.result()
                            module = modules[result_key]
                            module.summary = summary
                            module.embedding = embedding

                            # Log result
                            status = []
                            if summary:
                                status.append(f"summary:{len(summary)}ch")
                            if embedding:
                                status.append(f"embed:{len(embedding)}d")
                            print(f"   ✓ {result_key} ({', '.join(status) if status else 'no data'})")

                            # Save to checkpoint
                            checkpoint[result_key] = {
                                'summary': summary,
                                'embedding': embedding
                            }
                            processed_count += 1

                            # Checkpoint every N modules
                            if processed_count % CHECKPOINT_INTERVAL == 0:
                                self.save_checkpoint(checkpoint)

                        except Exception as e:
                            print(f"   ✗ {key}: {e}")
                            self.stats['errors'].append(str(e))

                # Final checkpoint save
                if processed_count > 0:
                    self.save_checkpoint(checkpoint)
                    print(f"\n✓ All summaries/embeddings complete ({len(checkpoint)} total)")

            # Step 3: Load into graph
            print(f"\n📊 Loading modules into graph...")

            for key, module in modules.items():
                success = self.create_module_node(module)
                if success:
                    print(f"   ✓ Created node: {key}")

                    # Create CONTAINS edges
                    edges = self.create_contains_edges(module)
                    if edges > 0:
                        print(f"      + {edges} CONTAINS edges")

                    # Store embedding
                    if module.embedding:
                        if self.store_module_embedding(module):
                            print(f"      + Stored embedding")

            # Clear checkpoint on success
            self.clear_checkpoint()

        finally:
            self.close()

        # Print final stats
        self.print_summary()

    def print_summary(self):
        """Print final statistics."""
        print("\n" + "=" * 60)
        print("📊 RAPTOR SUMMARY")
        print("=" * 60)
        print(f"\nModules discovered: {self.stats['modules_discovered']}")
        print(f"Summaries generated: {self.stats['summaries_generated']}")
        print(f"Embeddings created: {self.stats['embeddings_created']}")
        print(f"Graph nodes created: {self.stats['nodes_created']}")
        print(f"Graph edges created: {self.stats['edges_created']}")

        if self.stats['errors']:
            print(f"\n⚠ Errors ({len(self.stats['errors'])}):")
            for e in self.stats['errors'][:5]:
                print(f"   - {e}")


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(description="RAPTOR Module Summarizer")
    parser.add_argument('--dry-run', action='store_true', help="Discover modules without making changes")
    parser.add_argument('--skip-llm', action='store_true', help="Skip LLM summary generation")
    parser.add_argument('--skip-embed', action='store_true', help="Skip embedding generation")
    parser.add_argument('--entities-file', type=str,
                       default=str(Path(__file__).parent.parent / 'data' / 'multi_repo_entities.json'),
                       help="Path to entities JSON file")

    args = parser.parse_args()

    # Check if entities file exists, if not try alternate location
    entities_file = args.entities_file
    if not Path(entities_file).exists():
        alt_path = Path(__file__).parent / 'data' / 'multi_repo_entities.json'
        if alt_path.exists():
            entities_file = str(alt_path)
        else:
            print(f"✗ Entities file not found: {args.entities_file}")
            print("  Please run multi_lang_extractor.py first")
            sys.exit(1)

    summarizer = RaptorSummarizer()
    summarizer.run(
        entities_file=entities_file,
        dry_run=args.dry_run,
        skip_llm=args.skip_llm,
        skip_embed=args.skip_embed
    )


if __name__ == "__main__":
    main()
