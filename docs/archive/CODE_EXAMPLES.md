# Code Examples & Implementation Details

*Extracted from TECHNICAL_ASSISTANT_PROJECT.md to keep the main document high-level.*

---

## Table of Contents

1. [Evaluation & Gold Set](#evaluation--gold-set)
2. [Unified Sensor Pipeline](#unified-sensor-pipeline)
3. [Linker Library](#linker-library)
4. [Graph Access Layer](#graph-access-layer)
5. [Graph Schema](#graph-schema)
6. [Tool Response Shape](#tool-response-shape)
7. [Access Control](#access-control)
8. [API Examples](#api-examples)
9. [Architecture Diagrams](#architecture-diagrams)

---

## Evaluation & Gold Set

### Gold Set Structure

Location: `evals/gold_set.json`

```json
{
  "queries": [
    {
      "id": "onboarding-001",
      "journey": "onboarding",
      "query": "How does the ecocredit module handle credit retirement?",
      "expected_rids": [
        "regen.github:regen-ledger/x/ecocredit/README.md",
        "regen.github:regen-ledger/x/ecocredit/spec/03_messages.md"
      ],
      "expected_entities": ["MsgRetire", "Keeper.Retire"],
      "notes": "Should return both docs and code entities"
    },
    {
      "id": "impact-001",
      "journey": "impact",
      "query": "What emits EventRetire?",
      "expected_entities": ["Keeper.Retire", "EventRetire"],
      "expected_edges": ["EMITS"]
    }
  ]
}
```

---

## Unified Sensor Pipeline

### Two-Pass Processing

```python
def process_repository(repo):
    # Pass 1: Structure (The Skeleton)
    code_files = repo.glob("*.go", "*.proto")
    graph_nodes = tree_sitter_extractor.extract(code_files)
    save_to_age(graph_nodes)

    # Pass 2: Context (The Flesh)
    doc_files = repo.glob("*.md")
    for doc in doc_files:
        chunks = chunk_text(doc)  # Reuse Phase 1 logic!
        links = find_links_to_nodes(chunks, graph_nodes)
        save_doc_with_links(chunks, links)
```

---

## Linker Library

### Interface

```python
def extract_entity_mentions(
    doc_text: str,
    entity_list: List[Entity]
) -> List[Mention]:
    """
    Scan document text for references to known code entities.

    Args:
        doc_text: The markdown/text content to scan
        entity_list: Known entities from the graph (Keepers, Msgs, etc.)

    Returns:
        List of mentions with entity reference and location
    """
    pass
```

### Output Shape

```python
@dataclass
class Mention:
    entity_id: str          # Graph node ID
    entity_name: str        # e.g., "MsgCreateBatch"
    entity_type: str        # "Keeper" | "Msg" | "Event"
    surface_form: str       # Exact text matched (may differ from name)
    start_offset: int       # Character position in doc
    end_offset: int
    confidence: float       # 0.0-1.0, for fuzzy matches
    context: str            # Surrounding text snippet
```

---

## Graph Access Layer

### GraphClient Interface

```typescript
interface GraphClient {
  // Entity queries
  getKeeperForMsg(msgName: string): Promise<Keeper | null>;
  getMsgsHandledBy(keeperName: string): Promise<Msg[]>;

  // Relationship queries
  getUpstreamDeps(entityId: string): Promise<Entity[]>;
  getDownstreamDeps(entityId: string): Promise<Entity[]>;
  getEmittersOfEvent(eventName: string): Promise<Keeper[]>;

  // Documentation links
  getDocsMentioningEntity(entityId: string): Promise<Document[]>;
  getEntitiesMentionedInDoc(docId: string): Promise<Entity[]>;

  // Combined queries (graph + vector)
  hybridSearch(query: string, opts: SearchOpts): Promise<SearchResult[]>;
}
```

### AGE Implementation

```typescript
class AgeGraphClient implements GraphClient {
  async getKeeperForMsg(msgName: string): Promise<Keeper | null> {
    const result = await this.db.query(`
      SELECT * FROM ag_catalog.cypher('regen_graph', $$
        MATCH (k:Keeper)-[:HANDLES]->(m:Msg {name: $1})
        RETURN k
      $$, $2) as (keeper agtype)
    `, [msgName]);
    return result.rows[0]?.keeper ?? null;
  }
}

// Future: Could swap to relational/CTE if AGE doesn't scale
class RelationalGraphClient implements GraphClient {
  // Same interface, different implementation
}
```

### Hybrid Query Example (Graph + Vector)

```sql
-- "Find the Keeper that handles 'batch creation' (Vector) and show me what Events it emits (Graph)"
SELECT
    k.name,
    e.name AS event_emitted
FROM ag_catalog.cypher('regen_graph', $$
    MATCH (k:Keeper)-[:HANDLES]->(m:Msg)
    MATCH (k)-[:EMITS]->(e:Event)
    RETURN k, m, e
$$) as (k agtype, m agtype, e agtype)
WHERE
    -- Vector Search on the Docstring Property of the Keeper Node
    cosine_distance(k.docstring_embedding, $user_query_vector) < 0.2
```

---

## Graph Schema

```yaml
# Node Types (with embedded vectors)
Keeper:
  name: string
  file_path: string
  line_number: int
  signature: string
  docstring: string
  docstring_embedding: vector(1024)  # OpenAI embedding

Msg:
  name: string                        # e.g., "MsgCreateBatch"
  package: string
  fields: [string]
  docstring_embedding: vector(1024)

Event:
  name: string
  emitted_by: string

Document:
  title: string
  file_path: string
  content: string
  content_embedding: vector(1024)

# Edge Types
HANDLES: Keeper → Msg              # Keeper handles this message type
EMITS: Keeper → Event              # Keeper emits this event
IMPLEMENTS: Struct → Interface     # Type implementation
MENTIONS: Document → (Msg|Keeper)  # Documentation references code (THE BRIDGE)
DEFINES: File → (Keeper|Msg)       # File contains definition
```

---

## Tool Response Shape

### Response Structure

```typescript
interface ToolResponse {
  content: [
    { type: 'text', text: string },      // Markdown for humans
    { type: 'json', data: ResponseData } // Structured for eval harness
  ]
}

interface ResponseData {
  hits: Hit[];
  metadata: {
    query: string;
    tool: string;
    duration_ms: number;
    total_results: number;
  }
}

interface Hit {
  rid: string;              // Resource ID
  score: number;            // Relevance score (0-1)
  repo: string;             // Repository name
  file: string;             // File path
  line?: number;            // Line number (if applicable)
  entity_type?: string;     // "Keeper" | "Msg" | "Document" | etc.
  entity_name?: string;     // Entity name (if applicable)
  content_preview: string;  // Snippet of content
  edges?: Edge[];           // Related graph edges (if applicable)
}
```

### Shared Helpers

```typescript
// Query execution
async function runKoiQuery(opts: QueryOpts): Promise<QueryResult> {
  // Standard HTTP integration with Bun API
  // Standard error handling (timeout, rate limit, etc.)
  // Standard logging
}

// Result formatting
function formatSearchResults(hits: Hit[]): string {
  // Consistent markdown formatting
}

function formatEntityDetails(entity: Entity): string {
  // Consistent entity display
}

function formatGraphPath(path: Edge[]): string {
  // Consistent relationship display
}
```

---

## Access Control

### Centralized Access Check

```typescript
// Centralized access check
function canUseTool(toolName: string, accessTier: AccessTier): boolean {
  const toolConfig = TOOL_REGISTRY[toolName];
  if (!toolConfig) return false;
  return toolConfig.allowedTiers.includes(accessTier);
}

// Tool registration with tier requirements
const TOOL_REGISTRY: Record<string, ToolConfig> = {
  'search_github_docs': {
    allowedTiers: ['public', 'partner', 'developer'],
    handler: searchGithubDocs,
  },
  'get_architecture_overview': {
    allowedTiers: ['partner', 'developer'],
    handler: getArchitectureOverview,
  },
  'analyze_dependencies': {
    allowedTiers: ['developer'],
    handler: analyzeDependencies,
  },
};

// Dispatch with access check
async function dispatchTool(toolName: string, args: any): Promise<ToolResponse> {
  const accessTier = process.env.ACCESS_TIER || 'public';

  if (!canUseTool(toolName, accessTier)) {
    return {
      content: [{ type: 'text', text: `Tool '${toolName}' not available at ${accessTier} tier` }]
    };
  }

  return TOOL_REGISTRY[toolName].handler(args);
}
```

### Future Token-Based Auth

```typescript
// Future: Replace accessTier with token-based identity
async function canUseTool(toolName: string, token: string): Promise<boolean> {
  const user = await verifyToken(token);  // OAuth/SSO
  const userTier = await getUserTier(user.id);  // From database
  return TOOL_REGISTRY[toolName].allowedTiers.includes(userTier);
}
```

---

## API Examples

### Query API

```bash
curl -X POST https://regen.gaiaai.xyz/api/koi/query \
  -H "Content-Type: application/json" \
  -d '{"question": "ecocredit module", "limit": 10}'
```

### Tool Implementation Pattern

```typescript
async function searchGithubDocs(args: SearchArgs): Promise<ToolResponse> {
  const { query, repo, limit = 10 } = args;

  // 1. Execute query
  const result = await runKoiQuery({
    query,
    filters: repo ? { repo } : undefined,
    limit,
  });

  // 2. Format response
  const hits = result.memories.map(formatHit);
  const markdown = formatSearchResults(hits);

  // 3. Return standardized response
  return {
    content: [
      { type: 'text', text: markdown },
      { type: 'json', data: { hits, metadata: result.metadata } }
    ]
  };
}
```

---

## Architecture Diagrams

### Current vs Phase 2 Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CURRENT ARCHITECTURE (Phase 1)                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  GitHub Sensor ──► Text Chunking ──► OpenAI Embeddings ──► PostgreSQL      │
│  (docs + code)     (character)       (text-embedding-3-large)   (pgvector) │
│                                                                             │
│                                      ▼                                      │
│                              Hybrid Search                                  │
│                         (Vector + PostgreSQL FTS)                           │
│                                      ▼                                      │
│                              MCP Tools                                      │
│                      (search_github_docs, etc.)                             │
└─────────────────────────────────────────────────────────────────────────────┘

                                    ▼▼▼

┌─────────────────────────────────────────────────────────────────────────────┐
│                      PHASE 2 ARCHITECTURE (Hybrid)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  GitHub Sensor ──► Tree-sitter ──► OpenAI Embeddings ──► PostgreSQL        │
│  (docs + code)     AST Parser      (attached to nodes)     + AGE Graph     │
│       │                │                                                    │
│       │                └──► Code Knowledge Graph (Apache AGE)               │
│       │                     - Keepers, Msgs, Events, Interfaces            │
│       │                     - HANDLES, EMITS, IMPLEMENTS edges             │
│       │                     - Embeddings stored ON nodes                    │
│       │                                                                     │
│       └──► Document Nodes                                                   │
│            - README, docs, markdown files                                   │
│            - MENTIONS edges → Code Nodes (The Bridge)                      │
│                                                                             │
│                              ▼                                              │
│                    Unified PostgreSQL Query                                 │
│              (Graph + Vector + FTS in single query)                         │
│                              ▼                                              │
│                        MCP Tools                                            │
│      (search_code, get_call_graph, get_symbol_definition, etc.)            │
└─────────────────────────────────────────────────────────────────────────────┘
```

### The Bridge: Documentation ↔ Code

```
┌─────────────────┐                      ┌─────────────────┐
│   :Document     │                      │      :Msg       │
│   README.md     │──[:MENTIONS]────────►│ MsgCreateBatch  │
│                 │                      │                 │
│ "The batch     │                      │ keeper.go:142   │
│  creation..."   │                      │                 │
└─────────────────┘                      └─────────────────┘
```

### Smart Sensor Pipeline

#### A. Code Processing (*.go, *.proto)

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Parse      │     │  Extract    │     │  Embed      │     │  Ingest     │
│  Structure  │────►│  Semantics  │────►│  Docstrings │────►│  Graph      │
│ (Tree-sitter)│     │ (Docstrings)│     │  (OpenAI)   │     │  Nodes      │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
       │
       └──► Entities: Keepers, Msgs, Interfaces
             Properties: name, line #, signature
             + Semantic: embedding vector from docstring
```

#### B. Text Processing (*.md, docs)

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Chunk &    │     │  Scan for   │     │  Create     │
│  Embed      │────►│  Entity     │────►│  MENTIONS   │
│  (Phase 1)  │     │  Names      │     │  Edges      │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │
       └──► :Document      └──► (:Document)-[:MENTIONS]->(:Msg)
            nodes                Links manual to machine
```

### System Architecture (Phase 1 - Validated)

```
┌─────────────────────────────────────────┐
│  TypeScript MCP Tools (3 tools)         │
│  - search_github_docs                   │
│  - get_repo_overview                    │
│  - get_tech_stack                       │
└──────────────┬──────────────────────────┘
               │ HTTP POST /query
               ▼
┌─────────────────────────────────────────┐
│  Bun Hybrid RAG Server (port 8301)      │
│  - RRF (Reciprocal Rank Fusion)         │
│  - Keyword search (PostgreSQL FTS)      │
│  - Vector search (HNSW index)           │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  BGE Embedding Server (port 8090)       │
│  - OpenAI text-embedding-3-large        │
│  - 1024-dim vectors                     │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  PostgreSQL Database (port 5432)        │
│  - koi_memories (3,000+ docs)           │
│  - koi_embeddings (1024-dim)            │
│  - HNSW index for fast similarity       │
└─────────────────────────────────────────┘
```
