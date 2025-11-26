"""
Test suite for Entity Linker module.

Tests all matching scenarios including exact matches, case variations,
word boundaries, code blocks, and contextual references.
"""

import pytest
from entity_linker import Entity, Mention, extract_entity_mentions


def test_exact_match():
    """Should find exact entity name matches"""
    entities = [Entity("msg:MsgCreateBatch", "Msg", "MsgCreateBatch", "base", [])]
    doc = "Use MsgCreateBatch to create batches."
    mentions = extract_entity_mentions(doc, entities)

    assert len(mentions) == 1
    assert mentions[0].entity_name == "MsgCreateBatch"
    assert mentions[0].entity_id == "msg:MsgCreateBatch"
    assert mentions[0].confidence == 1.0
    assert mentions[0].start_offset == 4
    assert mentions[0].end_offset == 18


def test_multiple_mentions():
    """Should find all occurrences of same entity"""
    entities = [Entity("msg:MsgCreateBatch", "Msg", "MsgCreateBatch", "base", [])]
    doc = "MsgCreateBatch is important. Send MsgCreateBatch to create."
    mentions = extract_entity_mentions(doc, entities)

    assert len(mentions) == 2
    assert mentions[0].start_offset == 0
    assert mentions[1].start_offset == 34
    assert all(m.entity_name == "MsgCreateBatch" for m in mentions)


def test_no_false_positives():
    """Should not match 'Msg' alone or common words"""
    entities = [Entity("msg:MsgSell", "Msg", "MsgSell", "marketplace", [])]
    doc = "Send a message to sell items."  # "message" and "sell" shouldn't match
    mentions = extract_entity_mentions(doc, entities)

    assert len(mentions) == 0


def test_keeper_reference():
    """Should match 'basket keeper' to basket Keeper entity"""
    entities = [Entity("keeper:basket", "Keeper", "Keeper", "basket", ["basket keeper"])]
    doc = "The basket keeper manages basket state."
    mentions = extract_entity_mentions(doc, entities)

    assert len(mentions) >= 1
    assert mentions[0].entity_id == "keeper:basket"
    assert mentions[0].surface_form in ["basket keeper", "basket Keeper"]
    assert mentions[0].confidence == 0.8  # Contextual match


def test_case_insensitive():
    """Should match with different casing"""
    entities = [Entity("msg:MsgCreateBatch", "Msg", "MsgCreateBatch", "base", [])]
    doc = "Use msgcreatebatch for this."
    mentions = extract_entity_mentions(doc, entities)

    assert len(mentions) == 1
    assert mentions[0].entity_name == "MsgCreateBatch"
    assert mentions[0].surface_form == "msgcreatebatch"
    assert mentions[0].confidence < 1.0  # Lower confidence for case mismatch
    assert mentions[0].confidence == 0.9  # Should be 0.9 for case insensitive


def test_word_boundary():
    """Should not match partial words"""
    entities = [Entity("msg:MsgSell", "Msg", "MsgSell", "marketplace", [])]
    doc = "The MsgSellResponse contains results."  # Different entity
    mentions = extract_entity_mentions(doc, entities)

    assert len(mentions) == 0  # Should not match "MsgSell" in "MsgSellResponse"


def test_code_blocks():
    """Should match entities in markdown code blocks"""
    entities = [Entity("msg:MsgCreateBatch", "Msg", "MsgCreateBatch", "base", [])]
    doc = "Use `MsgCreateBatch` in your code."
    mentions = extract_entity_mentions(doc, entities)

    assert len(mentions) == 1
    assert mentions[0].entity_name == "MsgCreateBatch"
    assert mentions[0].confidence == 1.0


def test_context_extraction():
    """Should extract surrounding context for each mention"""
    entities = [Entity("msg:MsgCreateBatch", "Msg", "MsgCreateBatch", "base", [])]
    doc = "The MsgCreateBatch message is used to create new credit batches."
    mentions = extract_entity_mentions(doc, entities)

    assert len(mentions) == 1
    assert "MsgCreateBatch" in mentions[0].context
    assert "message is used" in mentions[0].context
    assert len(mentions[0].context) > 20  # Should have context


