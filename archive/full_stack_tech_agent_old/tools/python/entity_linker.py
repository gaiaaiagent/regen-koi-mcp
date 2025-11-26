"""
Entity Linker - Scans documentation text for references to code entities.

This module provides functionality to find mentions of code entities (Keepers, Msgs)
in documentation text and return structured mention objects with context and confidence.
"""

import re
from dataclasses import dataclass
from typing import List, Optional, Tuple


@dataclass
class Entity:
    """An entity from the graph (Keeper or Msg)"""
    entity_id: str          # Unique ID (e.g., "keeper:basket" or "msg:MsgCreateBatch")
    entity_type: str        # "Keeper" or "Msg"
    name: str               # e.g., "MsgCreateBatch", "Keeper"
    module: str             # e.g., "basket", "base", "marketplace"
    aliases: List[str]      # Alternative names to match (optional)


@dataclass
class Mention:
    """A mention of an entity found in document text"""
    entity_id: str          # Which entity was mentioned
    entity_name: str        # Name of the entity
    entity_type: str        # "Keeper" or "Msg"
    surface_form: str       # Exact text that matched (may differ from name)
    start_offset: int       # Character position in doc (start)
    end_offset: int         # Character position in doc (end)
    confidence: float       # 0.0-1.0 confidence score
    context: str            # Surrounding text snippet (~50 chars each side)


def _calculate_confidence(entity_name: str, matched_text: str, in_code_block: bool) -> float:
    """
    Calculate confidence score for a match.

    Args:
        entity_name: The canonical entity name
        matched_text: The actual text that was matched
        in_code_block: Whether the match was in a code block (backticks)

    Returns:
        Confidence score between 0.0 and 1.0
    """
    # Exact match in code block or regular text
    if matched_text == entity_name:
        return 1.0

    # Case-insensitive exact match
    if matched_text.lower() == entity_name.lower():
        if in_code_block:
            return 1.0  # Code blocks are authoritative
        return 0.9

    # Partial match (e.g., "CreateBatch" for "MsgCreateBatch")
    if entity_name.lower().endswith(matched_text.lower()) or \
       entity_name.lower().startswith(matched_text.lower()):
        return 0.7

    # Alias or contextual match (e.g., "basket keeper")
    return 0.8


def _extract_context(doc_text: str, start: int, end: int, context_chars: int = 50) -> str:
    """
    Extract surrounding context for a mention.

    Args:
        doc_text: Full document text
        start: Start position of mention
        end: End position of mention
        context_chars: Number of characters to include on each side

    Returns:
        Context string with the mention and surrounding text
    """
    context_start = max(0, start - context_chars)
    context_end = min(len(doc_text), end + context_chars)

    context = doc_text[context_start:context_end]

    # Clean up newlines and extra whitespace for readability
    context = ' '.join(context.split())

    return context


def _is_in_code_block(doc_text: str, position: int) -> bool:
    """
    Check if a position in the text is within markdown code formatting.

    Args:
        doc_text: Full document text
        position: Position to check

    Returns:
        True if position is within backticks
    """
    # Look backwards and forwards for backticks
    before = doc_text[:position]
    after = doc_text[position:]

    # Count backticks before this position
    backtick_count = before.count('`')

    # If odd number of backticks before, we're inside a code block
    # Check if there's a closing backtick after
    if backtick_count % 2 == 1 and '`' in after:
        return True

    return False


def _find_entity_patterns(entity: Entity) -> List[Tuple[str, float]]:
    """
    Generate regex patterns for an entity with confidence weights.

    Args:
        entity: The entity to create patterns for

    Returns:
        List of (pattern, base_confidence) tuples
    """
    patterns = []

    # Main entity name - exact match with word boundaries
    if len(entity.name) > 3:  # Avoid matching very short names
        patterns.append((
            r'\b' + re.escape(entity.name) + r'\b',
            1.0
        ))

    # Case-insensitive variant
    if len(entity.name) > 3:
        patterns.append((
            r'\b' + re.escape(entity.name) + r'\b',
            0.9
        ))

    # For Keeper entities, match "{module} keeper" pattern
    if entity.entity_type == "Keeper" and entity.module:
        patterns.append((
            r'\b' + re.escape(entity.module) + r'\s+[Kk]eeper\b',
            0.8
        ))

    # Add alias patterns
    for alias in entity.aliases:
        if len(alias) > 3:
            patterns.append((
                r'\b' + re.escape(alias) + r'\b',
                0.8
            ))

    return patterns


