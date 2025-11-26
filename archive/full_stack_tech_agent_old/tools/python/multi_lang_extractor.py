#!/usr/bin/env python3
"""
Multi-language entity extractor using tree-sitter.

Extracts code entities (classes, functions, types) from:
- Go (.go) - Keepers, Messages, Events
- Python (.py) - Classes, key functions
- TypeScript (.ts, .tsx) - Classes, interfaces, exported functions

Usage:
    python multi_lang_extractor.py /path/to/repo1 /path/to/repo2 ...
"""

import json
import os
import sys
from pathlib import Path
from typing import List, Dict, Optional
from tree_sitter import Language, Parser, Node

# Import language grammars
import tree_sitter_go
import tree_sitter_python
import tree_sitter_typescript


class EntityExtractor:
    """Multi-language entity extractor using tree-sitter."""

    def __init__(self):
        # Initialize parsers for each language
        self.go_parser = Parser(Language(tree_sitter_go.language()))
        self.python_parser = Parser(Language(tree_sitter_python.language()))
        self.ts_parser = Parser(Language(tree_sitter_typescript.language_typescript()))
        self.tsx_parser = Parser(Language(tree_sitter_typescript.language_tsx()))

    def get_node_text(self, node: Node, source: bytes) -> str:
        """Extract text from a node."""
        return source[node.start_byte:node.end_byte].decode('utf-8')

    def find_preceding_comment(self, node: Node, source: bytes) -> Optional[str]:
        """Find comment immediately preceding a node."""
        comments = []
        current = node.prev_sibling

        while current:
            if current.type in ['comment', 'line_comment', 'block_comment']:
                text = self.get_node_text(current, source)
                # Clean up comment markers
                if text.startswith('//'):
                    text = text[2:].strip()
                elif text.startswith('#'):
                    text = text[1:].strip()
                elif text.startswith('/*') and text.endswith('*/'):
                    text = text[2:-2].strip()
                elif text.startswith('"""') or text.startswith("'''"):
                    text = text[3:-3].strip()
                if text and not any(skip in text for skip in ['DO NOT EDIT', 'eslint', 'prettier']):
                    comments.insert(0, text)
                current = current.prev_sibling
            else:
                break

        return ' '.join(comments) if comments else None

    # ============= Go Extraction =============

    def extract_go_entities(self, file_path: str) -> List[Dict]:
        """Extract entities from a Go file."""
        entities = []

        with open(file_path, 'rb') as f:
            source = f.read()

        tree = self.go_parser.parse(source)
        rel_path = self._get_relative_path(file_path)

        def visit(node: Node):
            if node.type == 'type_declaration':
                for child in node.children:
                    if child.type == 'type_spec':
                        type_name = None
                        struct_type = None

                        for spec_child in child.children:
                            if spec_child.type == 'type_identifier':
                                type_name = self.get_node_text(spec_child, source)
                            elif spec_child.type == 'struct_type':
                                struct_type = spec_child

                        if type_name and struct_type:
                            entity_type = self._classify_go_entity(type_name, file_path)
                            if entity_type:
                                fields = self._extract_go_fields(struct_type, source)
                                entities.append({
                                    'entity_type': entity_type,
                                    'name': type_name,
                                    'file_path': rel_path,
                                    'line_number': node.start_point[0] + 1,
                                    'language': 'go',
                                    'docstring': self.find_preceding_comment(node, source),
                                    'fields': fields
                                })

            for child in node.children:
                visit(child)

        visit(tree.root_node)
        return entities

    def _classify_go_entity(self, name: str, file_path: str) -> Optional[str]:
        """Classify a Go struct as Keeper, Msg, or Event."""
        if name == 'Keeper' and 'keeper' in file_path.lower():
            return 'Keeper'
        elif name.startswith('Msg') and not name.endswith('Response'):
            return 'Message'
        elif name.startswith('Event'):
            return 'Event'
        elif name.startswith('Query') and name.endswith('Request'):
            return 'Query'
        return None

    def _extract_go_fields(self, struct_node: Node, source: bytes) -> List[str]:
        """Extract field names from a Go struct."""
        fields = []
        for child in struct_node.children:
            if child.type == 'field_declaration_list':
                for field in child.children:
                    if field.type == 'field_declaration':
                        for subchild in field.children:
                            if subchild.type == 'field_identifier':
                                fields.append(self.get_node_text(subchild, source))
        return fields

    # ============= Python Extraction =============

    def extract_python_entities(self, file_path: str) -> List[Dict]:
        """Extract entities from a Python file."""
        entities = []

        with open(file_path, 'rb') as f:
            source = f.read()

        tree = self.python_parser.parse(source)
        rel_path = self._get_relative_path(file_path)

        def visit(node: Node, depth: int = 0):
            # Classes
            if node.type == 'class_definition':
                class_name = None
                methods = []
                docstring = None

                for child in node.children:
                    if child.type == 'identifier':
                        class_name = self.get_node_text(child, source)
                    elif child.type == 'block':
                        # Get docstring and methods
                        for block_child in child.children:
                            if block_child.type == 'expression_statement':
                                for expr in block_child.children:
                                    if expr.type == 'string':
                                        docstring = self.get_node_text(expr, source).strip('"\'')
                            elif block_child.type == 'function_definition':
                                for func_child in block_child.children:
                                    if func_child.type == 'identifier':
                                        methods.append(self.get_node_text(func_child, source))

                if class_name:
                    entity_type = self._classify_python_class(class_name, file_path)
                    entities.append({
                        'entity_type': entity_type,
                        'name': class_name,
                        'file_path': rel_path,
                        'line_number': node.start_point[0] + 1,
                        'language': 'python',
                        'docstring': docstring,
                        'methods': methods[:10]  # Limit methods
                    })

            # Top-level functions (depth 0 only)
            elif node.type == 'function_definition' and depth == 0:
                func_name = None
                for child in node.children:
                    if child.type == 'identifier':
                        func_name = self.get_node_text(child, source)
                        break

                if func_name and not func_name.startswith('_'):
                    entities.append({
                        'entity_type': 'Function',
                        'name': func_name,
                        'file_path': rel_path,
                        'line_number': node.start_point[0] + 1,
                        'language': 'python',
                        'docstring': self.find_preceding_comment(node, source)
                    })

            for child in node.children:
                visit(child, depth + 1 if node.type in ['class_definition', 'function_definition'] else depth)

        visit(tree.root_node)
        return entities

    def _classify_python_class(self, name: str, file_path: str) -> str:
        """Classify a Python class."""
        name_lower = name.lower()
        if 'handler' in name_lower or 'keeper' in name_lower:
            return 'Handler'
        elif 'processor' in name_lower:
            return 'Processor'
        elif 'sensor' in name_lower:
            return 'Sensor'
        elif 'client' in name_lower:
            return 'Client'
        elif 'api' in name_lower or 'server' in name_lower:
            return 'API'
        elif 'config' in name_lower:
            return 'Config'
        return 'Class'

    # ============= TypeScript Extraction =============

    def extract_typescript_entities(self, file_path: str) -> List[Dict]:
        """Extract entities from a TypeScript file."""
        entities = []

        with open(file_path, 'rb') as f:
            source = f.read()

        parser = self.tsx_parser if file_path.endswith('.tsx') else self.ts_parser
        tree = parser.parse(source)
        rel_path = self._get_relative_path(file_path)

        def visit(node: Node):
            # Classes
            if node.type == 'class_declaration':
                class_name = None
                methods = []

                for child in node.children:
                    if child.type == 'type_identifier':
                        class_name = self.get_node_text(child, source)
                    elif child.type == 'class_body':
                        for body_child in child.children:
                            if body_child.type == 'method_definition':
                                for method_child in body_child.children:
                                    if method_child.type == 'property_identifier':
                                        methods.append(self.get_node_text(method_child, source))

                if class_name:
                    entities.append({
                        'entity_type': 'Class',
                        'name': class_name,
                        'file_path': rel_path,
                        'line_number': node.start_point[0] + 1,
                        'language': 'typescript',
                        'docstring': self.find_preceding_comment(node, source),
                        'methods': methods[:10]
                    })

            # Interfaces
            elif node.type == 'interface_declaration':
                interface_name = None
                properties = []

                for child in node.children:
                    if child.type == 'type_identifier':
                        interface_name = self.get_node_text(child, source)
                    elif child.type == 'object_type':
                        for prop in child.children:
                            if prop.type == 'property_signature':
                                for prop_child in prop.children:
                                    if prop_child.type == 'property_identifier':
                                        properties.append(self.get_node_text(prop_child, source))

                if interface_name:
                    entities.append({
                        'entity_type': 'Interface',
                        'name': interface_name,
                        'file_path': rel_path,
                        'line_number': node.start_point[0] + 1,
                        'language': 'typescript',
                        'docstring': self.find_preceding_comment(node, source),
                        'properties': properties[:10]
                    })

            # Type aliases
            elif node.type == 'type_alias_declaration':
                type_name = None
                for child in node.children:
                    if child.type == 'type_identifier':
                        type_name = self.get_node_text(child, source)
                        break

                if type_name:
                    entities.append({
                        'entity_type': 'Type',
                        'name': type_name,
                        'file_path': rel_path,
                        'line_number': node.start_point[0] + 1,
                        'language': 'typescript',
                        'docstring': self.find_preceding_comment(node, source)
                    })

            # Exported functions
            elif node.type == 'export_statement':
                for child in node.children:
                    if child.type == 'function_declaration':
                        func_name = None
                        for func_child in child.children:
                            if func_child.type == 'identifier':
                                func_name = self.get_node_text(func_child, source)
                                break

                        if func_name:
                            entities.append({
                                'entity_type': 'Function',
                                'name': func_name,
                                'file_path': rel_path,
                                'line_number': node.start_point[0] + 1,
                                'language': 'typescript',
                                'docstring': self.find_preceding_comment(node, source)
                            })

            for child in node.children:
                visit(child)

        visit(tree.root_node)
        return entities

    # ============= Main Extraction =============

    def _get_relative_path(self, file_path: str) -> str:
        """Get path relative to RegenAI directory."""
        base = '/Users/darrenzal/projects/RegenAI/'
        if file_path.startswith(base):
            return file_path[len(base):]
        return file_path

    def extract_from_file(self, file_path: str) -> List[Dict]:
        """Extract entities from a single file based on extension."""
        if file_path.endswith('.go') and not file_path.endswith('_test.go'):
            return self.extract_go_entities(file_path)
        elif file_path.endswith('.py') and not file_path.endswith('_test.py'):
            return self.extract_python_entities(file_path)
        elif file_path.endswith('.ts') or file_path.endswith('.tsx'):
            if not any(skip in file_path for skip in ['node_modules', '.d.ts', 'test', 'spec']):
                return self.extract_typescript_entities(file_path)
        return []

    def extract_from_directory(self, directory: str) -> List[Dict]:
        """Extract entities from all supported files in a directory."""
        all_entities = []
        skip_dirs = {'node_modules', '.git', 'dist', 'build', '__pycache__', '.pytest_cache', 'venv', '.venv'}

        for root, dirs, files in os.walk(directory):
            # Skip unwanted directories
            dirs[:] = [d for d in dirs if d not in skip_dirs]

            for file in files:
                file_path = os.path.join(root, file)
                try:
                    entities = self.extract_from_file(file_path)
                    all_entities.extend(entities)
                except Exception as e:
                    print(f"  Error processing {file_path}: {e}")

        return all_entities

    def extract_from_repos(self, repo_paths: List[str]) -> Dict:
        """Extract entities from multiple repositories."""
        result = {
            'repos': {},
            'all_entities': [],
            'summary': {
                'total_entities': 0,
                'by_type': {},
                'by_language': {},
                'by_repo': {}
            }
        }

        for repo_path in repo_paths:
            if not os.path.isdir(repo_path):
                print(f"  Skipping (not a directory): {repo_path}")
                continue

            repo_name = os.path.basename(repo_path)
            print(f"\n📁 Extracting from {repo_name}...")

            entities = self.extract_from_directory(repo_path)
            result['repos'][repo_name] = entities
            result['all_entities'].extend(entities)

            # Update summary
            result['summary']['by_repo'][repo_name] = len(entities)
            for entity in entities:
                etype = entity['entity_type']
                lang = entity.get('language', 'unknown')
                result['summary']['by_type'][etype] = result['summary']['by_type'].get(etype, 0) + 1
                result['summary']['by_language'][lang] = result['summary']['by_language'].get(lang, 0) + 1

        result['summary']['total_entities'] = len(result['all_entities'])
        return result