def test_sorted_by_position():
    """Should return mentions sorted by start_offset"""
    entities = [
        Entity("msg:MsgSell", "Msg", "MsgSell", "marketplace", []),
        Entity("msg:MsgBuy", "Msg", "MsgBuy", "marketplace", []),
    ]
    doc = "First MsgBuy then MsgSell and finally MsgBuy again."
    mentions = extract_entity_mentions(doc, entities)

    assert len(mentions) == 3
    # Verify sorted order
    for i in range(len(mentions) - 1):
        assert mentions[i].start_offset < mentions[i + 1].start_offset


def test_min_confidence_filter():
    """Should filter out matches below min_confidence threshold"""
    entities = [Entity("msg:MsgCreateBatch", "Msg", "MsgCreateBatch", "base", [])]
    doc = "Use msgcreatebatch for this."  # Case insensitive match (confidence=0.9)

    # Without filter
    mentions = extract_entity_mentions(doc, entities)
    assert len(mentions) == 1

    # With high confidence filter
    mentions = extract_entity_mentions(doc, entities, config={'min_confidence': 0.95})
    assert len(mentions) == 0  # 0.9 < 0.95, so filtered out


def test_custom_context_chars():
    """Should respect custom context_chars config"""
    entities = [Entity("msg:MsgCreateBatch", "Msg", "MsgCreateBatch", "base", [])]
    # Use spaces to create proper word boundaries
    doc = "A " * 100 + "MsgCreateBatch" + " B" * 100

    # Default context (50 chars each side)
    mentions = extract_entity_mentions(doc, entities)
    assert len(mentions) == 1
    assert len(mentions[0].context) <= 200  # Adjusted for spaces

    # Custom small context
    mentions = extract_entity_mentions(doc, entities, config={'context_chars': 10})
    assert len(mentions) == 1
    assert len(mentions[0].context) <= 50  # ~10 + entity + 10


def test_multiple_entities_in_same_doc():
    """Should find mentions of different entities in same document"""
    entities = [
        Entity("msg:MsgCreateBatch", "Msg", "MsgCreateBatch", "base", []),
        Entity("msg:MsgSell", "Msg", "MsgSell", "marketplace", []),
        Entity("keeper:basket", "Keeper", "Keeper", "basket", ["basket keeper"]),
    ]
    doc = "Use MsgCreateBatch with MsgSell. The basket keeper validates."
    mentions = extract_entity_mentions(doc, entities)

    assert len(mentions) == 3
    entity_names = {m.entity_name for m in mentions}
    assert "MsgCreateBatch" in entity_names
    assert "MsgSell" in entity_names
    assert "Keeper" in entity_names


def test_no_duplicate_matches():
    """Should not return duplicate matches for the same position"""
    # Entity with alias that could match the same text
    entities = [Entity("keeper:basket", "Keeper", "Keeper", "basket", ["basket keeper"])]
    doc = "The basket keeper is important."
    mentions = extract_entity_mentions(doc, entities)

    # Should only match once at position 4
    assert len(mentions) == 1
    assert mentions[0].start_offset == 4


def test_possessive_forms():
    """Should match entities with possessive forms"""
    entities = [Entity("msg:MsgCreateBatch", "Msg", "MsgCreateBatch", "base", [])]
    doc = "MsgCreateBatch's fields are important."
    mentions = extract_entity_mentions(doc, entities)

    # Should match "MsgCreateBatch" before the apostrophe
    assert len(mentions) == 1
    assert mentions[0].surface_form == "MsgCreateBatch"


def test_empty_document():
    """Should handle empty documents gracefully"""
    entities = [Entity("msg:MsgSell", "Msg", "MsgSell", "marketplace", [])]
    doc = ""
    mentions = extract_entity_mentions(doc, entities)

    assert len(mentions) == 0