def extract_entity_mentions(
    doc_text: str,
    entity_list: List[Entity],
    config: Optional[dict] = None
) -> List[Mention]:
    """
    Scan document text for references to known code entities.

    Args:
        doc_text: The markdown/text content to scan
        entity_list: Known entities from the graph
        config: Optional settings (min_confidence, context_chars, etc.)

    Returns:
        List of mentions found, sorted by start_offset
    """
    if config is None:
        config = {}

    min_confidence = config.get('min_confidence', 0.0)
    context_chars = config.get('context_chars', 50)

    mentions = []

    # Track matched ranges to avoid overlapping duplicates
    matched_ranges = []

    def overlaps_existing(start, end):
        """Check if a range overlaps with any existing matches"""
        for existing_start, existing_end in matched_ranges:
            # Check for any overlap
            if not (end <= existing_start or start >= existing_end):
                return True
        return False

    # PHASE 1: Match specific patterns (module patterns and aliases) for all entities
    for entity in entity_list:
        # For Keeper entities, match "{module} keeper" pattern FIRST (more specific)
        if entity.entity_type == "Keeper" and entity.module:
            pattern = r'\b' + re.escape(entity.module) + r'\s+[Kk]eeper\b'
            for match in re.finditer(pattern, doc_text):
                start = match.start()
                end = match.end()

                # Skip if this overlaps with an existing match
                if overlaps_existing(start, end):
                    continue

                matched_text = match.group()
                in_code = _is_in_code_block(doc_text, start)

                confidence = 0.8  # Contextual match

                if confidence >= min_confidence:
                    mention = Mention(
                        entity_id=entity.entity_id,
                        entity_name=entity.name,
                        entity_type=entity.entity_type,
                        surface_form=matched_text,
                        start_offset=start,
                        end_offset=end,
                        confidence=confidence,
                        context=_extract_context(doc_text, start, end, context_chars)
                    )
                    mentions.append(mention)
                    matched_ranges.append((start, end))

        # Match aliases (also specific, so do in this phase)
        for alias in entity.aliases:
            if len(alias) > 3:
                pattern = r'\b' + re.escape(alias) + r'\b'
                for match in re.finditer(pattern, doc_text, re.IGNORECASE):
                    start = match.start()
                    end = match.end()

                    # Skip if this overlaps with an existing match
                    if overlaps_existing(start, end):
                        continue

                    matched_text = match.group()
                    in_code = _is_in_code_block(doc_text, start)

                    confidence = 0.8  # Alias match

                    if confidence >= min_confidence:
                        mention = Mention(
                            entity_id=entity.entity_id,
                            entity_name=entity.name,
                            entity_type=entity.entity_type,
                            surface_form=matched_text,
                            start_offset=start,
                            end_offset=end,
                            confidence=confidence,
                            context=_extract_context(doc_text, start, end, context_chars)
                        )
                        mentions.append(mention)
                        matched_ranges.append((start, end))

    # PHASE 2: Match exact entity names (generic but high confidence)
    for entity in entity_list:
        if len(entity.name) > 3:  # Avoid very short names
            pattern = r'\b' + re.escape(entity.name) + r'\b'
            for match in re.finditer(pattern, doc_text):
                start = match.start()
                end = match.end()

                # Skip if this overlaps with an existing match
                if overlaps_existing(start, end):
                    continue

                matched_text = match.group()
                in_code = _is_in_code_block(doc_text, start)

                confidence = _calculate_confidence(entity.name, matched_text, in_code)

                if confidence >= min_confidence:
                    mention = Mention(
                        entity_id=entity.entity_id,
                        entity_name=entity.name,
                        entity_type=entity.entity_type,
                        surface_form=matched_text,
                        start_offset=start,
                        end_offset=end,
                        confidence=confidence,
                        context=_extract_context(doc_text, start, end, context_chars)
                    )
                    mentions.append(mention)
                    matched_ranges.append((start, end))

    # PHASE 3: Match case-insensitive entity names (lowest priority)
    for entity in entity_list:
        if len(entity.name) > 3:
            pattern = r'\b' + re.escape(entity.name) + r'\b'
            for match in re.finditer(pattern, doc_text, re.IGNORECASE):
                start = match.start()
                end = match.end()

                # Skip if this overlaps with an existing match
                if overlaps_existing(start, end):
                    continue

                matched_text = match.group()

                # Skip if this is actually an exact match (already handled above)
                if matched_text == entity.name:
                    continue

                in_code = _is_in_code_block(doc_text, start)
                confidence = _calculate_confidence(entity.name, matched_text, in_code)

                if confidence >= min_confidence:
                    mention = Mention(
                        entity_id=entity.entity_id,
                        entity_name=entity.name,
                        entity_type=entity.entity_type,
                        surface_form=matched_text,
                        start_offset=start,
                        end_offset=end,
                        confidence=confidence,
                        context=_extract_context(doc_text, start, end, context_chars)
                    )
                    mentions.append(mention)
                    matched_ranges.append((start, end))

    # Sort by start position
    mentions.sort(key=lambda m: m.start_offset)

    return mentions


