# RLM Design Document: Recursive Language Models for Dynamic Knowledge Exploration

**Version:** 0.1.0 (Design Phase)
**Last Updated:** 2026-01-12
**Status:** Design Document - Implementation Pending
**Issue:** [GitHub Issue #5](https://github.com/gaiaaiagent/regen-koi-mcp/issues/5)

---

## Executive Summary

This document outlines the design for implementing Recursive Language Model (RLM) capabilities in the Regen KOI MCP Server. The RLM paradigm enables LLMs to dynamically explore large knowledge bases through programmatic access, recursive sub-model calls, and emergent decomposition strategies - overcoming context window limitations by 2 orders of magnitude while maintaining quality.

### Problem Statement

The current KOI MCP system struggles with **information-dense queries** that require reasoning across entire datasets:

1. **Vector search** returns semantically similar chunks but misses structural relationships
2. **Code graph queries** find entity relationships but don't understand semantic context
3. **Single-shot queries** are limited by context windows (~200K tokens)

**Example difficult queries:**
- "Correlate forum discussions with governance proposals from the past 3 months"
- "Find all projects that share both methodology type AND geographic region"
- "What topics has the community discussed most, and how have they evolved?"

### Proposed Solution

Implement an RLM layer that:
1. **Loads corpus data as programmable variables** - paginated access to discourse, notion, github, ledger data
2. **Enables recursive sub-LM calls** - spawn cheaper models (Haiku tier) for classification/filtering tasks
3. **Provides sandboxed execution** - Python REPL for complex data manipulation
4. **Maintains provenance** - track which sources contributed to each conclusion

---

## Architecture Overview

```
                                    ┌─────────────────────────────────────┐
                                    │  Claude (Orchestrating LLM)         │
                                    │  - Decomposition planning           │
                                    │  - Result synthesis                 │
                                    └─────────────┬───────────────────────┘
                                                  │ MCP Tools
                                                  ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  RLM Layer (New Tools)                                                          │
│                                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐              │
│  │ load_corpus      │  │ sub_query        │  │ execute_analysis │              │
│  │ - discourse      │  │ - haiku tier     │  │ - sandboxed      │              │
│  │ - notion         │  │ - batched calls  │  │ - Python REPL    │              │
│  │ - github         │  │ - classification │  │ - data filtering │              │
│  │ - ledger         │  │ - extraction     │  │ - aggregation    │              │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘              │
│           │                     │                     │                         │
│           └─────────────────────┼─────────────────────┘                         │
│                                 │                                               │
│  ┌──────────────────────────────▼──────────────────────────────────────────┐   │
│  │  Session State Manager                                                   │   │
│  │  - Loaded corpus segments                                               │   │
│  │  - Sub-query results cache                                              │   │
│  │  - Provenance tracking                                                  │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
                                                  │
                                                  │ API Calls
                                                  ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  Existing KOI Infrastructure                                                    │
│                                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐              │
│  │ /api/koi/query   │  │ /api/koi/graph   │  │ /api/koi/digest  │              │
│  │ (vector search)  │  │ (code entities)  │  │ (aggregations)   │              │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘              │
│                                                                                 │
│  ┌────────────────────────────────────────────────────────────────────────┐    │
│  │  PostgreSQL + Apache AGE (48K+ docs, 26K+ code entities)               │    │
│  └────────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## New MCP Tools

### Phase 1 Tools

#### 1. `rlm_load_corpus`

Load a paginated segment of the knowledge base into the session for analysis.

```typescript
{
  name: 'rlm_load_corpus',
  description: 'Load a corpus segment for RLM analysis. Returns paginated documents with metadata for programmatic exploration.',
  inputSchema: {
    type: 'object',
    properties: {
      source: {
        type: 'string',
        enum: ['discourse', 'notion', 'github', 'ledger', 'all'],
        description: 'Data source to load from'
      },
      filter: {
        type: 'object',
        properties: {
          date_from: { type: 'string', format: 'date' },
          date_to: { type: 'string', format: 'date' },
          category: { type: 'string' },
          search_term: { type: 'string' }
        }
      },
      page: { type: 'number', default: 1 },
      page_size: { type: 'number', default: 50, maximum: 100 },
      fields: {
        type: 'array',
        items: { type: 'string' },
        description: 'Fields to include: title, content, metadata, embeddings'
      }
    },
    required: ['source']
  }
}
```

**Returns:**
```json
{
  "segment_id": "seg_abc123",
  "source": "discourse",
  "total_count": 1847,
  "page": 1,
  "page_size": 50,
  "documents": [
    {
      "id": "doc_123",
      "title": "Governance Proposal Discussion",
      "content": "...",
      "metadata": { "author": "...", "date": "...", "category": "governance" }
    }
  ],
  "provenance": {
    "query_timestamp": "2026-01-12T...",
    "filters_applied": { ... }
  }
}
```

---

#### 2. `rlm_sub_query`

Spawn a recursive sub-LM call for classification, extraction, or filtering tasks.

```typescript
{
  name: 'rlm_sub_query',
  description: 'Execute a sub-query using a cheaper model tier (Haiku) for batch classification or extraction. Supports batching multiple items.',
  inputSchema: {
    type: 'object',
    properties: {
      task_type: {
        type: 'string',
        enum: ['classify', 'extract', 'summarize', 'filter', 'compare'],
        description: 'Type of sub-task to perform'
      },
      prompt_template: {
        type: 'string',
        description: 'Prompt template with {{item}} placeholder for batch processing'
      },
      items: {
        type: 'array',
        items: { type: 'object' },
        description: 'Items to process (max 100 per call)'
      },
      output_schema: {
        type: 'object',
        description: 'Expected JSON schema for structured output'
      },
      model_tier: {
        type: 'string',
        enum: ['haiku', 'sonnet'],
        default: 'haiku',
        description: 'Model tier to use (haiku is cheaper, sonnet for complex tasks)'
      }
    },
    required: ['task_type', 'prompt_template', 'items']
  }
}
```

**Example Usage:**
```json
{
  "task_type": "classify",
  "prompt_template": "Classify this forum post into one of: [governance, technical, community, offtopic]. Post: {{item.content}}",
  "items": [
    { "id": "post_1", "content": "We should vote on the new credit methodology..." },
    { "id": "post_2", "content": "How do I stake my REGEN tokens?" }
  ],
  "output_schema": {
    "type": "object",
    "properties": {
      "id": { "type": "string" },
      "category": { "type": "string" },
      "confidence": { "type": "number" }
    }
  }
}
```

**Returns:**
```json
{
  "results": [
    { "id": "post_1", "category": "governance", "confidence": 0.95 },
    { "id": "post_2", "category": "technical", "confidence": 0.88 }
  ],
  "usage": {
    "input_tokens": 1250,
    "output_tokens": 180,
    "cost_estimate_usd": 0.0004
  },
  "provenance": {
    "model": "claude-3-haiku",
    "batch_size": 2,
    "timestamp": "2026-01-12T..."
  }
}
```

---

#### 3. `rlm_execute_analysis`

Execute sandboxed Python code for complex data manipulation and aggregation.

```typescript
{
  name: 'rlm_execute_analysis',
  description: 'Execute sandboxed Python code for filtering, aggregation, or analysis of loaded corpus segments.',
  inputSchema: {
    type: 'object',
    properties: {
      code: {
        type: 'string',
        description: 'Python code to execute. Has access to: pandas, numpy, collections. Variables: `corpus` (loaded data), `results` (sub-query results)'
      },
      segment_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'IDs of corpus segments to make available'
      },
      timeout_ms: {
        type: 'number',
        default: 30000,
        maximum: 60000
      }
    },
    required: ['code']
  }
}
```

**Example Usage:**
```python
# Find documents that mention both "carbon" and "governance"
import pandas as pd

