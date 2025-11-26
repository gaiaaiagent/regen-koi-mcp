#!/usr/bin/env python3
"""
Tree-sitter spike for extracting Keeper and Msg structs from Regen Network Go code.

This script demonstrates using tree-sitter-go to parse Go source files and extract
structured information about Keepers and Messages for knowledge graph construction.
"""

import json
import os
from pathlib import Path
from typing import List, Dict, Optional
from tree_sitter import Language, Parser, Node
import tree_sitter_go


def get_comment_text(node: Node, source_code: bytes) -> Optional[str]:
    """Extract comment text from a comment node."""
    text = source_code[node.start_byte:node.end_byte].decode('utf-8')

    # Clean up comment markers
    if text.startswith('//'):
        text = text[2:].strip()
    elif text.startswith('/*') and text.endswith('*/'):
        text = text[2:-2].strip()

    return text if text else None


def find_preceding_comment(node: Node, source_code: bytes) -> Optional[str]:
    """Find and extract the comment immediately preceding a node."""
    comments = []
    current = node.prev_sibling

    # Look backwards for comments
    while current:
        if current.type == 'comment':
            comment_text = get_comment_text(current, source_code)
            if comment_text:
                # Filter out irrelevant comments
                if not any(skip in comment_text for skip in [
                    'compile-time assertion',
                    'please upgrade the proto',
                    'Reference imports',
                    'DO NOT EDIT'
                ]):
                    comments.insert(0, comment_text)
            current = current.prev_sibling
        elif current.type in ['line_comment', 'block_comment']:
            comment_text = get_comment_text(current, source_code)
            if comment_text:
                comments.insert(0, comment_text)
            current = current.prev_sibling
        else:
            # Stop at first non-comment
            break

    return ' '.join(comments) if comments else None


def extract_struct_fields(struct_node: Node, source_code: bytes) -> List[str]:
    """Extract field names from a struct type."""
    fields = []

    # Find the field_declaration_list
    for child in struct_node.children:
        if child.type == 'field_declaration_list':
            for field_decl in child.children:
                if field_decl.type == 'field_declaration':
                    # Get field names
                    for subchild in field_decl.children:
                        if subchild.type == 'field_identifier':
                            field_name = source_code[subchild.start_byte:subchild.end_byte].decode('utf-8')
                            fields.append(field_name)

    return fields


def is_keeper_struct(struct_name: str, file_path: str) -> bool:
    """Determine if a struct is a Keeper based on name and location."""
    return (
        struct_name == 'Keeper' and
        'keeper' in file_path.lower()
    )


def is_msg_struct(struct_name: str, file_path: str) -> bool:
    """Determine if a struct is a Msg based on name pattern."""
    return (
        struct_name.startswith('Msg') and
        not struct_name.endswith('Response') and
        'types' in file_path
    )


def extract_entities_from_file(file_path: str, parser: Parser) -> List[Dict]:
    """Extract Keeper and Msg entities from a single Go file."""
    entities = []

    with open(file_path, 'rb') as f:
        source_code = f.read()

    tree = parser.parse(source_code)
    root = tree.root_node

    # Find type declarations
    def visit_node(node: Node):
        if node.type == 'type_declaration':
            # Look for type_spec children
            for child in node.children:
                if child.type == 'type_spec':
                    # Get the type name
                    type_name = None
                    struct_type = None

                    for spec_child in child.children:
                        if spec_child.type == 'type_identifier':
                            type_name = source_code[spec_child.start_byte:spec_child.end_byte].decode('utf-8')
                        elif spec_child.type == 'struct_type':
                            struct_type = spec_child

                    if type_name and struct_type:
                        # Check if it's a Keeper or Msg
                        entity_type = None
                        if is_keeper_struct(type_name, file_path):
                            entity_type = 'Keeper'
                        elif is_msg_struct(type_name, file_path):
                            entity_type = 'Msg'

                        if entity_type:
                            # Extract docstring
                            docstring = find_preceding_comment(node, source_code)

                            # Extract fields
                            fields = extract_struct_fields(struct_type, source_code)

                            # Get line number (1-indexed)
                            line_number = node.start_point[0] + 1

                            entity = {
                                'entity_type': entity_type,
                                'name': type_name,
                                'file_path': file_path,
                                'line_number': line_number,
                                'docstring': docstring,
                                'fields': fields
                            }

                            entities.append(entity)

        # Recursively visit children
        for child in node.children:
            visit_node(child)

    visit_node(root)
    return entities


def extract_entities_from_directory(directory: str) -> List[Dict]:
    """Extract entities from all Go files in a directory tree."""
    # Initialize parser
    GO_LANGUAGE = Language(tree_sitter_go.language())
    parser = Parser(GO_LANGUAGE)

    all_entities = []

    # Walk directory tree
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith('.go') and not file.endswith('_test.go'):
                file_path = os.path.join(root, file)
                try:
                    entities = extract_entities_from_file(file_path, parser)
                    all_entities.extend(entities)
                except Exception as e:
                    print(f"Error processing {file_path}: {e}")

    return all_entities


def main():
    """Main entry point for the spike script."""
    # Target the x/ecocredit directory
    base_dir = Path(__file__).parent.parent.parent
    ecocredit_dir = base_dir / 'regen-ledger' / 'x' / 'ecocredit'

    if not ecocredit_dir.exists():
        print(f"Error: Directory not found: {ecocredit_dir}")
        return

    print(f"Extracting entities from: {ecocredit_dir}")

    # Extract entities
    entities = extract_entities_from_directory(str(ecocredit_dir))

    # Print summary
    keepers = [e for e in entities if e['entity_type'] == 'Keeper']
    msgs = [e for e in entities if e['entity_type'] == 'Msg']

    print(f"\nFound {len(keepers)} Keepers and {len(msgs)} Msgs")
    print(f"\nKeepers:")
    for keeper in keepers:
        print(f"  - {keeper['name']} in {keeper['file_path']}:{keeper['line_number']}")

    print(f"\nMsgs (first 10):")
    for msg in msgs[:10]:
        print(f"  - {msg['name']} in {os.path.basename(msg['file_path'])}:{msg['line_number']}")

    # Save to JSON
    output_file = Path(__file__).parent / 'extracted_entities.json'
    with open(output_file, 'w') as f:
        json.dump(entities, f, indent=2)

    print(f"\n✓ Saved {len(entities)} entities to {output_file}")

    # Print a sample entity
    if entities:
        print("\n=== Sample Entity ===")
        print(json.dumps(entities[0], indent=2))


if __name__ == '__main__':
    main()