def load_entities_from_graph(conn) -> List[Entity]:
    """
    Load all entities from regen_graph for matching.

    Args:
        conn: psycopg2 connection with AGE extension loaded

    Returns:
        List of Entity objects ready for matching
    """
    import age

    entities = []

    with conn.cursor() as cursor:
        # Set search path
        cursor.execute("SET search_path = ag_catalog, public;")

        # Load Keepers
        keeper_query = """
        SELECT * FROM cypher('regen_graph', $$
            MATCH (k:Keeper)
            RETURN k.entity_id, k.entity_type, k.name, k.module
        $$) as (entity_id agtype, entity_type agtype, name agtype, module agtype);
        """

        cursor.execute(keeper_query)
        for row in cursor.fetchall():
            entity_id = age.loads(row[0])
            entity_type = age.loads(row[1])
            name = age.loads(row[2])
            module = age.loads(row[3])

            # Create aliases for Keeper entities
            aliases = [f"{module} keeper", f"{module} Keeper"]

            entities.append(Entity(
                entity_id=entity_id,
                entity_type=entity_type,
                name=name,
                module=module,
                aliases=aliases
            ))

        # Load Msgs
        msg_query = """
        SELECT * FROM cypher('regen_graph', $$
            MATCH (m:Msg)
            RETURN m.entity_id, m.entity_type, m.name, m.module
        $$) as (entity_id agtype, entity_type agtype, name agtype, module agtype);
        """

        cursor.execute(msg_query)
        for row in cursor.fetchall():
            entity_id = age.loads(row[0])
            entity_type = age.loads(row[1])
            name = age.loads(row[2])
            module = age.loads(row[3])

            # Msg entities don't need aliases by default
            aliases = []

            entities.append(Entity(
                entity_id=entity_id,
                entity_type=entity_type,
                name=name,
                module=module,
                aliases=aliases
            ))

    return entities


if __name__ == "__main__":
    # Quick test
    sample_doc = """
    # Ecocredit Module

    The ecocredit module handles carbon credit creation and trading.

    ## Messages

    ### MsgCreateClass
    Creates a new credit class. Only approved issuers can call this.

    ### MsgCreateBatch
    Creates a new batch of credits within a class. The basket keeper
    validates the batch before creation.

    ## Keepers

    The base keeper (`x/ecocredit/base/keeper`) manages core credit state.
    The marketplace keeper handles buy/sell operations via MsgSell and
    MsgBuyDirect.
    """

    test_entities = [
        Entity("msg:MsgCreateClass", "Msg", "MsgCreateClass", "base", []),
        Entity("msg:MsgCreateBatch", "Msg", "MsgCreateBatch", "base", []),
        Entity("msg:MsgSell", "Msg", "MsgSell", "marketplace", []),
        Entity("msg:MsgBuyDirect", "Msg", "MsgBuyDirect", "marketplace", []),
        Entity("keeper:basket", "Keeper", "Keeper", "basket", ["basket keeper"]),
        Entity("keeper:base", "Keeper", "Keeper", "base", ["base keeper"]),
        Entity("keeper:marketplace", "Keeper", "Keeper", "marketplace", ["marketplace keeper"]),
    ]

    mentions = extract_entity_mentions(sample_doc, test_entities)

    print(f"Found {len(mentions)} mentions:\n")
    for m in mentions:
        print(f"  {m.entity_name} ({m.entity_type})")
        print(f"    Surface: '{m.surface_form}'")
        print(f"    Position: {m.start_offset}-{m.end_offset}")
        print(f"    Confidence: {m.confidence:.2f}")
        print(f"    Context: ...{m.context}...")
        print()
