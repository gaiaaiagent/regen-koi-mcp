# `/api/koi/query` API Documentation

The most powerful KOI endpoint - performs **Hybrid RAG** (Retrieval-Augmented Generation) combining vector similarity search and keyword matching with Reciprocal Rank Fusion.

## Endpoint

```
POST https://regen.gaiaai.xyz/api/koi/query
Content-Type: application/json
```

---

## Core Features

### 1. **Hybrid Search** (Vector + Keyword)
Combines two search methods and fuses results using RRF (Reciprocal Rank Fusion):

- **Vector Similarity Search**: Uses BGE embeddings (dim_1024) for semantic matching
- **Keyword Search**: PostgreSQL full-text search with ts_rank (BM25-like ranking)
- **RRF Fusion**: Merges results from both methods for optimal relevance

### 2. **Date Filtering**
Filter results by publication date range:
- `published_from`: Start date (YYYY-MM-DD or ISO timestamp)
- `published_to`: End date (YYYY-MM-DD or ISO timestamp)
- `include_undated`: Include documents without publication dates

### 3. **Confidence Scoring**
Automatic confidence calculation based on result quality and diversity

### 4. **Adaptive Extraction**
Triggers fact extraction for low-confidence queries (< 0.3 threshold)

---

## Request Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `question` | string | Yes | - | The search query (also accepts `query` for compatibility) |
| `limit` | number | No | 10 | Max results to return |
| `user_id` | string | No | 'web-user' | User identifier for logging |
| `agent_id` | string | No | 'koi-interface' | Agent identifier for logging |
| `filters` | object | No | {} | Date range and other filters |

### Filters Object

```json
{
  "date_range": {
    "start": "2025-11-01",
    "end": "2025-12-01"
  },
  "include_undated": false
}
```

---

## Response Format

```json
{
  "question": "your query here",
  "total_results": 25,
  "confidence": 0.78,
  "execution_time": 0.234,
  "triggered_extraction": false,
  "results": [
    {
      "title": "Document regen.discourse:1234",
      "content": "Full document text...",
      "score": 0.89,
      "source": "vector",
      "rid": "regen.discourse:forum_post_1234",
      "metadata": {
        "source": "discourse",
        "url": "https://forum.regen.network/...",
        "published_at": "2025-11-15T10:30:00Z"
      }
    }
  ]
}
```

### Response Fields

- **question**: Original query
- **total_results**: Total results found (before limit)
- **confidence**: Confidence score (0-1)
- **execution_time**: Query time in seconds
- **triggered_extraction**: Whether fact extraction was triggered
- **results**: Array of result objects

### Result Object Fields

- **title**: Document title (uses RID if no title)
- **content**: Document text content
- **score**: Relevance score (0-1)
- **source**: Search source ('vector', 'keyword', or 'fused')
- **rid**: Resource identifier (e.g., 'regen.discourse:post_123')
- **metadata**: Document metadata (source, URL, date, etc.)

---

## Usage Examples

### 1. Basic Search

**Request:**
```bash
curl -X POST 'https://regen.gaiaai.xyz/api/koi/query' \
  -H 'Content-Type: application/json' \
  -d '{
    "question": "How does credit batch creation work?",
    "limit": 5
  }'
```

**Response:**
```json
{
  "question": "How does credit batch creation work?",
  "total_results": 15,
  "confidence": 0.82,
  "execution_time": 0.156,
  "triggered_extraction": false,
  "results": [
    {
      "title": "Document regen.github:regen-ledger_...",
      "content": "The MsgCreateBatch message is used to create...",
      "score": 0.91,
      "source": "vector",
      "rid": "regen.github:github_regen-ledger_...",
      "metadata": {"source": "github", "..."}
    }
  ]
}
```

---

### 2. Search with Date Filter

**Request:**
```bash
curl -X POST 'https://regen.gaiaai.xyz/api/koi/query' \
  -H 'Content-Type: application/json' \
  -d '{
    "question": "governance proposals",
    "limit": 10,
    "filters": {
      "date_range": {
        "start": "2025-11-01",
        "end": "2025-12-01"
      }
    }
  }'
```

**Use Case:** Find recent discussions about governance in November 2025

---

### 3. Search Last 7 Days

**Request:**
```bash
curl -X POST 'https://regen.gaiaai.xyz/api/koi/query' \
  -H 'Content-Type: application/json' \
  -d '{
    "question": "Regen Network updates",
    "limit": 20,
    "filters": {
      "date_range": {
        "start": "2025-11-25",
        "end": "2025-12-02"
      }
    }
  }'
```

**Use Case:** Weekly activity summary

---

### 4. Person/Team Search

**Request:**
```bash
curl -X POST 'https://regen.gaiaai.xyz/api/koi/query' \
  -H 'Content-Type: application/json' \
  -d '{
    "question": "Gregory Landua",
    "limit": 15
  }'
```

**Features:**
- Handles name variations (Greg → Gregory)
- Prefix matching for partial names
- Combines AND/OR logic for multi-word names

---

### 5. Technical Documentation Search

**Request:**
```bash
curl -X POST 'https://regen.gaiaai.xyz/api/koi/query' \
  -H 'Content-Type: application/json' \
  -d '{
    "question": "ecocredit module architecture",
    "limit": 10
  }'
```

