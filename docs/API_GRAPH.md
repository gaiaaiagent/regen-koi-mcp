# `/api/koi/graph` API Documentation

Query the Regen Network code knowledge graph containing 26,768+ code entities extracted from 5 repositories.

## Endpoint

```
POST https://regen.gaiaai.xyz/api/koi/graph
Content-Type: application/json
```

## Graph Database

- **Database**: Apache AGE (PostgreSQL graph extension)
- **Graph Name**: `regen_graph_v2`
- **Total Entities**: 26,768
- **Repositories**: regen-ledger, regen-web, koi-sensors, regen-data-standards, regen-koi-mcp

---

## Query Types

### 1. Discovery Queries

#### `list_repos` - List all indexed repositories

**Request:**
```bash
curl -X POST 'https://regen.gaiaai.xyz/api/koi/graph' \
  -H 'Content-Type: application/json' \
  -d '{"query_type": "list_repos"}'
```

**Response:**
```json
{
  "query_type": "list_repos",
  "total_results": 7,
  "results": [
    {
      "repo": {"name": "regen-ledger"},
      "entity_count": 19024
    },
    {
      "repo": {"name": "koi-sensors"},
      "entity_count": 1250
    }
  ]
}
```

---

#### `list_entity_types` - Show all entity types with counts

**Request:**
```bash
curl -X POST 'https://regen.gaiaai.xyz/api/koi/graph' \
  -H 'Content-Type: application/json' \
  -d '{"query_type": "list_entity_types"}'
```

**Response:**
```json
{
  "query_type": "list_entity_types",
  "total_results": 10,
  "results": [
    {"entity_type": "Entity", "count": 21058},
    {"entity_type": "Type", "count": 4573},
    {"entity_type": "Interface", "count": 804},
    {"entity_type": "Function", "count": 557}
  ]
}
```

---

#### `get_entity_stats` - Comprehensive graph statistics

**Request:**
```bash
curl -X POST 'https://regen.gaiaai.xyz/api/koi/graph' \
  -H 'Content-Type: application/json' \
  -d '{"query_type": "get_entity_stats"}'
```

**Response:**
```json
{
  "query_type": "get_entity_stats",
  "total_results": 10,
  "results": [
    {
      "entity_type": "Function",
      "count": 557,
      "languages": ["go", "typescript"],
      "repos": ["regen-ledger", "koi-sensors"]
    }
  ]
}
```

---

### 2. Search Queries

#### `find_by_type` - Find entities by type

**Parameters:**
- `entity_type` (required): Entity type (e.g., "Function", "Interface", "Struct", "Type")
- `repo_name` (optional): Filter by repository
- `limit` (optional): Max results (default: 10)

**Request:**
```bash
curl -X POST 'https://regen.gaiaai.xyz/api/koi/graph' \
  -H 'Content-Type: application/json' \
  -d '{
    "query_type": "find_by_type",
    "entity_type": "Interface",
    "repo_name": "regen-ledger",
    "limit": 5
  }'
```

**Response:**
```json
{
  "query_type": "find_by_type",
  "entity_type": "Interface",
  "total_results": 5,
  "results": [
    {
      "entity": {
        "name": "MsgClient",
        "file_path": "x/ecocredit/v3/types/tx.pb.go",
        "line_number": 123,
        "repo": "regen-ledger"
      }
    }
  ]
}
```

---

#### `search_entities` - Search by name (regex)

**Parameters:**
- `entity_name` (required): Search term (regex, case-insensitive)
- `repo_name` (optional): Filter by repository
- `limit` (optional): Max results (default: 10)

**Request:**
```bash
curl -X POST 'https://regen.gaiaai.xyz/api/koi/graph' \
  -H 'Content-Type: application/json' \
  -d '{
    "query_type": "search_entities",
    "entity_name": "MsgCreate",
    "limit": 10
  }'
```

**Response:**
```json
{
  "query_type": "search_entities",
  "total_results": 8,
  "results": [
    {
      "type": "Struct",
      "entity": {
        "name": "MsgCreateBatch",
        "file_path": "x/ecocredit/v3/types/tx.pb.go",
        "repo": "regen-ledger"
      }
    }
  ]
}
```

---

### 3. Relationship Queries

#### `keeper_for_msg` - Find which Keeper handles a message

**Parameters:**
- `entity_name` (required): Message name (e.g., "MsgCreateBatch")

**Request:**
```bash
curl -X POST 'https://regen.gaiaai.xyz/api/koi/graph' \
  -H 'Content-Type: application/json' \
  -d '{
    "query_type": "keeper_for_msg",
    "entity_name": "MsgCreateBatch"
  }'
```

**Response:**
```json
{
  "query_type": "keeper_for_msg",
  "entity_name": "MsgCreateBatch",
  "total_results": 1,
  "results": [
    {
      "keeper": {
        "name": "Keeper",
        "file_path": "x/ecocredit/keeper/keeper.go",
        "repo": "regen-ledger"
      }
    }
  ]
}
```

---

#### `msgs_for_keeper` - List all messages a Keeper handles

**Parameters:**
- `entity_name` (required): Keeper name