df = pd.DataFrame(corpus['documents'])
carbon_docs = df[df['content'].str.contains('carbon', case=False)]
gov_docs = df[df['content'].str.contains('governance', case=False)]
overlap = pd.merge(carbon_docs, gov_docs, on='id')

result = {
    'overlap_count': len(overlap),
    'document_ids': overlap['id'].tolist()
}
```

---

### Phase 2 Tools (Future)

#### 4. `rlm_correlate`

Higher-level tool for cross-source correlation queries.

```typescript
{
  name: 'rlm_correlate',
  description: 'Find correlations between entities across different data sources',
  inputSchema: {
    type: 'object',
    properties: {
      source_a: { type: 'string' },
      source_b: { type: 'string' },
      correlation_type: {
        type: 'string',
        enum: ['temporal', 'semantic', 'entity', 'author']
      },
      time_window: { type: 'string' }
    }
  }
}
```

#### 5. `rlm_trend_analysis`

Analyze trends over time across the corpus.

```typescript
{
  name: 'rlm_trend_analysis',
  description: 'Analyze topic or entity trends over time',
  inputSchema: {
    type: 'object',
    properties: {
      topic: { type: 'string' },
      time_range: { type: 'object' },
      granularity: { type: 'string', enum: ['day', 'week', 'month'] }
    }
  }
}
```

---

## Integration with Existing Infrastructure

### API Endpoints Required

The RLM layer will use existing KOI API endpoints with new query parameters:

| Existing Endpoint | RLM Usage |
|-------------------|-----------|
| `POST /api/koi/query` | `rlm_load_corpus` uses with `raw_results=true` for full documents |
| `GET /api/koi/stats` | Get corpus size and source breakdown |
| `POST /api/koi/digest` | Aggregation data for trend analysis |

### New Backend Endpoints (koi-processor)

| New Endpoint | Purpose |
|--------------|---------|
| `POST /api/koi/rlm/corpus` | Paginated corpus access with filtering |
| `POST /api/koi/rlm/batch-classify` | Proxy to Anthropic API for sub-queries |
| `POST /api/koi/rlm/execute` | Sandboxed Python execution |

### Session State Management

RLM tools require session state to:
1. Cache loaded corpus segments
2. Store sub-query results for re-use
3. Track provenance chain

**Implementation Options:**
- **Option A (Recommended):** Server-side session with session ID in MCP context
- **Option B:** File-based local cache (like current auth token storage)
- **Option C:** In-memory only (ephemeral, good for testing)

---

## Cost Model

Based on MIT CSAIL research and current Anthropic pricing:

| Operation | Model | Cost (per 1M tokens) |
|-----------|-------|---------------------|
| Sub-query classification | Claude 3 Haiku | $0.25 input / $1.25 output |
| Complex extraction | Claude 3.5 Sonnet | $3.00 input / $15.00 output |
| Orchestration | Claude Opus 4.5 | Existing MCP usage |

**Estimated cost per complex query:**
- 50-100 items classified via Haiku: ~$0.01-0.05
- Full RLM exploration session: ~$0.10-0.50

---

## Implementation Phases

### Phase 1: Foundation (Current)
- [x] Design document
- [ ] Type definitions (`src/rlm_types.ts`)
- [ ] Tool skeletons (`src/rlm_tools.ts`)
- [ ] Basic `rlm_load_corpus` without backend changes

### Phase 2: Sub-Query Infrastructure
- [ ] Backend endpoint for batch classification
- [ ] Rate limiting and cost tracking
- [ ] `rlm_sub_query` implementation

### Phase 3: Python Execution
- [ ] Sandboxed Python runtime (pyodide or subprocess)
- [ ] Security hardening
- [ ] `rlm_execute_analysis` implementation

### Phase 4: Advanced Features
- [ ] `rlm_correlate` and `rlm_trend_analysis`
- [ ] Session state persistence
- [ ] Provenance visualization

---

## Security Considerations

### Sub-Query Safety
- Rate limits on Anthropic API calls (cost protection)
- Prompt injection detection in templates
- Output validation against expected schema

### Python Execution Safety
- **Sandboxed environment** - no file system access, no network access
- **Resource limits** - CPU time, memory caps
- **Allowed modules only** - whitelist: pandas, numpy, collections, json
- **No exec/eval of dynamic strings**

### Data Access
- Respects existing authentication (OAuth for private Notion data)
- Provenance tracking for audit trail

---

## Research Reference

MIT CSAIL paper: *"Recursive Introspection: Teaching Language Model Agents How to Self-Improve"*

Key findings relevant to this design:
1. RLMs handle inputs **2 orders of magnitude beyond context windows**
2. **58% F1 on quadratic-complexity tasks** vs <0.1% for baseline LLMs
3. Cost-effective via cheaper model tiers for sub-tasks
4. Emergent decomposition strategies outperform hand-crafted approaches

---

## Open Questions

1. **Session persistence**: How long should RLM sessions last? File-based vs server-side?
2. **Cost tracking UI**: How to surface cost estimates to users?
3. **Provenance format**: Standard format for citation chains?
4. **Batch size optimization**: What's the optimal batch size for sub-queries?

---

## Appendix: Example Use Case

**Query:** "What governance topics have been discussed in both the forum and governance proposals in Q4 2025, and which had the most community engagement?"

**RLM Decomposition:**
1. `rlm_load_corpus(source='discourse', filter={date_from='2025-10-01', category='governance'})`
2. `rlm_load_corpus(source='ledger', filter={date_from='2025-10-01', type='proposal'})`
3. `rlm_sub_query(task='extract', items=discourse_posts, prompt='Extract the main governance topic from: {{item}}')`
4. `rlm_sub_query(task='extract', items=proposals, prompt='Extract the main governance topic from: {{item}}')`
5. `rlm_execute_analysis(code='find_topic_overlap(discourse_topics, proposal_topics)')`
6. `rlm_sub_query(task='summarize', items=overlapping_docs, prompt='Summarize engagement metrics')`

**Result:** Structured report with provenance chain back to source documents.