**Use Case:** Find technical documentation about Cosmos SDK modules

---

### 6. High-Volume Search (for filtering)

**Request:**
```bash
curl -X POST 'https://regen.gaiaai.xyz/api/koi/query' \
  -H 'Content-Type: application/json' \
  -d '{
    "question": "carbon credits",
    "limit": 50
  }'
```

**Use Case:** Get many results for client-side filtering (e.g., filter by repository)

---

## Search Behavior Details

### Vector Search (Semantic)
- **Embedding Model**: BGE (BAAI/bge-large-en-v1.5) with 1024 dimensions
- **Similarity**: Cosine similarity using pgvector (`<=>` operator)
- **Benefits**: 
  - Understands context and intent
  - Finds semantically similar content
  - Works with natural language questions

### Keyword Search (Full-Text)
- **Engine**: PostgreSQL ts_rank (BM25-like)
- **Features**:
  - AND/OR query logic
  - Prefix matching (handles partial words)
  - Name variations (Greg → Gregory)
- **Benefits**:
  - Exact phrase matching
  - Better for names and specific terms
  - Fast for precise queries

### Reciprocal Rank Fusion (RRF)
- Combines vector + keyword results
- Formula: `RRF_score = Σ(1 / (rank + k))` where k=60
- Benefits:
  - Best of both search methods
  - Reduces individual method biases
  - More robust across query types

---

## Data Sources

Results come from **48,079+ documents** across multiple sources:

| Source | Count | Description |
|--------|-------|-------------|
| **discourse** | ~12,000 | Forum posts from forum.regen.network |
| **web** | ~18,000 | Website content, blog posts |
| **github** | ~8,000 | Documentation, README files |
| **podcast** | ~3,000 | Podcast transcripts |
| **telegram** | ~4,000 | Telegram messages |
| **discord** | ~2,000 | Discord messages |
| **medium** | ~1,000 | Medium articles |

---

## Performance Metrics

- **Typical Query Time**: 150-300ms
- **Vector Search**: ~100ms
- **Keyword Search**: ~50ms
- **RRF Fusion**: ~10ms
- **Database**: PostgreSQL with pgvector extension

---

## Use Cases by MCP Tool

### 1. **search_knowledge** Tool
```json
{
  "question": "What is regenerative agriculture?",
  "limit": 5,
  "filters": {
    "date_range": {
      "start": "2025-11-01"
    }
  }
}
```
**Use**: General knowledge retrieval with date filters

---

### 2. **hybrid_search** Tool
```json
{
  "question": "How does credit batch creation work?",
  "limit": 10
}
```
**Use**: Intelligent routing (but ultimately calls this endpoint)

---

### 3. **search_github_docs** Tool
```json
{
  "question": "ecocredit module documentation",
  "limit": 30
}
```
**Use**: Get many results, then filter client-side to GitHub RIDs only

---

### 4. **get_repo_overview** Tool
```json
{
  "question": "regen-ledger README documentation overview",
  "limit": 20
}
```
**Use**: Parallel queries for different aspects (README, CONTRIBUTING, etc.)

---

### 5. **get_tech_stack** Tool
```json
{
  "question": "package.json dependencies frameworks",
  "limit": 15
}
```
**Use**: Search for tech stack indicators across repos

---

## Error Responses

**400 Bad Request** - Missing question:
```json
{
  "error": "Question is required"
}
```

**500 Internal Server Error**:
```json
{
  "error": "Internal server error",
  "message": "Detailed error message"
}
```

---

## Confidence Scoring

The endpoint automatically calculates confidence based on:
- **Top result score**: Higher scores = higher confidence
- **Score distribution**: Wider gap between top results = higher confidence
- **Result count**: More results = higher confidence

**Confidence Levels:**
- **> 0.7**: High confidence (good results)
- **0.3 - 0.7**: Medium confidence
- **< 0.3**: Low confidence (triggers adaptive extraction)

---

## Adaptive Extraction

When confidence is low (< 0.3), the endpoint automatically:
1. Selects top 3 results
2. Triggers Python adaptive extraction pipeline
3. Extracts structured facts
4. Saves to knowledge base for future queries

**This improves results over time!**

---

## Tips for Best Results

1. **Use natural language**: "How does X work?" performs better than "X"
2. **Be specific**: "MsgCreateBatch handler" > "create batch"
3. **Use date filters**: For time-sensitive queries
4. **Request more results**: Set `limit: 50` if you'll filter client-side
5. **Combine terms**: "ecocredit module keeper" finds specific code
6. **Names work well**: "Gregory Landua" finds person-related content

---

## Related Endpoints

- **POST /api/koi/graph**: For code entity queries (more structured)
- **GET /api/koi/weekly-digest**: For time-based activity summaries
- **GET /api/koi/stats**: For knowledge base statistics

---

## Summary

The `/api/koi/query` endpoint is the **workhorse of the KOI system**:

✅ **48,079+ documents** across 7 data sources  
✅ **Hybrid search** (vector + keyword + RRF fusion)  
✅ **Date filtering** for time-based queries  
✅ **150-300ms** typical response time  
✅ **Automatic confidence** scoring  
✅ **Adaptive extraction** for continuous improvement  
✅ **Natural language** query support  

Used by **6 different MCP tools** for various search needs!
