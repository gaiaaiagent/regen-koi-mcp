# KOI MCP Server - API Reference

**Version:** 1.6.0
**Last Updated:** 2026-02-03

Complete reference for all MCP tools provided by the Regen KOI server.

---

## Table of Contents

1. [query_code_graph](#query_code_graph)
2. [search_knowledge](#search_knowledge)
3. [hybrid_search](#hybrid_search)
4. [search_github_docs](#search_github_docs)
5. [get_repo_overview](#get_repo_overview)
6. [get_tech_stack](#get_tech_stack)
7. [get_stats](#get_stats)
8. [generate_weekly_digest](#generate_weekly_digest)
9. [get_mcp_metrics](#get_mcp_metrics)
10. [submit_feedback](#submit_feedback)
11. [get_full_document](#get_full_document)

---

## query_code_graph

Search the code knowledge graph with supported query types for exploring entities, relationships, modules, concepts, and call graphs.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query_type` | enum | **Yes** | Type of graph query to execute (see below) |
| `entity_name` | string | Conditional | Name of entity to search for |
| `entity_type` | string | Conditional | Type of entity (Function, Struct, Interface, etc.) |
| `doc_path` | string | No | Reserved (doc→entity queries not currently supported via `/graph`) |
| `repo_name` | string | No | Filter by repository name |
| `module_name` | string | Conditional | Name of module/package |

### Query Types

| query_type | Description | Required Params | Example |
|------------|-------------|-----------------|---------|
| `list_repos` | List all indexed repositories | None | What repos are indexed? |
| `find_by_type` | Find all entities of a specific type | `entity_type` | Find all Handlers |
| `search_entities` | Search for entities by name | `entity_name` | Find "CreateBatch" |
| `keeper_for_msg` | Find keeper that handles a message | `entity_name` | What keeper handles MsgRetire? |
| `msgs_for_keeper` | Find messages handled by keeper | `entity_name` | What messages does Keeper handle? |
| `related_entities` | Find related entities | `entity_name` | What's related to Keeper? |
| `list_entity_types` | List all entity types with counts | None | What entity types exist? |
| `get_entity_stats` | Get comprehensive statistics | None | Show me the stats |
| `list_concepts` | List available high-level concepts (if populated) | None | What concepts exist? |
| `explain_concept` | Explain a concept (if populated) | `entity_name` | Explain "Credit Retirement" |
| `find_concept_for_query` | Find relevant concepts for a query (if populated) | `entity_name` | Find concepts for "credits" |
| `find_callers` | Find all functions that call this entity | `entity_name` | What calls CreateBatch? |
| `find_callees` | Find all functions called by this entity | `entity_name` | What does CreateBatch call? |
| `find_call_graph` | Get local call graph (callers + callees) | `entity_name` | Show call graph for CreateBatch |
| `list_modules` | List all modules in a repo | `repo_name` (optional) | What modules in regen-ledger? |
| `get_module` | Get details for a specific module | `module_name` | Tell me about x/ecocredit |
| `search_modules` | Search modules by keyword | `entity_name` | Find modules about credits |
| `module_entities` | Get entities in a module | `module_name` | What's in x/ecocredit? |
| `module_for_entity` | Find module containing entity | `entity_name` | What module has CreateBatch? |

### Return Format

**Success:**
```json
{
  "content": [{
    "type": "text",
    "text": "Found 5 results:\n\n1. CreateBatch (Handler)\n   File: x/ecocredit/base/keeper/msg_create_batch.go:22\n   Signature: func (k Keeper) CreateBatch(...)\n   ..."
  }]
}
```

**Error:**
```json
{
  "content": [{
    "type": "text",
    "text": "Validation Error: entity_name is required for query_type 'keeper_for_msg'"
  }]
}
```

### Examples

#### Example 1: Find all handlers

```json
{
  "query_type": "find_by_type",
  "entity_type": "Handler"
}
```

**Returns:** All handler functions with domain_type="handler"

#### Example 2: Find callers of CreateBatch

```json
{
  "query_type": "find_callers",
  "entity_name": "CreateBatch"
}
```

**Returns:** All functions that call CreateBatch, with call sites

#### Example 3: List repositories

```json
{
  "query_type": "list_repos"
}
```

**Returns:** All indexed repositories with entity counts

### Validation Rules

- `entity_name`: 1-200 characters, alphanumeric + underscore/hyphen/dot/space only
- `entity_type`: 1-100 characters, alphanumeric + underscore only
- `module_name`: 1-200 characters
- SQL/Cypher injection patterns are detected and blocked

### Error Codes

| Error | Meaning | Solution |
|-------|---------|----------|
| "Validation failed" | Invalid parameters | Check parameter format |
| "Required parameter missing" | Missing required param for query type | Add required param |
| "Circuit breaker is open" | Backend service down | Wait 60s and retry |
| "Timeout" | Query took >30s | Narrow your query |

---

## search_knowledge

Semantic search across 59,000+ document embeddings using vector similarity with source filtering and date sorting.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | **Yes** | - | Search query (natural language) |
| `intent` | enum | No | `general` | Query intent for optimized retrieval. See Intent Types below. |
| `source` | string | No | - | Filter by data source (e.g., `notion`, `github`, `discourse`). Supports prefix matching: `discourse` matches `discourse:forum.regen.network`. Use `get_stats` to see available sources. |
| `sort_by` | enum | No | `relevance` | Sort order: `relevance` (default), `date_desc` (newest first), `date_asc` (oldest first) |
| `limit` | number | No | 10 | Max results to return (1-50) |
| `published_from` | string | No | - | Filter: published after date (YYYY-MM-DD) |
| `published_to` | string | No | - | Filter: published before date (YYYY-MM-DD) |
| `include_undated` | boolean | No | false | Include docs with no publication date |

### Intent Types

The `intent` parameter enables intent-aware retrieval for better results on specific query types:

| Intent | Use When | Effect |
|--------|----------|--------|
| `general` | Default searches | Standard hybrid search |
| `person_activity` | "What is X working on?", "What has X done?" | Triggers author search - finds docs **authored by** the person |
| `person_bio` | "Who is X?", biography questions | Prioritizes biographical content |
| `technical_howto` | "How do I...?", implementation questions | Prioritizes code and technical docs |
| `concept_explain` | "What is X?", conceptual questions | Prioritizes explanatory content |

**Example:** To find what Gregory Landua is working on:
```json
{
  "query": "Gregory Landua",
  "intent": "person_activity",
  "limit": 15
}
```

### Available Sources

Use `get_stats` with `detailed: true` to see all available sources. Common sources include:

| Source | Description | Example Count |
|--------|-------------|---------------|
| `github` | GitHub repos (PRs, issues, code) | ~34,000 |
| `notion` | Notion workspace pages | ~5,000 |
| `discourse` | Forum.regen.network posts | ~1,800 |
| `gitlab` | GitLab repositories | ~2,000 |
| `web` | Various websites (guides, docs, registry) | ~3,700 |
| `youtube` | YouTube video transcripts | ~114 |
| `podcast` | Podcast episode transcripts | ~6,000 |

### Return Format

```json
{
  "content": [{
    "type": "text",
    "text": "Found 5 results:\n\n1. Governance Module Overview (0.87 similarity)\n   Path: x/gov/spec/01_concepts.md\n   Content: 'The governance module enables...'\n\n2. Voting Procedures (0.82 similarity)\n   ..."
  }]
}
```

### Examples

#### Example 1: Basic search

```json
{
  "query": "governance voting procedures"
}
```

**Returns:** Top 5 most similar documents about governance voting

#### Example 2: Search with date filter

```json
{
  "query": "credit retirement",
  "published_from": "2024-01-01",
  "published_to": "2024-12-31",
  "limit": 10
}
```

**Returns:** Top 10 documents about credit retirement published in 2024

#### Example 3: Recent docs only

```json
{
  "query": "latest governance changes",
  "published_from": "2024-11-01",
  "limit": 5
}
```

**Returns:** Recent governance documentation

#### Example 4: Filter by source

```json
{
  "query": "*",
  "source": "notion",
  "sort_by": "date_desc",
  "limit": 5
}
```

**Returns:** 5 most recent Notion documents

#### Example 5: Latest Discourse posts

```json
{
  "query": "governance",
  "source": "discourse",
  "sort_by": "date_desc",
  "limit": 10
}
```

**Returns:** 10 most recent Discourse forum posts about governance

#### Example 6: Oldest GitHub docs first

```json
{
  "query": "ecocredit",
  "source": "github",
  "sort_by": "date_asc",
  "limit": 5
}
```

**Returns:** 5 oldest GitHub documents about ecocredit

### Validation Rules

- `query`: 1-500 characters
- `source`: Optional, any valid source string (use `get_stats` to discover)
- `sort_by`: Optional, one of `relevance`, `date_desc`, `date_asc`
- `limit`: 1-50 (enforced)
- `published_from/to`: YYYY-MM-DD format only
- Date range queries require valid date format

### Performance

- **Cached:** 5 minutes
- **Typical latency:** 100-300ms
- **Best for:** Finding documentation by meaning

---

## hybrid_search

Intelligent search that automatically routes queries to graph (for entities) or vector (for concepts) based on query intent.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | **Yes** | - | Search query (natural language) |
| `limit` | number | No | 10 | Max results to return (1-50) |

### Return Format

```json
{
  "content": [{
    "type": "text",
    "text": "Query routed to: graph_search\n\nFound 10 results:\n\n..."
  }]
}
```

### Examples

#### Example 1: Entity query (routed to graph)

```json
{
  "query": "find the CreateBatch handler"
}
```

**Returns:** Graph results for CreateBatch entity

#### Example 2: Concept query (routed to vector)

```json
{
  "query": "how does governance voting work"
}
```

**Returns:** Vector search results for governance docs

### How Routing Works

The QueryRouter analyzes your query and decides:

**Route to Graph if:**
- Contains entity keywords (function, class, handler, keeper, message)
- Asking about specific code entities
- Pattern matching queries

**Route to Vector if:**
- Conceptual questions ("how does X work")
- Documentation requests
- General knowledge queries

**Result:** RRF fusion of both methods with intelligent weighting

### Validation Rules

- `query`: 1-500 characters
- `limit`: 1-50 (enforced)

### Performance

- **Cached:** 5 minutes
- **Typical latency:** 100-300ms
- **Best for:** General "find X" queries when you're not sure if it's code or docs

---

## search_github_docs

Search documentation files in specific GitHub repositories.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | **Yes** | - | Search query |
| `repository` | enum | No | all | Filter by specific repository |
| `limit` | number | No | 10 | Max results (1-20) |

### Repository Options

- `regen-ledger` - Blockchain code and specs
- `regen-web` - Frontend documentation
- `regen-data-standards` - Data schemas and standards
- `regenie-corpus` - Documentation corpus

### Return Format

```json
{
  "content": [{
    "type": "text",
    "text": "Found 3 results in regen-ledger:\n\n1. README.md\n   Preview: 'Regen Ledger is a blockchain...'\n\n2. x/ecocredit/spec/01_concepts.md\n   Preview: 'The ecocredit module...'\n   ..."
  }]
}
```

### Examples

#### Example 1: Search all repos

```json
{
  "query": "ecocredit module architecture"
}
```

**Returns:** Docs from all 4 repositories

#### Example 2: Search specific repo

```json
{
  "query": "governance voting",
  "repository": "regen-ledger",
  "limit": 5
}
```

**Returns:** Top 5 docs from regen-ledger only

### Validation Rules

- `query`: 1-300 characters
- `repository`: Must be one of 4 valid repos
- `limit`: 1-20 (enforced)

### Performance

- **Cached:** 5 minutes
- **Typical latency:** 100-200ms
- **Best for:** Finding docs in a specific repo

---

## get_repo_overview

Get a structured overview of a repository including README, key files, and links.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `repository` | enum | **Yes** | Repository to get overview for |

### Repository Options

- `regen-ledger`
- `regen-web`
- `regen-data-standards`
- `regenie-corpus`

### Return Format

```json
{
  "content": [{
    "type": "text",
    "text": "# regen-ledger\n\nRegen Ledger is a blockchain...\n\nKey Files:\n- README.md\n- CONTRIBUTING.md\n- docs/architecture/\n\nLinks:\n- GitHub: https://github.com/regen-network/regen-ledger\n- Docs: https://docs.regen.network\n..."
  }]
}
```

### Examples

#### Example 1: Get regen-ledger overview

```json
{
  "repository": "regen-ledger"
}
```

**Returns:** README content, file structure, documentation links

#### Example 2: Get regen-web overview

```json
{
  "repository": "regen-web"
}
```

**Returns:** Frontend repository overview

### Validation Rules

- `repository`: Must be one of 4 valid repository names

### Performance

- **Cached:** 1 hour (static data)
- **Typical latency:** <50ms (usually cached)
- **Best for:** Getting started with a repo

---

## get_tech_stack

Get the technology stack for one or all repositories.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `repository` | enum | No | Specific repository (omit for all) |

### Repository Options

- `regen-ledger`
- `regen-web`
- `regen-data-standards`
- `regenie-corpus`
- (omit parameter to get all repos)

### Return Format

```json
{
  "content": [{
    "type": "text",
    "text": "Technology Stack:\n\nLanguages:\n- Go (18,619 files)\n- TypeScript (3,164 files)\n- Protobuf (500+ files)\n\nFrameworks:\n- Cosmos SDK\n- React\n\nDatabases:\n- PostgreSQL\n- Apache AGE\n..."
  }]
}
```

### Examples

#### Example 1: All repos

```json
{}
```

**Returns:** Complete tech stack across all repositories

#### Example 2: Specific repo

```json
{
  "repository": "regen-ledger"
}
```

**Returns:** Tech stack for regen-ledger only

### Performance

- **Cached:** 1 hour (static data)
- **Typical latency:** <50ms
- **Best for:** Understanding technology choices

---

## get_stats

Get database and index statistics.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `detailed` | boolean | No | false | Include detailed breakdown by source/type |

### Return Format

**Basic stats (detailed=false):**
```json
{
  "content": [{
    "type": "text",
    "text": "KOI Statistics:\n\nTotal Entities: 26,768\nTotal Documents: 34,828\nRepositories: 4\nLast Updated: 2025-11-27"
  }]
}
```

**Detailed stats (detailed=true):**
```json
{
  "content": [{
    "type": "text",
    "text": "KOI Statistics:\n\nBy Repository:\n- regen-ledger: 18,619 entities\n- regen-web: 3,164 entities\n- koi-sensors: 1,250 entities\n...\n\nBy Entity Type:\n- Method: 19,884\n- Import: 3,363\n- Function: 1,693\n..."
  }]
}
```

### Examples

#### Example 1: Basic stats

```json
{
  "detailed": false
}
```

**Returns:** Summary statistics

#### Example 2: Detailed breakdown

```json
{
  "detailed": true
}
```

**Returns:** Stats by repository, entity type, and data source

### Performance

- **Cached:** 1 minute (volatile data)
- **Typical latency:** 50-100ms
- **Best for:** Understanding data coverage

---

## generate_weekly_digest

Generate a markdown digest of Regen Network activity and discussions for a specified time period.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `start_date` | string | No | 7 days ago | Start of date range (YYYY-MM-DD) |
| `end_date` | string | No | today | End of date range (YYYY-MM-DD) |
| `save_to_file` | boolean | No | false | Save to file on disk |
| `output_path` | string | No | auto | Custom file path (if save_to_file=true) |
| `format` | enum | No | markdown | Output format (markdown or json) |

### Return Format

```json
{
  "content": [{
    "type": "text",
    "text": "# Weekly Digest: 2025-11-20 to 2025-11-27\n\n## Highlights\n- 15 new commits\n- 3 PRs merged\n- 5 issues opened\n\n## Activity by Module\n...\n\n## Discussions\n..."
  }]
}
```

### Examples

#### Example 1: Last week (default)

```json
{}
```

**Returns:** Digest for last 7 days

#### Example 2: Custom date range

```json
{
  "start_date": "2025-11-01",
  "end_date": "2025-11-30",
  "format": "markdown"
}
```

**Returns:** November 2025 digest

#### Example 3: Save to file

```json
{
  "start_date": "2025-11-20",
  "end_date": "2025-11-27",
  "save_to_file": true,
  "output_path": "/path/to/digest.md"
}
```

**Returns:** Digest content and saves to file

### Validation Rules

- `start_date/end_date`: YYYY-MM-DD format
- `output_path`: Must be valid file path (no path traversal)
- `format`: Must be "markdown" or "json"

### Performance

- **Cached:** 1 minute
- **Typical latency:** 200-500ms (fetches from GitHub API)
- **Best for:** Weekly summaries and team updates

---

## get_mcp_metrics

Get MCP server health, performance metrics, and monitoring data.

### Parameters

None (no parameters required)

### Return Format

```json
{
  "content": [{
    "type": "text",
    "text": "# KOI MCP Server Metrics\n\nUptime: 3600s\n\n## Cache\n- Hit Rate: 67.5%\n- Hits: 234 | Misses: 112\n\n## API Calls\n- Total: 346\n- Error Rate: 1.2%\n- Latency: p50=45ms, p95=125ms, p99=210ms\n\n## Tools\n| Tool | Queries | Success Rate | p95 Latency |\n|------|---------|--------------|-------------|\n| query_code_graph | 145 | 98.6% | 110ms |\n..."
  }]
}
```

### Metrics Included

**System:**
- Uptime (seconds since start)
- Circuit breaker status

**Cache:**
- Hit rate (percentage)
- Hits and misses (counts)
- Cache size by category

**API:**
- Total API calls
- Error rate
- Latency percentiles (p50, p95, p99)

**Per-Tool:**
- Query count
- Success rate
- Average/p50/p95/p99 latencies
- Last error (if any)

### Examples

#### Example 1: Get current metrics

```json
{}
```

**Returns:** Complete metrics snapshot

### Performance

- **Not cached** (always fresh)
- **Typical latency:** <10ms (in-memory)
- **Best for:** Monitoring, debugging, performance analysis

### Interpreting Metrics

**Good Health:**
- Error rate < 5%
- Cache hit rate > 50%
- p95 latency < 200ms
- Circuit breaker: closed

**Degraded:**
- Error rate 5-10%
- Cache hit rate < 30%
- p95 latency 200-500ms

**Unhealthy:**
- Error rate > 10%
- p95 latency > 500ms
- Circuit breaker: open

---

## submit_feedback

Submit feedback about your KOI MCP experience directly from Claude Code. Helps improve the system.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `rating` | number | **Yes** | - | Rating from 1 (poor) to 5 (excellent) |
| `category` | enum | **Yes** | - | Type of feedback (see below) |
| `notes` | string | **Yes** | - | Detailed feedback, observations, or suggestions (1-5000 chars) |
| `task_description` | string | No | - | Brief description of what you were trying to do |
| `include_session_context` | boolean | No | true | Include tool usage stats for debugging context |

### Category Options

| Category | Use When |
|----------|----------|
| `success` | Everything worked great |
| `partial` | Mostly worked but had minor issues |
| `bug` | Something broke or didn't work as expected |
| `suggestion` | You have a feature idea or improvement |
| `question` | You need help or clarification |
| `other` | Doesn't fit other categories |

### Return Format

```json
{
  "content": [{
    "type": "text",
    "text": "Thank you for your feedback!\n\n**Rating:** 5/5\n**Category:** success\n**Feedback ID:** 6\n\nYour feedback helps improve KOI for everyone."
  }]
}
```

### Examples

#### Example 1: Positive feedback

```json
{
  "rating": 5,
  "category": "success",
  "notes": "Found exactly what I needed about basket tokens",
  "task_description": "Researching basket token implementation"
}
```

**Returns:** Confirmation with feedback ID

#### Example 2: Bug report

```json
{
  "rating": 2,
  "category": "bug",
  "notes": "Search returned no results for 'Registry Agent' even though it exists in the docs",
  "task_description": "Looking for Registry Agent documentation"
}
```

**Returns:** Confirmation, session context included for debugging

### Session Context

When `include_session_context` is true (default), the feedback includes:
- Recent tool usage statistics
- MCP uptime
- Error counts
- Cache hit rate

This helps debug issues without requiring manual log collection.

### Performance

- **Not cached** (always writes to database)
- **Typical latency:** 50-150ms
- **Best for:** End-of-session feedback, bug reports, feature suggestions

---

## get_full_document

Retrieve the complete content of a document by its RID and save it to a local file. Useful for getting full text of documents found via search without bloating the LLM context window.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `rid` | string | **Yes** | - | Document RID to retrieve. Can be base doc or chunk RID |
| `output_path` | string | No | `document_<hash>.md` | Custom file path for saving |
| `include_metadata_header` | boolean | No | true | Include YAML frontmatter with rid, title, url, source |

### Return Format

```json
{
  "content": [{
    "type": "text",
    "text": "## Document Retrieved Successfully\n\n**File:** `/path/to/document_abc123.md`\n**Size:** 3.9 KB\n**Word Count:** 581 words\n**Source:** notion\n**Content Source:** legacy_chunks\n**URL:** https://notion.so/..."
  }]
}
```

### Examples

#### Example 1: Basic retrieval

```json
{
  "rid": "orn:notion.page:regen/2f725b77-eda1-807d-a63e-c43e6145f7f1"
}
```

**Returns:** File path and summary. Document saved to `document_<hash>.md`.

#### Example 2: Custom output path

```json
{
  "rid": "orn:notion.page:regen/abc123",
  "output_path": "/tmp/meeting-notes.md",
  "include_metadata_header": true
}
```

**Returns:** File path pointing to `/tmp/meeting-notes.md` with YAML frontmatter.

#### Example 3: Chunk RID (auto-resolves to parent)

```json
{
  "rid": "orn:notion.page:regen/abc123#chunk5"
}
```

**Returns:** Full parent document (not just the chunk).

### Content Sources

The tool retrieves content via three fallback strategies:

| Source | When Used |
|--------|-----------|
| `direct` | Document has full text in `koi_memories.content->>'text'` |
| `chunks` | Direct text missing; reassembled from `koi_memory_chunks` |
| `legacy_chunks` | Older docs with chunks stored as separate `koi_memories` rows |

### Warnings

| Warning | Meaning |
|---------|---------|
| `fallback_used` | Used chunk reassembly instead of direct text |
| `partial_results` | Some chunks missing (gaps in chunk indices) |

### Errors

| Error | Cause | Solution |
|-------|-------|----------|
| 401 UNAUTHORIZED | Missing internal API key | Check KOI_INTERNAL_API_KEY env var |
| 403 ACCESS_DENIED | Private doc without auth | Use `regen_koi_authenticate` first |
| 404 DOCUMENT_NOT_FOUND | RID doesn't exist or is private | Verify RID is correct |

### Performance

- **Not cached** (retrieves fresh content each time)
- **Typical latency:** 200-500ms
- **Best for:** Getting full document content after finding via search

---

## Error Handling

All tools use consistent error format:

```json
{
  "content": [{
    "type": "text",
    "text": "Error: <error_message>"
  }]
}
```

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| "Validation failed" | Invalid parameters | Check parameter types and formats |
| "Circuit breaker is open" | Backend service down | Wait 60s and retry |
| "Timeout after 30000ms" | Query too complex | Narrow your query |
| "Invalid characters" | SQL/Cypher injection detected | Use only alphanumeric + `_-. ` |
| "Required parameter missing" | Missing required param | Add required parameter |
| "Unknown tool" | Tool name typo | Check tool name spelling |

---

## Rate Limits

**Current limits:**
- No hard rate limits on MCP server (client-side)
- Backend API: 60 requests/minute per IP (planned)
- Circuit breaker: Opens after 5 consecutive failures

**Best Practices:**
- Reuse queries when possible (leverage caching)
- Use specific queries instead of broad searches
- Check `get_mcp_metrics` if you see slowdowns

---

## Caching Behavior

Different query types have different cache TTLs:

| Category | TTL | Tools |
|----------|-----|-------|
| **Static** | 1 hour | list_repos, get_tech_stack, get_repo_overview |
| **Semi-static** | 10 minutes | find_by_type, module queries |
| **Dynamic** | 5 minutes | search queries, graph traversal |
| **Volatile** | 1 minute | get_stats, generate_weekly_digest |
| **Not cached** | - | get_mcp_metrics |

**Cache key:** Hash of (tool_name + query_type + parameters)

**Example:** Two identical queries within 5 minutes:
- First query: cache miss → hits backend (slower)
- Second query: cache hit → returns cached result (faster)

---

## Performance Expectations

| Tool | Typical Latency | Cached Latency |
|------|----------------|----------------|
| query_code_graph | 50-200ms | <10ms |
| search_knowledge | 100-300ms | <10ms |
| hybrid_search | 100-300ms | <10ms |
| search_github_docs | 100-200ms | <10ms |
| get_repo_overview | 50-100ms | <10ms |
| get_tech_stack | 50-100ms | <10ms |
| get_stats | 50-100ms | 50-100ms (1min cache) |
| generate_weekly_digest | 200-500ms | 200-500ms (1min cache) |
| get_mcp_metrics | <10ms | Not cached |

**Note:** First query is always slower (cache miss). Subsequent identical queries are much faster.

---

## Version History

**1.6.0 (2026-02-03):**
- Added `get_full_document` tool for complete document retrieval by RID
- Saves to local file to avoid context bloat
- Supports chunk RID resolution, privacy filtering, and chunk reassembly fallback
- Server endpoint: `GET /api/koi/document/full`

**1.5.6 (2026-01-13):**
- Added `submit_feedback` tool for in-session feedback collection
- Captures session context (tool usage, errors) for debugging
- Backend endpoint at `/api/koi/feedback` with PostgreSQL storage

**1.4.8 (2026-01-06):**
- Added `source` parameter to search tool for filtering by data source (notion, github, discourse, etc.)
- Added `sort_by` parameter with backend-side date sorting (date_desc, date_asc, relevance)
- Backend now properly sorts by date before limiting results (fixes date gap issue)
- Updated document count to 59,000+

**1.0.6 (2025-11-27):**
- Added `get_mcp_metrics` tool
- Production hardening (logging, caching, validation)
- Added 5 graph traversal query types (find_callers, find_callees, etc.)

**1.0.5 (2025-11-27):**
- Added concepts layer with 10 core concepts
- Added 3 concept query types

**1.0.4 (2025-11-27):**
- Generic ontology migration
- Tree-sitter extraction replacing regex

**1.0.0 (2025-11-26):**
- Initial MCP server release
- 8 core tools

---

## Getting Help

- **User Guide:** [USER_GUIDE.md](./USER_GUIDE.md)
- **Deployment:** [DEPLOYMENT.md](./DEPLOYMENT.md)
- **Issues:** https://github.com/gaiaaiagent/regen-koi-mcp/issues
- **Discord:** https://discord.gg/regen-network