def test_empty_entity_list():
    """Should handle empty entity lists gracefully"""
    entities = []
    doc = "Some text with MsgCreateBatch"
    mentions = extract_entity_mentions(doc, entities)

    assert len(mentions) == 0


def test_short_entity_names_avoided():
    """Should avoid matching very short entity names to prevent false positives"""
    # This tests the len(entity.name) > 3 safeguard
    entities = [Entity("msg:Msg", "Msg", "Msg", "base", [])]
    doc = "Send a message to the system."
    mentions = extract_entity_mentions(doc, entities)

    # "Msg" alone shouldn't match because it's too short (<=3 chars)
    assert len(mentions) == 0


def test_mixed_case_variations():
    """Should handle various case variations"""
    entities = [Entity("msg:MsgCreateBatch", "Msg", "MsgCreateBatch", "base", [])]
    doc = "MsgCreateBatch, msgcreatebatch, MSGCREATEBATCH, MsgCreateBatch"
    mentions = extract_entity_mentions(doc, entities)

    assert len(mentions) == 4
    # First exact match should have confidence 1.0
    assert mentions[0].confidence == 1.0
    # Other case variations should have confidence 0.9
    assert mentions[1].confidence == 0.9
    assert mentions[2].confidence == 0.9


def test_real_readme_sample():
    """Should correctly parse the sample README content"""
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

    entities = [
        Entity("msg:MsgCreateClass", "Msg", "MsgCreateClass", "base", []),
        Entity("msg:MsgCreateBatch", "Msg", "MsgCreateBatch", "base", []),
        Entity("msg:MsgSell", "Msg", "MsgSell", "marketplace", []),
        Entity("msg:MsgBuyDirect", "Msg", "MsgBuyDirect", "marketplace", []),
        Entity("keeper:basket", "Keeper", "Keeper", "basket", ["basket keeper"]),
        Entity("keeper:base", "Keeper", "Keeper", "base", ["base keeper"]),
        Entity("keeper:marketplace", "Keeper", "Keeper", "marketplace", ["marketplace keeper"]),
    ]

    mentions = extract_entity_mentions(sample_doc, entities)

    # Should find:
    # - MsgCreateClass (1)
    # - MsgCreateBatch (1)
    # - basket keeper (1)
    # - base keeper (1)
    # - marketplace keeper (1)
    # - MsgSell (1)
    # - MsgBuyDirect (1)

    assert len(mentions) >= 7

    entity_ids = {m.entity_id for m in mentions}
    assert "msg:MsgCreateClass" in entity_ids
    assert "msg:MsgCreateBatch" in entity_ids
    assert "msg:MsgSell" in entity_ids
    assert "msg:MsgBuyDirect" in entity_ids
    assert "keeper:basket" in entity_ids
    assert "keeper:base" in entity_ids
    assert "keeper:marketplace" in entity_ids


def test_entity_in_different_contexts():
    """Should find entity in multiple different contexts"""
    entities = [Entity("msg:MsgSell", "Msg", "MsgSell", "marketplace", [])]
    doc = """
    Call MsgSell to sell credits.
    The `MsgSell` handler processes sales.
    When you invoke MsgSell, it transfers credits.
    """
    mentions = extract_entity_mentions(doc, entities)

    assert len(mentions) == 3
    # All should be high confidence
    assert all(m.confidence >= 0.9 for m in mentions)


def test_aliases():
    """Should match entity aliases"""
    entities = [Entity("keeper:basket", "Keeper", "Keeper", "basket", ["BasketKeeper", "basket manager"])]
    doc = "The BasketKeeper and basket manager handle baskets."
    mentions = extract_entity_mentions(doc, entities)

    # Should find 2 alias matches
    assert len(mentions) == 2
    assert all(m.entity_id == "keeper:basket" for m in mentions)
    assert all(m.confidence == 0.8 for m in mentions)  # Alias matches


if __name__ == "__main__":
    # Run tests with pytest
    pytest.main([__file__, "-v"])