def main():
    """Main entry point."""
    # Default repos to extract
    repos = [
        '/Users/darrenzal/projects/RegenAI/regen-koi-mcp',
        '/Users/darrenzal/projects/RegenAI/koi-processor',
        '/Users/darrenzal/projects/RegenAI/koi-research',
        '/Users/darrenzal/projects/RegenAI/koi-sensors',
        '/Users/darrenzal/projects/RegenAI/GAIA',
    ]

    # Allow override via command line
    if len(sys.argv) > 1:
        repos = sys.argv[1:]

    print("🔍 Multi-Language Entity Extractor")
    print("=" * 50)

    extractor = EntityExtractor()
    result = extractor.extract_from_repos(repos)

    # Print summary
    print("\n" + "=" * 50)
    print("📊 EXTRACTION SUMMARY")
    print("=" * 50)
    print(f"\nTotal entities: {result['summary']['total_entities']}")

    print("\nBy Repository:")
    for repo, count in result['summary']['by_repo'].items():
        print(f"  {repo}: {count}")

    print("\nBy Type:")
    for etype, count in sorted(result['summary']['by_type'].items(), key=lambda x: -x[1]):
        print(f"  {etype}: {count}")

    print("\nBy Language:")
    for lang, count in result['summary']['by_language'].items():
        print(f"  {lang}: {count}")

    # Save to JSON
    output_dir = Path(__file__).parent.parent / 'data'
    output_dir.mkdir(exist_ok=True)

    output_file = output_dir / 'multi_repo_entities.json'
    with open(output_file, 'w') as f:
        json.dump(result, f, indent=2)

    print(f"\n✅ Saved to {output_file}")

    # Print sample entities
    print("\n📝 Sample Entities:")
    for lang in ['go', 'python', 'typescript']:
        samples = [e for e in result['all_entities'] if e.get('language') == lang][:2]
        if samples:
            print(f"\n  {lang.upper()}:")
            for s in samples:
                print(f"    - {s['entity_type']}: {s['name']} ({s['file_path']}:{s['line_number']})")


if __name__ == '__main__':
    main()