**Request:**
```bash
curl -X POST 'https://regen.gaiaai.xyz/api/koi/graph' \
  -H 'Content-Type: application/json' \
  -d '{
    "query_type": "msgs_for_keeper",
    "entity_name": "Keeper"
  }'
```

**Response:**
```json
{
  "query_type": "msgs_for_keeper",
  "entity_name": "Keeper",
  "total_results": 15,
  "results": [
    {"message": {"name": "MsgCreateBatch"}},
    {"message": {"name": "MsgRetire"}},
    {"message": {"name": "MsgSend"}}
  ]
}
```

---

#### `related_entities` - Find related entities

**Parameters:**
- `entity_name` (required): Entity to query
- `limit` (optional): Max results (default: 10)

**Request:**
```bash
curl -X POST 'https://regen.gaiaai.xyz/api/koi/graph' \
  -H 'Content-Type: application/json' \
  -d '{
    "query_type": "related_entities",
    "entity_name": "Keeper",
    "limit": 20
  }'
```

**Response:**
```json
{
  "query_type": "related_entities",
  "entity_name": "Keeper",
  "total_results": 20,
  "results": [
    {
      "type": "Function",
      "entity": {"name": "CreateBatch"},
      "relationship": "HAS_METHOD"
    },
    {
      "type": "Struct",
      "entity": {"name": "MsgCreateBatch"},
      "relationship": "HANDLED_BY"
    }
  ]
}
```

---

### 4. Module Queries (Cosmos SDK)

#### `list_modules` - List all Cosmos SDK modules

**Request:**
```bash
curl -X POST 'https://regen.gaiaai.xyz/api/koi/graph' \
  -H 'Content-Type: application/json' \
  -d '{"query_type": "list_modules"}'
```

**Response:**
```json
{
  "query_type": "list_modules",
  "total_results": 25,
  "results": [
    {
      "module": {
        "name": "ecocredit",
        "description": "Carbon credit management module"
      }
    },
    {
      "module": {
        "name": "data",
        "description": "Data anchoring module"
      }
    }
  ]
}
```

---

#### `get_module` - Get module details with entities

**Parameters:**
- `module_name` (required): Module name (e.g., "ecocredit")

**Request:**
```bash
curl -X POST 'https://regen.gaiaai.xyz/api/koi/graph' \
  -H 'Content-Type: application/json' \
  -d '{
    "query_type": "get_module",
    "module_name": "ecocredit"
  }'
```

**Response:**
```json
{
  "query_type": "get_module",
  "module_name": "ecocredit",
  "total_results": 150,
  "results": [
    {
      "module": {"name": "ecocredit", "description": "..."},
      "entity_type": "Function",
      "entity": {"name": "CreateBatch", "file_path": "..."}
    }
  ]
}
```

---

## Error Responses

**400 Bad Request** - Missing required parameter:
```json
{
  "error": "query_type is required"
}
```

**500 Internal Server Error** - Query execution error:
```json
{
  "error": "Graph query failed: <error details>"
}
```

---

## Response Format

All successful responses follow this structure:

```json
{
  "query_type": "string",
  "total_results": 123,
  "results": [
    // Array of result objects
  ],
  // Query-specific fields (entity_name, repo_name, etc.)
}
```

---

## Common Use Cases

### Find all Functions in a repository
```bash
curl -X POST 'https://regen.gaiaai.xyz/api/koi/graph' \
  -H 'Content-Type: application/json' \
  -d '{
    "query_type": "find_by_type",
    "entity_type": "Function",
    "repo_name": "regen-ledger",
    "limit": 50
  }'
```

### Search for credit-related code
```bash
curl -X POST 'https://regen.gaiaai.xyz/api/koi/graph' \
  -H 'Content-Type: application/json' \
  -d '{
    "query_type": "search_entities",
    "entity_name": "credit",
    "limit": 20
  }'
```

### Understand module structure
```bash
# 1. List modules
curl -X POST 'https://regen.gaiaai.xyz/api/koi/graph' \
  -H 'Content-Type: application/json' \
  -d '{"query_type": "list_modules"}'

# 2. Get specific module details
curl -X POST 'https://regen.gaiaai.xyz/api/koi/graph' \
  -H 'Content-Type: application/json' \
  -d '{
    "query_type": "get_module",
    "module_name": "ecocredit"
  }'
```

### Find message handlers
```bash
# 1. Find keeper for a message
curl -X POST 'https://regen.gaiaai.xyz/api/koi/graph' \
  -H 'Content-Type: application/json' \
  -d '{
    "query_type": "keeper_for_msg",
    "entity_name": "MsgRetire"
  }'

# 2. Find all messages a keeper handles
curl -X POST 'https://regen.gaiaai.xyz/api/koi/graph' \
  -H 'Content-Type: application/json' \
  -d '{
    "query_type": "msgs_for_keeper",
    "entity_name": "Keeper"
  }'
```

---

## Notes

- **Case Sensitivity**: Search is case-insensitive for `search_entities`
- **Regex Support**: `entity_name` in `search_entities` supports regex patterns
- **Performance**: Graph queries typically complete in < 200ms
- **Pagination**: Use `limit` parameter to control result size

