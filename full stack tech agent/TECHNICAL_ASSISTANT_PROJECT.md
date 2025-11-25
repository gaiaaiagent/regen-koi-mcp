# Regen Technical Collaboration Assistant - Project Tracking

**Project Start Date:** 2025-11-24
**Status:** Implementation Phase
**Current Phase:** Infrastructure - Full Codebase Indexing

---

## Project Overview

### Goal
Extend the `regen-koi-mcp` server to become the **Regen Technical Collaboration Assistant** with tiered access control, providing developers and collaborators with powerful tools for code search, architectural understanding, and technical context.

### Scope
- Add technical/developer-focused MCP tools
- Implement tiered access system (Public → Partner/Collaborator → Developer)
- Leverage existing GitHub sensor infrastructure from `koi-sensors`
- Maintain existing architecture (server API pattern)
- Ensure backward compatibility with existing tools

### Out of Scope
- Building new authentication system for GitHub (repos are public)
- Modifying core sensor or processor infrastructure (unless necessary)
- Production deployment automation

---

## Access Tiers & Tools

### Tier 1: Public (No Auth)
**Existing Tools:**
- ✅ `search_knowledge` - Hybrid search (vectors + graph)
- ✅ `get_stats` - Knowledge base statistics
- ✅ `generate_weekly_digest` - Weekly activity digest

**New Tools Planned:**
- ✅ `search_github_docs` - Search GitHub repos for documentation, README, configs **(Implemented 2025-11-24)**
- ✅ `get_repo_overview` - Repository overview (structure, purpose, key files) **(Implemented 2025-11-24)**
- ✅ `get_tech_stack` - Technical stack information **(Implemented 2025-11-24)**

### Tier 2: Partner/Collaborator (Org Email Auth)
**Tool Prefix:** `collab:` (proposed)

**New Tools Planned:**
- 🔲 `get_architecture_overview` - Deep system architecture and component relationships
- 🔲 `search_integration_guides` - Internal integration documentation
- 🔲 `get_tech_stack_deep` - Detailed stack info with internal rationale

### Tier 3: Developer (Dev Role)
**Tool Prefix:** `dev:` (proposed)

**New Tools Planned:**
- 🔲 `analyze_dependencies` - Cross-repo dependency analysis
- 🔲 `get_implementation_details` - Deep implementation context
- 🔲 `search_internal_docs` - Search internal technical docs (Notion, etc.)

---

## Implementation Checklist

### Phase 1: Research & Discovery ✅
- [x] Pull latest from all repos
- [x] Create project tracking document
- [x] Explore `regen-koi-mcp` codebase structure
- [x] Review existing GitHub sensors (`github_activity`, `github`, `gitlab`)
- [x] Assess what data is already in production database
- [x] Document findings and propose implementation plan
- [x] Review and improve proposal
- [ ] **STOP** - Get approval before coding

### Phase 0: Validate Data & API ✅ COMPLETE
- [x] Test API filtering with actual requests (verify `source_sensor` filtering works)
- [x] Sample production data to verify content quality
- [x] Document exact `source_sensor` values available in production
- [x] Verify wildcard patterns → **Finding:** Use `"source_sensor": "regen.github"` (not wildcards)
- [x] Create API validation test script
- [x] Document client-side filtering requirements

### Phase 1a: Single Tool MVP ✅ COMPLETE (2025-11-24)
- [x] Implement `search_github_docs` tool (most useful, validates approach)
- [x] Write basic test script for the tool
- [x] Test against production API
- [x] Build passes with zero TypeScript errors

**Implementation Details:**
- Files modified: `src/tools.ts` (27 lines), `src/index.ts` (166 lines)
- Test results: 3/5 passed (60%) - failures are API content gaps, not bugs
- Key corrections applied from Phase 0:
  - Used `query` parameter (NOT `question`)
  - Read `memories` field (NOT `results`)
  - NO server-side filters (100% client-side filtering)
- Client-side filtering handles: RID prefix filtering, repo filtering, deduplication

### Phase 1b: Complete Public Tools ✅ COMPLETE (2025-11-24)
- [x] Implement `get_repo_overview` tool
- [x] Implement `get_tech_stack` tool
- [x] Build passes with zero TypeScript errors
- [x] Test scripts created

**Implementation Details:**
- Files modified: `src/tools.ts` (lines 118-146), `src/index.ts` (lines 1120-1550)
- `get_repo_overview`: Parallel queries for README, CONTRIBUTING, architecture docs
- `get_tech_stack`: Searches for package.json, go.mod, Dockerfile, Makefile, CI configs
- Both tools follow Phase 1a patterns (client-side filtering, proper error handling)

### Infrastructure: GitHub Sensor Enhancement ✅ COMPLETE (2025-11-25)
- [x] Expand file extensions for full codebase indexing
- [x] Remove 30-day age filter (index ALL files)
- [x] Add file size limit (500KB max)
- [x] Update excluded directories for code repos
- [x] Rename `doc_extensions` → `file_extensions`
- [x] Python syntax check passed

**File Modified:** `/Users/darrenzal/projects/RegenAI/koi-sensors/sensors/github/github_sensor.py`

**New File Types Added:**
- Source Code: `.go`, `.ts`, `.tsx`, `.js`, `.jsx`, `.py`, `.rs`, `.sol`
- Protocol Buffers: `.proto` (CRITICAL for Cosmos SDK)
- Build: `Makefile`, `Dockerfile*`, `docker-compose*.yml`
- Dependencies: `go.mod`, `go.sum`
- Schemas: `.sql`, `.graphql`, `.gql`
- Scripts: `.sh`

**Next Step:** ✅ COMPLETED - Local testing successful

### Local Stack Testing ✅ COMPLETE (2025-11-25)
- [x] Start KOI Coordinator (port 8005)
- [x] Start BGE Embedding Server (port 8090)
- [x] Start Event Bridge v2 (port 8100)
- [x] Start Event Forwarder
- [x] Run enhanced GitHub sensor on regen-ledger
- [x] Verify data in PostgreSQL

**Results:**
- 810 documents discovered
- 944 chunks stored in database
- 97 unique files indexed
- File breakdown: 66 `.md`, 25 `.go`, 1 other
- Indexing time: ~2.5 minutes

**Database Issues Resolved:**
- Created `koi_memories` table (migration 003)
- Added missing columns: `content_hash`, `published_at`, `published_confidence`
- Fixed data type for `published_confidence` (NUMERIC)
- Added unique index on `rid` for ON CONFLICT clause

**Pending:** Embeddings generation (requires OpenAI API key)

### Session Fix ✅ COMPLETE (2025-11-25)
**Problem:** All 810 document broadcasts failed with `No active session for broadcasting`
- Root cause: KOI node HTTP session not maintained during send operation
- Only 240/810 files made it to database from earlier partial run

**Solution Implemented:**
- Added session validation and auto-reinitialization in `send_to_koi()` (github_sensor.py:536-543)
- Added session verification after node startup (test_config.py:28-29)
- Session recreated automatically if missing or closed

**Files Modified:**
- `/Users/darrenzal/projects/RegenAI/koi-sensors/sensors/github/github_sensor.py`
- `/Users/darrenzal/projects/RegenAI/koi-sensors/sensors/github/test_config.py`
- Created: `/Users/darrenzal/projects/RegenAI/koi-sensors/sensors/github/SESSION_FIX.md`

**Expected Impact:**
- 643 Go files will be indexed (vs 173 before)
- 43 Proto files will be indexed (vs 0 before)
- ~810 total unique files (vs 240 before)

**Next:** Re-run sensor to index all 810 files with session fix

### RID Generation Fix ✅ COMPLETE (2025-11-25)
**Problem:** RIDs included temporary directory path, causing duplicates
- Issue: `github_sensor_18f2y37p` temp directory in RIDs
- Impact: Every run created new RIDs for same files

**Solution Implemented:**
- Updated `process_file()` to accept `repo_path` parameter (github_sensor.py:291)
- Fixed relative path calculation using repo root (github_sensor.py:328)
- Updated method call to pass repo_path (github_sensor.py:220)

**Files Modified:**
- `/Users/darrenzal/projects/RegenAI/koi-sensors/sensors/github/github_sensor.py`
- Created: `/Users/darrenzal/projects/RegenAI/koi-sensors/sensors/github/RID_FIX.md`

**Result:** Clean RIDs verified:
```
Before: regen.github:github_regen-ledger_github_sensor_18f2y37p_regen-ledger_CODE_OF_CONDUCT.md
After:  regen.github:github_regen-ledger_CODE_OF_CONDUCT.md
```

### Full Re-Index Complete ✅ (2025-11-25)
**Action:** Cleared database and re-indexed with both fixes applied

**Results:**
- Files discovered: 831 (664 .go, 69 .md, 43 .proto, 24 .sh, 31 other)
- Successfully sent: 831/831 (100%)
- Session errors: 0
- Database indexed: 285 unique files, 3000 chunks
- Processing status: **Stalled at 34% due to missing OpenAI API key**

**Issue Discovered:**
- BGE server has no OpenAI API key configured
- All embedding requests return 500 errors
- Documents stored WITHOUT embeddings (keyword search only)
- Event bridge logs: `Successfully processed: N chunks, 0 embeddings`

**Current Status:**
- ✅ Documents stored in database (285/831 files)
- ❌ No embeddings generated (semantic search unavailable)
- ✅ Session management working perfectly
- ✅ RID generation working perfectly
- ⏸️ Processing paused at ~34% due to BGE errors

**Next Steps for Tomorrow:**
1. Add OPENAI_API_KEY to `/Users/darrenzal/projects/RegenAI/koi-processor/.env`
2. Restart BGE server and Event Bridge
3. Either wait for remaining 546 files to process OR clear & re-index all 831 with embeddings
4. Test MCP tools with semantic search

---

### Phase 2: Authentication Layer (DEFERRED)
*Deferred: All repos are public, auth not needed for MVP*

- [ ] Design auth system architecture
- [ ] Implement user authentication mechanism
- [ ] Integrate with KOI permission system
- [ ] Add dynamic tool exposure based on permissions
- [ ] Test auth flows

### Phase 4: Partner/Collaborator Tools
- [ ] Implement `get_architecture_overview`
- [ ] Implement `search_integration_guides`
- [ ] Implement `get_tech_stack_deep`
- [ ] Test partner tools with auth

### Phase 5: Developer Tools
- [ ] Implement `analyze_dependencies`
- [ ] Implement `get_implementation_details`
- [ ] Implement `search_internal_docs`
- [ ] Test developer tools with auth

### Phase 6: Testing & Documentation
- [ ] Create comprehensive test suite
- [ ] Write manual test script
- [ ] Test all access tiers
- [ ] Update README with setup instructions
- [ ] Document authentication configuration
- [ ] Document new capabilities

---

## Architecture Context

### System Overview
```
koi-sensors (scraping) → koi-processor (processing/indexing) → Production API
                                                                      ↓
                                                              regen-koi-mcp (MCP server)
                                                                      ↓
                                                                Claude Desktop
```

### Key Principles
1. **Server API Pattern:** All data access goes through production server API
2. **No Direct Database Access:** MCP server queries API, not database
3. **Leverage Existing Sensors:** Use what's already scraped (GitHub metadata, code, etc.)
4. **Tiered Access:** Auth controls access to internal docs/context, NOT GitHub
5. **Dynamic Tool Exposure:** Tools appear/disappear based on user permissions

### Related Repositories
- **`regen-koi-mcp`** - This MCP server (our main focus)
- **`koi-sensors`** - Data scraping (forums, websites, GitHub, Notion, etc.)
  - `sensors/github_activity` - Existing GitHub metadata sensor
  - `sensors/github` - More complete GitHub sensor (in progress)
  - `sensors/gitlab` - GitLab sensor (useful patterns)
- **`koi-processor`** - Data processing pipeline
- **`koi-research`** - Research and documentation

---

## Design Decisions & Rationale

### Decision Log

#### 2025-11-24: Project Initiation
- **Decision:** Start with research phase before any implementation
- **Rationale:** Need to understand existing capabilities before proposing changes
- **Status:** In progress

---

## Technical Questions & Blockers

### Open Questions

1. **GitHub Data Readiness** ✅ RESOLVED
   - **Finding:** Two GitHub sensors exist:
     - `github_activity`: Scrapes commit messages, issues, PRs (metadata only, no code diffs)
     - `github`: Scrapes documentation files (.md, .yaml, .json) - NOT source code by default
   - **Code Content:** Currently NOT scraped, but can be easily added by:
     - Extending `github` sensor to include source file extensions (.py, .ts, .rs, etc.)
     - Adding full commit diff fetching in `github_activity`
   - **Can we use existing data?** YES - for documentation search, repo context, activity monitoring
   - **For code search:** Need to extend sensors (simple change) or work with docs-only for MVP
   - **Recommendation:** Start with documentation/config files (already available), add code scraping later
   - **Status:** ✅ Resolved

2. **Authentication Scope** ⏳ DECISION NEEDED
   - **Confirmed:** GitHub repos are public → auth is ONLY for internal docs/context
   - **Current System:** MCP has optional `KOI_API_KEY` for rate limiting only (no permission checks)
   - **Options for MVP:**
     - **Option A (Simplest):** Environment variable `ACCESS_TIER=public|partner|developer`
     - **Option B (Better):** Extend existing KOI_API_KEY to include tier info via API endpoint `/auth/verify`
     - **Option C (Future):** Full user auth with email verification
   - **Recommendation:** Start with Option A for MVP, migrate to Option B later
   - **Status:** ⏳ Awaiting user decision

3. **Tool Namespace** ⏳ DECISION NEEDED
   - **Option A:** Flat namespace (e.g., `search_code`, `get_architecture_overview`) with internal access control
   - **Option B:** Prefixed (e.g., `collab:get_architecture`, `dev:analyze_dependencies`)
   - **Recommendation:** Flat namespace - cleaner UX, matches existing tools pattern
   - **Implementation:** Use internal permission checks in `CallToolRequestSchema` handler
   - **Status:** ⏳ Awaiting user decision

4. **Data Availability** ✅ RESOLVED
   - **Database:** PostgreSQL with ~50,000+ documents across sources
   - **GitHub Data Available:**
     - Commit messages, authors, timestamps
     - Issue/PR titles, bodies, comments
     - Documentation files (README, CHANGELOG, .md files)
     - Configuration files (.yaml, .json, .toml)
     - File paths, repo names, branch info
   - **NOT Available:** Source code files, code diffs (yet)
   - **API Endpoints:** Hybrid RAG at port 8301 supports:
     - Semantic search with BGE 1024-dim embeddings
     - Filtering by `source_sensor` (e.g., `github:regen-ledger`)
     - Date range filtering
     - Reciprocal Rank Fusion (vector + keyword + SPARQL)
   - **Status:** ✅ Resolved

### Blockers
- None currently

---

## References to Code/Docs

### Key Files - regen-koi-mcp
- ✅ `src/index.ts:1-1070` - Main MCP server, tool registration, handlers
- ✅ `src/tools.ts:1-91` - Tool schema definitions (search_knowledge, get_stats, generate_weekly_digest)
- ✅ `src/hybrid-client.ts` - Hybrid search (vector + SPARQL with RRF fusion)
- ✅ `src/sparql-client-enhanced.ts` - NL→SPARQL conversion with GPT-4o-mini
- ✅ `server/src/koi_api_server.py` - FastAPI server (optional local deployment)
- ✅ `.env.example` - Configuration template

### Key Files - koi-sensors
- ✅ `sensors/github_activity/github_activity_sensor.py` - GitHub activity tracking (commits, issues, PRs)
- ✅ `sensors/github/github_sensor.py` - GitHub file content scraping (docs, configs)
- ✅ `sensors/gitlab/gitlab_sensor.py` - GitLab sensor (useful patterns)
- ✅ `koi_protocol/nodes/koi_node.py` - KOI protocol implementation
- ✅ `shared/persistent_state.py` - Sensor state management

### Key Files - koi-processor
- ✅ `src/api/koi-query-api.ts` - Hybrid RAG query endpoint (port 8301)
- ✅ `src/database/migrations/` - Database schema (koi_memories, koi_embeddings, koi_kg_extractions)
- ✅ `src/knowledge_graph/graph_integration.py` - RDF graph integration

---

## Testing Plan

### Testing Strategy: Continuous Testing (Integrated with Development)

**Principle:** Test as you build, not after. Each phase includes its own testing.

#### Phase 0: API Validation Tests
```bash
# Test script: scripts/validate-api.sh
# Verify API filtering works before building tools
curl -X POST https://regen.gaiaai.xyz/api/koi/query \
  -H "Content-Type: application/json" \
  -d '{"question": "README", "limit": 5, "filters": {"source_sensor": "github:regen-ledger"}}'
```
- [ ] Document actual `source_sensor` values in production
- [ ] Verify filter syntax and behavior
- [ ] Sample response structure and content quality

#### Phase 1: Tool-Level Tests
```typescript
// Test script: scripts/test-tools.ts
// Run after each tool implementation
async function testSearchGithubDocs() {
  const result = await tool.searchGithubDocs({ query: "governance", limit: 5 });
  assert(result.content[0].text.length > 0, "Should return results");
  assert(!result.content[0].text.includes("Error:"), "Should not error");
}
```
- [ ] Create test harness for invoking tools directly
- [ ] Test each tool as it's implemented
- [ ] Document expected vs actual responses

#### Phase 2: Permission Tests
- [ ] Test tools appear/disappear based on `ACCESS_TIER`
- [ ] Test access denied messages
- [ ] Test tier hierarchy (developer > partner > public)

#### Integration Tests
- [ ] End-to-end MCP client simulation
- [ ] Test with Claude Desktop (manual)
- [ ] Test API timeout/error handling

#### Manual Testing Checklist
| Tool | Happy Path | No Results | Error Case | Edge Cases |
|------|------------|------------|------------|------------|
| `search_github_docs` | [ ] | [ ] | [ ] | [ ] |
| `get_repo_overview` | [ ] | [ ] | [ ] | [ ] |
| `get_tech_stack` | [ ] | [ ] | [ ] | [ ] |

### Test Results
*To be documented during implementation*

---

## Progress Notes

### 2025-11-24

**Completed:**
- ✅ Pulled latest from all repos (all up to date)
- ✅ Created project tracking document
- ✅ Comprehensively explored `regen-koi-mcp` codebase
- ✅ Reviewed GitHub sensors (`github_activity`, `github`, `gitlab`)
- ✅ Assessed production data availability and API capabilities
- ✅ Documented all findings in tracking document
- Noticed new branches in related repos:
  - `koi-sensors`: `kg-rid-integration-v2`
  - `koi-processor`: `kg-rid-integration-v2`, `BGE_Embeddings`

**Key Findings:**
1. **Existing Tools:** 3 tools (search_knowledge, get_stats, generate_weekly_digest) with well-defined patterns
2. **GitHub Data:** Documentation and configs available; source code NOT scraped yet (easy to add)
3. **API Support:** Robust Hybrid RAG at port 8301 with filtering by source_sensor and date ranges
4. **Auth:** Currently only optional API key for rate limiting; no permission system yet
5. **Tool Pattern:** Private methods + switch statement dispatch + error handling

**Next Steps:**
- ⏳ Awaiting user approval on auth approach (env var vs API endpoint)
- ⏳ Awaiting user approval on tool naming (flat vs prefixed)
- Ready to implement once approved

**Questions Raised:**
- Should we use env var `ACCESS_TIER` (simpler) or extend API for permission checks?
- Should we use flat tool names or prefixed (collab:, dev:)?
- Should we start with docs-only code search or extend sensors first?

**Decisions Made:**
- Start with documentation search (data already available)
- Use existing Hybrid RAG API pattern for all queries
- Maintain existing tool architecture patterns

### 2025-11-24 (Continued) - Proposal Review & Improvements

**Completed:**
- ✅ Self-review of implementation proposal
- ✅ Identified 9 areas for improvement
- ✅ Updated tracking document with all improvements

**Key Improvements Made:**

1. **Renamed tools for honesty:**
   - `search_code` → `search_github_docs` (we're not searching code yet)
   - `get_repo_context` → `get_repo_overview` (clearer intent)

2. **Added Phase 0: Validate Data & API**
   - Test API filtering before building anything
   - Document actual `source_sensor` values
   - Verify our assumptions with real requests

3. **Split Phase 1 into 1a (MVP) and 1b:**
   - Phase 1a: Build ONE tool to validate approach
   - Phase 1b: Add remaining tools after feedback
   - Faster time to value (~1 day instead of 2)

4. **Added Error Handling Strategy:**
   - Centralized error handler
   - Explicit responses for each error type
   - User-friendly error messages with suggestions

5. **Added Caching Strategy:**
   - Defined cache durations per tool
   - MVP: No cache (keep simple)
   - Future: Add if performance issues arise

6. **Added Observability & Logging:**
   - Structured logging pattern
   - Tool name, event type, duration, results
   - Console.error for MCP capture

7. **Added Auth Security Note:**
   - Documented that env var is for config, not security
   - Listed limitations and acceptable use cases
   - Outlined future security enhancements

8. **Made testing continuous:**
   - Test as you build, not after
   - Phase 0 has validation tests
   - Each phase includes its own tests

9. **Added validation questions:**
   - 5 questions to answer in Phase 0
   - Ensures we don't build on wrong assumptions

**Decisions Finalized:**
| Decision | Choice |
|----------|--------|
| Auth approach | Env var (Option A) |
| Tool naming | Flat namespace |
| MVP scope | Single tool first |
| Code scraping | Defer |
| Testing | Continuous |

**Next Steps:**
- Begin Phase 0: API validation
- No further approval needed for Phase 0

### 2025-11-24 (Continued) - Phase 0 Validation Complete

**Completed:**
- ✅ Validated production API with curl commands
- ✅ Documented exact `source_sensor` values
- ✅ Identified client-side filtering requirements
- ✅ Reviewed deep research on code search architecture

**Phase 0 Key Findings:**

| Finding | Details |
|---------|---------|
| **API Parameter** | Use `query` (NOT `question` - Phase 1a discovery) |
| **Response Field** | Use `memories` array (NOT `results`) |
| **Server Filters** | ❌ **BROKEN** - `source_sensor` filter returns incorrect results |
| **Available Repos** | regen-ledger, regen-web, regen-data-standards, regenie-corpus |
| **RID Format** | `regen.github:github_{repo}_github_sensor_{id}_{repo}_{filepath}#chunk{n}` |
| **Content Quality** | 8/10 for docs, 6/10 for code (limited source code scraped) |

**Client-Side Filtering Required (Server filters broken - confirmed Phase 1a):**
1. **NO server-side filters** - Don't use `filters.source_sensor` (completely broken)
2. Filter by RID prefix: `rid.startsWith('regen.github:')` (handles 10-20% non-GitHub leakage)
3. Parse RID to extract repository name (API doesn't support per-repo filtering)
4. Deduplicate by filepath (same file appears with different sensor IDs)
5. Request 3x limit to account for client-side filtering

**Recommendation:** ✅ Ready to proceed to Phase 1a

### 2025-11-24 (Continued) - Phase 1a Implementation Complete

**Implementation Summary:**
- ✅ Build successful with zero TypeScript errors
- ✅ Test results: 3/5 passed (60%) - failures are API content gaps, not bugs
- ✅ Manual verification: GitHub content IS accessible and correctly filtered

**Files Modified:**
- `src/tools.ts`: Added tool schema with repository enum (27 lines)
- `src/index.ts`: Added helper methods + main implementation (166 lines)

**Helper Methods Implemented:**
- `extractRepoFromRid()` - Parses repository name from RID patterns
- `extractFilepathFromRid()` - Extracts filepath for deduplication
- `formatGithubDocsResults()` - Formats results as markdown

**Key Implementation Decisions:**
- Uses `query` parameter (Phase 0 discovery: `question` causes "Field required" error)
- Reads `memories` field (Phase 0 discovery: `results` doesn't exist)
- NO server-side filters (Phase 1a discovery: they're completely broken)
- 100% client-side filtering by RID prefix
- Requests 3x limit to account for filtering losses
- Comprehensive error handling with specific messages for ECONNREFUSED, ETIMEDOUT

**Next Step:** Phase 1b - Implement `get_repo_overview` and `get_tech_stack` tools

### 2025-11-24 (Continued) - Deep Research Review

**Completed:**
- ✅ Reviewed research document: "Building an agentic codebase interface for GitHub organizations"
- ✅ Identified gaps between current architecture and state-of-the-art
- ✅ Created future architecture roadmap
- ✅ Documented as "Future Architecture" section below

**Key Insight from Research:**
> "Treating code like natural language text is a fundamental mistake"

**Current State vs Research Recommendations:**
| Aspect | Current (MVP) | Research Recommendation |
|--------|---------------|------------------------|
| Embeddings | BGE (general-purpose) | voyage-code-3 (code-specific, +38% better) |
| Chunking | Character-based text | Tree-sitter AST-based |
| Search | Vector + SPARQL | Vector + BM25 + Graph + Cross-encoder |
| Code Parsing | None | Tree-sitter with language grammars |
| Knowledge Graph | Basic SPARQL | FalkorDB with code schema |

**Decision:** MVP approach is correct. Add sophistication based on observed gaps after deployment.

---

## Configuration Requirements

### Environment Variables (TBD)
- [ ] `AUTH_ENDPOINT` - Production server auth endpoint
- [ ] `ALLOWED_EMAILS` - List of authorized emails (if using config approach)
- [ ] `DEVELOPER_ROLES` - Roles with developer access
- [ ] Other auth-related config...

### API Requirements (TBD)
- [ ] Existing API endpoints we'll use
- [ ] New API endpoints needed (if any)

---

## Success Criteria

- [ ] All planned tools implemented and functional
- [ ] Tiered access system working correctly
- [ ] Existing tools continue to work without issues
- [ ] Comprehensive test coverage
- [ ] Clear documentation for setup and usage
- [ ] Successfully deployed to production
- [ ] User feedback incorporated

---

## Timeline & Milestones

*Note: Per project constraints, no time estimates. Focus on what needs to be done.*

**Milestones (Revised):**
1. ✅ Research & Planning Complete
2. ✅ Proposal Review & Improvements Complete
3. ✅ Phase 0: API Validation Complete
4. 🔲 Phase 1a: Single Tool MVP (`search_github_docs`) Deployed
5. 🔲 Phase 1b: All Public Tools Complete
6. 🔲 Phase 2: Auth Layer Complete
7. 🔲 Phase 3: Partner Tools Complete
8. 🔲 Phase 4: Developer Tools Complete
9. 🔲 Future: Advanced Code Search (tree-sitter, code embeddings)
10. 🔲 Production Ready

---

## Notes & Observations

### Architecture Observations

1. **MCP Server Architecture:**
   - Uses `@modelcontextprotocol/sdk` v1.20.0
   - StdioServerTransport for communication with MCP clients
   - Switch-based tool dispatch pattern
   - All tools return `{ content: [{ type: 'text', text: string }] }`

2. **API Integration Pattern:**
   - Uses axios HTTP client with 30s timeout
   - Connects to `https://regen.gaiaai.xyz/api/koi` (configurable)
   - Optional Bearer token auth via `KOI_API_KEY`
   - Fallback strategies for search (hybrid → vector-only)

3. **Data Flow:**
   ```
   Sensors → KOI Coordinator (8005) → Event Bridge (8100) → Processor
                                                                  ↓
   PostgreSQL (koi_memories + koi_embeddings) ← BGE Server (8090)
                                                                  ↓
   Hybrid RAG API (8301) ← MCP Server ← Claude Desktop/Cline
   ```

4. **Search Capabilities:**
   - **Hybrid RAG:** Vector (BGE 1024-dim) + Keyword (PostgreSQL FTS) + SPARQL
   - **RRF Fusion:** Reciprocal Rank Fusion combines results from all branches
   - **Filtering:** By source_sensor, date ranges, include_undated flag
   - **Default Limit:** 5 results (max 20)

5. **GitHub Sensor Coverage:**
   - **Repos Monitored:** regen-ledger, regen-web, regen-data-standards, regenie-corpus, mcp
   - **Activity Sensor:** Polls every 30 min, 24-hour lookback, captures commit messages/issues/PRs
   - **File Sensor:** Runs hourly, clones repos, extracts .md/.yaml/.json files only
   - **Missing:** Source code files (.py, .ts, .rs, .go), code diffs

### Code Patterns

1. **Tool Implementation Pattern:**
   ```typescript
   private async myTool(args: any) {
     try {
       // 1. Parse and validate args
       // 2. Call API or perform operation
       // 3. Format results as markdown
       return { content: [{ type: 'text', text: formattedResult }] };
     } catch (error) {
       // Return error as text, don't throw
       return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
     }
   }
   ```

2. **Error Handling:**
   - All errors caught and returned as text responses
   - Console.error logging for debugging
   - Fallback strategies (e.g., hybrid → vector search)

3. **Date Parsing:**
   - Natural language date inference ("past week" → date range)
   - ISO8601 format for API communication
   - Defaults to 7 days for weekly digest

4. **Markdown Formatting:**
   - All results formatted as markdown for readability
   - Uses headers, bullet points, code blocks
   - Includes metadata (source, URL, author, date)

### Potential Challenges

1. **Code Search Without Source Code:**
   - Current sensors only scrape docs/configs, not source code
   - **Mitigation:** Start with doc search, extend sensors later OR scope to "documentation search" initially

2. **Authentication Complexity:**
   - No existing permission system in MCP or API
   - **Mitigation:** Start simple with env var, enhance later

3. **Tool Discovery:**
   - All tools visible in ListTools response regardless of access
   - **Mitigation:** Filter tools in ListTools handler based on access tier

4. **API Rate Limiting:**
   - Current API has no explicit rate limiting
   - **Mitigation:** Use existing KOI_API_KEY for future rate limit enforcement

5. **Testing Without Production Data:**
   - Testing requires production database connection
   - **Mitigation:** Create test script that mocks API responses OR test against prod (carefully)

6. **Backward Compatibility:**
   - Must not break existing tools or clients
   - **Mitigation:** Only add new tools, don't modify existing ones

---

## Error Handling Strategy

### Standard Error Response Pattern
```typescript
private async toolName(args: any) {
  try {
    const response = await apiClient.post('/query', {...});

    // Handle empty results
    if (!response.data?.results?.length) {
      return { content: [{ type: 'text',
        text: `No results found for "${args.query}" in GitHub documentation.\n\n**Suggestions:**\n- Try broader search terms\n- Check repository name spelling\n- Use \`search_knowledge\` for non-GitHub content`
      }]};
    }

    // Success path
    return { content: [{ type: 'text', text: formatResults(response.data.results) }]};

  } catch (error) {
    return this.handleError(error, 'search_github_docs');
  }
}

// Centralized error handler
private handleError(error: any, toolName: string) {
  console.error(`[regen-koi] ${toolName} error:`, error);

  if (error.code === 'ECONNREFUSED') {
    return { content: [{ type: 'text',
      text: 'KOI API is currently unavailable. Please try again later or check your network connection.'
    }]};
  }

  if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
    return { content: [{ type: 'text',
      text: 'Request timed out. The server may be busy. Please try again with a smaller limit.'
    }]};
  }

  if (error.response?.status === 429) {
    return { content: [{ type: 'text',
      text: 'Rate limit exceeded. Please wait a moment before trying again.'
    }]};
  }

  // Generic error fallback
  return { content: [{ type: 'text',
    text: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`
  }]};
}
```

### Error Scenarios to Handle
| Scenario | Response | User Action |
|----------|----------|-------------|
| API unavailable | "KOI API is currently unavailable..." | Retry later |
| No results | "No results found for..." + suggestions | Broaden query |
| Rate limited | "Rate limit exceeded..." | Wait and retry |
| Timeout | "Request timed out..." | Reduce limit |
| Invalid repo | "Repository not found..." | Check name |
| Malformed response | Log + generic error | Report issue |

---

## Caching Strategy

### Cache Recommendations
| Tool | Cache Duration | Rationale |
|------|----------------|-----------|
| `search_github_docs` | No cache | Results should be fresh |
| `get_repo_overview` | 1 hour | Repo overview changes slowly |
| `get_tech_stack` | 24 hours | Dependencies rarely change |

### Implementation (Future Enhancement)
```typescript
// Simple in-memory cache for MVP
class SimpleCache {
  private cache = new Map<string, { data: any; expiry: number }>();

  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  set(key: string, data: any, ttlMs: number): void {
    this.cache.set(key, { data, expiry: Date.now() + ttlMs });
  }
}

// Usage in get_repo_overview
private async getRepoOverview(args: any) {
  const cacheKey = `repo_overview:${args.repository}`;
  const cached = this.cache.get(cacheKey);
  if (cached) return cached;

  const result = await this.fetchRepoOverview(args);
  this.cache.set(cacheKey, result, 60 * 60 * 1000); // 1 hour
  return result;
}
```

### MVP Approach
- **Phase 1:** No caching (keep it simple, validate approach first)
- **Future:** Add caching if performance issues arise

---

## Observability & Logging Strategy

### Structured Logging Pattern
```typescript
// Log format: [regen-koi] Tool=name Event=type Details...
console.error(`[regen-koi] Tool=${name} Event=start Query="${args.query?.substring(0, 50)}"`);
console.error(`[regen-koi] Tool=${name} Event=success Results=${results.length} Duration=${ms}ms`);
console.error(`[regen-koi] Tool=${name} Event=error Code=${error.code} Message="${error.message}"`);
console.error(`[regen-koi] Tool=${name} Event=no_results Query="${args.query}"`);
```

### Metrics to Track (Future)
- Tool invocation count by tool name
- Response time percentiles (p50, p95, p99)
- Error rate by error type
- Cache hit/miss ratio
- Results count distribution

### MVP Approach
- Use `console.error` for all logging (captured by MCP transport)
- Include: tool name, event type, duration, result count
- Log errors with stack traces for debugging

---

## Authentication Security Note

**Important:** The environment variable approach (`ACCESS_TIER`) is for **configuration**, not **security**.

### Limitations
- Anyone with shell access can set `ACCESS_TIER=developer`
- No user identity verification
- No audit trail of who accessed what

### When This Is Acceptable
- Trusted operator deployments (e.g., internal team)
- MVP phase where ease of setup > security
- When data being protected isn't highly sensitive

### Future Security Enhancements
- API-based auth with token verification
- User identity via OAuth/SSO
- Audit logging of tool usage
- Rate limiting per user

---

## Implementation Proposal

### Executive Summary

Based on comprehensive exploration of the codebase and data infrastructure, I propose a **phased implementation approach**:

1. **Phase 0:** Validate API and data before any coding
2. **Phase 1a:** Build single tool MVP to validate approach
3. **Phase 1b:** Complete remaining public tools
4. **Phase 2+:** Add auth and advanced tools based on feedback

This approach minimizes risk by validating assumptions early.

---

### Phase 0: Validate Data & API (Before Coding)

**Goal:** Verify our assumptions before writing any code

**Tasks:**
```bash
# 1. Test that source_sensor filtering works
curl -X POST https://regen.gaiaai.xyz/api/koi/query \
  -H "Content-Type: application/json" \
  -d '{"question": "README", "limit": 5, "filters": {"source_sensor": "github:regen-ledger"}}'

# 2. List available source_sensors
# Need to check what exact values exist in production

# 3. Test if wildcard patterns work
curl -X POST https://regen.gaiaai.xyz/api/koi/query \
  -H "Content-Type: application/json" \
  -d '{"question": "package.json", "limit": 5, "filters": {"source_sensor": "github:*"}}'

# 4. Sample response quality
# Check that results contain useful content for documentation search
```

**Deliverables:**
- [ ] Document exact `source_sensor` values available
- [ ] Confirm filter syntax works
- [ ] Sample response structure documented
- [ ] Create `scripts/validate-api.sh` test script

**Effort:** 2-4 hours

---

### Phase 1a: Single Tool MVP

**Goal:** Build ONE tool to validate the entire approach before investing more

#### Tool: `search_github_docs` - Documentation & Config Search

**Why this tool first:**
- Most generally useful (everyone needs search)
- Validates API integration pattern
- Validates filter approach
- Easy to test and get feedback

**Implementation:**
```typescript
private async searchGithubDocs(args: any) {
  const startTime = Date.now();
  const { query, repository, file_type, limit = 10 } = args;

  console.error(`[regen-koi] Tool=search_github_docs Event=start Query="${query.substring(0, 50)}"`);

  try {
    // Build filters for GitHub sources
    const filters: any = {};
    if (repository) {
      filters.source_sensor = `github:${repository}`;
    }
    // Note: Validate in Phase 0 if we need different filter approach for "all GitHub"

    // Call Hybrid RAG API
    const response = await apiClient.post('/query', {
      question: query,
      limit: limit,
      filters: filters
    });

    const results = response.data?.results || [];
    const duration = Date.now() - startTime;

    // Handle no results
    if (results.length === 0) {
      console.error(`[regen-koi] Tool=search_github_docs Event=no_results Duration=${duration}ms`);
      return { content: [{ type: 'text',
        text: `No results found for "${query}" in GitHub documentation.\n\n**Suggestions:**\n- Try broader search terms\n- Check repository name spelling\n- Use \`search_knowledge\` for non-GitHub content`
      }]};
    }

    console.error(`[regen-koi] Tool=search_github_docs Event=success Results=${results.length} Duration=${duration}ms`);

    // Format results as markdown
    return { content: [{ type: 'text', text: this.formatGithubDocsResults(results, query) }]};

  } catch (error) {
    console.error(`[regen-koi] Tool=search_github_docs Event=error`, error);
    return this.handleError(error, 'search_github_docs');
  }
}

private formatGithubDocsResults(results: any[], query: string): string {
  let output = `## GitHub Documentation Search Results\n\n`;
  output += `**Query:** "${query}"\n`;
  output += `**Results:** ${results.length} documents found\n\n`;

  results.forEach((result, index) => {
    const title = result.metadata?.title || result.rid || 'Untitled';
    const url = result.metadata?.url || '';
    const source = result.metadata?.source || 'github';
    const score = result.score ? `(relevance: ${(result.score * 100).toFixed(0)}%)` : '';
    const content = result.content?.substring(0, 300) || '';

    output += `### ${index + 1}. ${title} ${score}\n`;
    if (url) output += `**URL:** ${url}\n`;
    output += `**Source:** ${source}\n\n`;
    output += `${content}${content.length >= 300 ? '...' : ''}\n\n`;
    output += `---\n\n`;
  });

  return output;
}
```

**Schema:**
```typescript
{
  name: 'search_github_docs',
  description: 'Search Regen Network GitHub repositories for documentation, README files, configuration files, and technical content. Note: Currently searches documentation and config files only, not source code.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query (e.g., "governance voting", "ecocredit module", "validator setup")'
      },
      repository: {
        type: 'string',
        description: 'Filter by specific repo (e.g., "regen-ledger", "regen-web"). Omit to search all repos.',
        enum: ['regen-ledger', 'regen-web', 'regen-data-standards', 'regenie-corpus', 'mcp']
      },
      limit: {
        type: 'number',
        minimum: 1,
        maximum: 20,
        default: 10,
        description: 'Maximum number of results to return'
      }
    },
    required: ['query']
  }
}
```

**Test Script:**
```typescript
// scripts/test-search-github-docs.ts
async function test() {
  const testCases = [
    { query: "governance voting", expected: "should return governance docs" },
    { query: "README regen-ledger", repository: "regen-ledger", expected: "should return ledger README" },
    { query: "xyznonexistent123", expected: "should return no results gracefully" },
  ];

  for (const tc of testCases) {
    const result = await searchGithubDocs(tc);
    console.log(`Test: ${tc.expected}`);
    console.log(`Result: ${result.content[0].text.substring(0, 200)}...`);
    console.log('---');
  }
}
```

**Effort:** 4-6 hours (including tests)

---

### Phase 1b: Complete Public Tools

**Goal:** Add remaining public tools after MVP validation

#### Tool 2: `get_repo_overview` - Repository Overview
**What it does:** Get high-level overview of a specific repository

**Implementation:**
```typescript
private async getRepoOverview(args: any) {
  const { repository } = args;

  // Query for README and key docs
  const readmeResults = await apiClient.post('/query', {
    question: `${repository} README overview architecture purpose`,
    limit: 5,
    filters: { source_sensor: `github:${repository}` }
  });

  // Format as repository overview
  return { content: [{ type: 'text', text: this.formatRepoOverview(repository, readmeResults.data?.results || []) }]};
}
```

**Schema:**
```typescript
{
  name: 'get_repo_overview',
  description: 'Get overview of a Regen Network GitHub repository including its purpose, architecture, and key documentation',
  inputSchema: {
    type: 'object',
    properties: {
      repository: {
        type: 'string',
        enum: ['regen-ledger', 'regen-web', 'regen-data-standards', 'regenie-corpus', 'mcp'],
        description: 'Repository name'
      }
    },
    required: ['repository']
  }
}
```

**Effort:** 3-4 hours

---

#### Tool 3: `get_tech_stack` - Technology Overview
**What it does:** Provide overview of Regen's technical stack

**Implementation:**
```typescript
private async getTechStack(args: any) {
  const { detail_level = 'basic' } = args;

  // Search for dependency/config files
  const techResults = await apiClient.post('/query', {
    question: 'package.json go.mod Cargo.toml requirements.txt dependencies technology',
    limit: 15
    // Note: May need to adjust filter based on Phase 0 findings
  });

  return { content: [{ type: 'text', text: this.formatTechStack(techResults.data?.results || [], detail_level) }]};
}
```

**Schema:**
```typescript
{
  name: 'get_tech_stack',
  description: 'Get overview of Regen Network technical stack and technologies used across repositories',
  inputSchema: {
    type: 'object',
    properties: {
      detail_level: {
        type: 'string',
        enum: ['basic', 'detailed'],
        default: 'basic',
        description: 'Level of detail: basic (summary) or detailed (with versions)'
      }
    }
  }
}
```

**Effort:** 2-3 hours

**Phase 1b Total Effort:** 5-7 hours

---

### Phase 2: Authentication Layer

**Goal:** Add simple environment-based access control

#### Recommended Approach: Environment Variable (MVP)

**Implementation:**
```typescript
// In index.ts
const ACCESS_TIER = process.env.ACCESS_TIER || 'public'; // public | partner | developer

// Permission mapping (updated tool names)
const TOOL_PERMISSIONS: Record<string, string[]> = {
  // Existing tools (public)
  'search_knowledge': ['public', 'partner', 'developer'],
  'get_stats': ['public', 'partner', 'developer'],
  'generate_weekly_digest': ['public', 'partner', 'developer'],
  // New public tools
  'search_github_docs': ['public', 'partner', 'developer'],
  'get_repo_overview': ['public', 'partner', 'developer'],
  'get_tech_stack': ['public', 'partner', 'developer'],
  // Partner tools
  'get_architecture_overview': ['partner', 'developer'],
  'search_integration_guides': ['partner', 'developer'],
  'get_tech_stack_deep': ['partner', 'developer'],
  // Developer tools
  'analyze_dependencies': ['developer'],
  'get_implementation_details': ['developer'],
  'search_internal_docs': ['developer']
};

// Filter tools in ListTools handler
private getAvailableTools(): Tool[] {
  return TOOLS.filter(tool => {
    const requiredTiers = TOOL_PERMISSIONS[tool.name] || ['public'];
    return this.hasAccess(ACCESS_TIER, requiredTiers);
  });
}

private hasAccess(userTier: string, requiredTiers: string[]): boolean {
  const tierHierarchy = { 'public': 0, 'partner': 1, 'developer': 2 };
  const userLevel = tierHierarchy[userTier] || 0;
  const requiredLevel = Math.min(...requiredTiers.map(t => tierHierarchy[t] || 0));
  return userLevel >= requiredLevel;
}

// Update ListTools handler
this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: this.getAvailableTools()
}));

// Update CallTool handler
this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // Check permission
  const requiredTiers = TOOL_PERMISSIONS[name] || ['public'];
  if (!this.hasAccess(ACCESS_TIER, requiredTiers)) {
    return {
      content: [{
        type: 'text',
        text: `Error: Access denied. This tool requires ${requiredTiers.join(' or ')} access.`
      }]
    };
  }

  // ... existing switch statement
});
```

**Configuration:**
```bash
# In .env
ACCESS_TIER=public    # For public users
ACCESS_TIER=partner   # For partner/collaborators
ACCESS_TIER=developer # For internal developers
```

**Phase 2 Effort:** ~4 hours

---

### Phase 3: Partner/Collaborator Tools

#### Tool 4: `get_architecture_overview`
**What it does:** Deep dive into Regen system architecture, component relationships, data flow

**Implementation:**
- Search for architecture docs, design docs, system diagrams
- Could use weekly digest generator as pattern (aggregate multiple sources)
- Format as comprehensive architecture guide

**Data Source:** Internal architecture documentation (would need to be added to sensors)
**Effort:** ~4 hours

---

#### Tool 5: `search_integration_guides`
**What it does:** Search internal guides for integrating with Regen systems

**Implementation:**
- Similar to search_code but filtered to integration-specific docs
- Could use tags/metadata to identify integration guides

**Data Source:** Internal integration documentation
**Effort:** ~3 hours

---

#### Tool 6: `get_tech_stack_deep`
**What it does:** Detailed technical stack with internal decisions, rationale, trade-offs

**Implementation:**
- Enhanced version of get_tech_stack
- Includes ADRs (Architecture Decision Records), design rationale
- Links to relevant discussions/proposals

**Data Source:** ADRs, internal tech docs, governance proposals
**Effort:** ~3 hours

**Phase 3 Total Effort:** ~10 hours

---

### Phase 4: Developer Tools

#### Tool 7: `analyze_dependencies`
**What it does:** Cross-repo dependency analysis, version conflicts, upgrade paths

**Implementation:**
- Parse package.json, go.mod, Cargo.toml from all repos
- Identify shared dependencies, version mismatches
- Suggest upgrade paths

**Data Source:** Config files from GitHub
**Effort:** ~6 hours (more complex analysis logic)

---

#### Tool 8: `get_implementation_details`
**What it does:** Deep implementation context for specific features/modules

**Implementation:**
- Semantic search + code structure analysis
- Could integrate with knowledge graph for entity relationships
- Provides implementation timeline, contributors, related issues/PRs

**Data Source:** GitHub activity + code files + KG extractions
**Effort:** ~5 hours

---

#### Tool 9: `search_internal_docs`
**What it does:** Search internal technical docs (Notion, Confluence, internal wikis)

**Implementation:**
- Extends search_knowledge with internal doc filtering
- Would require sensors for internal sources (Notion sensor likely exists)

**Data Source:** Internal documentation sources
**Effort:** ~3 hours (assuming sensors exist)

**Phase 4 Total Effort:** ~14 hours

---

### Phase 5: Testing & Documentation

**Testing Tasks:**
1. Unit tests for each tool (~2 hours per tool = ~18 hours)
2. Integration tests for API calls (~4 hours)
3. Permission/auth tests (~3 hours)
4. Manual test script (~2 hours)
5. End-to-end testing (~4 hours)

**Documentation Tasks:**
1. Update README with new tools (~2 hours)
2. Document authentication setup (~1 hour)
3. Add usage examples (~2 hours)
4. Update .env.example (~30 min)

**Phase 5 Total Effort:** ~36 hours

---

### Total Project Estimate (Revised)

| Phase | Description | Effort |
|-------|-------------|--------|
| Phase 0 | Validate API & Data | 2-4 hours |
| Phase 1a | Single Tool MVP (`search_github_docs`) | 4-6 hours |
| Phase 1b | Complete Public Tools | 5-7 hours |
| Phase 2 | Auth Layer | 4 hours |
| Phase 3 | Partner Tools | 10 hours |
| Phase 4 | Developer Tools | 14 hours |

**MVP (Phases 0-1a): 6-10 hours (~1 day)**
**Full Public Tools (Phases 0-1b): 11-17 hours (~2 days)**
**Total (All Phases): 39-45 hours (~5-6 days)**

*Note: Estimates reduced because testing is now integrated into each phase.*

---

### Recommended Starting Point (Revised)

**True MVP Approach:**
1. ✅ Complete research & planning (DONE)
2. ✅ Review and improve proposal (DONE)
3. **Phase 0:** Validate API filtering with real requests (2-4 hours)
4. **Phase 1a:** Build `search_github_docs` only (4-6 hours)
5. Deploy, test, get feedback
6. **Phase 1b:** Add remaining tools based on feedback
7. Proceed with Phases 2-4 as needed

**This gives you a working tool in ~1 day** instead of waiting for all 3 tools.

---

### Decisions Made (Based on Review)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Auth approach** | Env var (Option A) | Simplest for MVP; document security limitations |
| **Tool naming** | Flat namespace | Cleaner UX, matches existing patterns |
| **Tool names** | Renamed for honesty | `search_github_docs` not `search_code` (we're not searching code yet) |
| **Code scraping** | Defer | Start with existing docs data; extend sensors later if needed |
| **MVP scope** | Single tool first | Validate approach before building all 3 tools |
| **Testing** | Continuous | Test each phase, not all at end |

---

### Validation Questions (To Answer in Phase 0)

1. **What `source_sensor` values exist in production?**
   - Need exact list to configure tool filters correctly

2. **Does `source_sensor` filtering work as expected?**
   - Test with actual API calls before building tools

3. **What's the response structure?**
   - Verify `results`, `metadata`, `content` fields exist

4. **Do wildcard patterns work?**
   - Test `github:*` or need alternative approach

5. **What's the content quality?**
   - Sample responses to ensure useful for documentation search

---

### Risk Mitigation (Updated)

1. **Assumption Validation:** Phase 0 validates API behavior before coding
2. **Single Tool MVP:** Validate approach with 1 tool before building 3
3. **Backward Compatibility:** Only add new tools, never modify existing
4. **Honest Naming:** Tool names accurately describe capabilities
5. **Testing:** Continuous testing integrated into each phase
6. **Error Handling:** Explicit strategy for all error scenarios
7. **Observability:** Structured logging from day one
8. **Rollback:** Git tags at each phase for easy rollback

---

### Next Steps

**Immediate (No Approval Needed):**
1. Begin **Phase 0** - Validate API with test requests
2. Document findings in this tracking document

**After Phase 0:**
3. Implement **Phase 1a** - `search_github_docs` tool
4. Test and deploy MVP
5. Get feedback before proceeding to Phase 1b

---

## Future Architecture: Advanced Code Search

*Based on deep research: "Building an agentic codebase interface for GitHub organizations"*
*Reference: `/Users/darrenzal/projects/RegenAI/regen-koi-mcp/full stack tech agent/agentic codebase interface.md`*

### Executive Summary

The current MVP architecture (BGE embeddings + text chunking) is appropriate for documentation search. For **true code search** at production scale, the research recommends a significantly more sophisticated architecture combining:

1. **Code-specific embeddings** (voyage-code-3)
2. **AST-based chunking** (tree-sitter)
3. **Three-modality hybrid search** (Vector + BM25 + Graph)
4. **Code knowledge graph** (FalkorDB)
5. **Cosmos SDK-aware schema**

### Current vs Target Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CURRENT ARCHITECTURE (MVP)                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  GitHub Sensor ──► Text Chunking ──► BGE Embeddings ──► PostgreSQL/pgvector│
│  (docs only)       (character)       (general-purpose)                      │
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
│                      TARGET ARCHITECTURE (Future)                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  GitHub Sensor ──► Tree-sitter ──► voyage-code-3 ──► Qdrant/pgvector       │
│  (docs + code)     AST Parser      (code-specific)                          │
│       │                │                                                    │
│       │                └──► Code Knowledge Graph (FalkorDB)                 │
│       │                     - Functions, Types, Interfaces                  │
│       │                     - CALLS, IMPLEMENTS relationships               │
│       │                     - Cosmos SDK: Keepers, Handlers, Protos        │
│       │                                                                     │
│       └──► BM25 Index (Tantivy/VectorChord-BM25)                           │
│            - Exact function names                                           │
│            - Error messages                                                 │
│            - API identifiers                                                │
│                                                                             │
│                              ▼                                              │
│                    Three-Modality Hybrid Search                             │
│              (Vector + BM25 + Graph) with RRF Fusion                        │
│                              ▼                                              │
│                    Cross-encoder Reranking                                  │
│                              ▼                                              │
│                        MCP Tools                                            │
│      (search_code, get_call_graph, get_symbol_definition, etc.)            │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Technologies Recommended

#### 1. Code-Specific Embeddings

| Model | Dimensions | Performance | Use Case |
|-------|------------|-------------|----------|
| **voyage-code-3** | 256-2048 | Best overall (+38% vs BGE) | Production search |
| CodeT5+ | 256 | Strong NL↔code alignment | Self-hosted option |
| GraphCodeBERT | 768 | Includes data flow graphs | Structural analysis |
| StarCoder2 | 1024 | 80+ language support | Code generation |

**Recommendation:** voyage-code-3 for API, CodeT5+ for self-hosted/cost-sensitive

#### 2. AST-Based Chunking with Tree-sitter

```python
# Future sensor enhancement
import tree_sitter_go

def chunk_go_file(content: str) -> List[CodeChunk]:
    parser = tree_sitter.Parser()
    parser.set_language(tree_sitter_go.language())
    tree = parser.parse(bytes(content, 'utf8'))

    chunks = []
    for node in traverse_tree(tree.root_node):
        if node.type in ['function_declaration', 'type_declaration',
                          'method_declaration', 'interface_type']:
            chunks.append(CodeChunk(
                content=content[node.start_byte:node.end_byte],
                node_type=node.type,
                name=extract_name(node),
                signature=extract_signature(node),
                docstring=extract_doc_comment(node),
                # Cosmos SDK specific
                is_keeper=detect_keeper_pattern(node),
                is_msg_handler=detect_msg_handler(node)
            ))
    return chunks
```

**Benefits:**
- Preserves semantic boundaries (functions, types, methods)
- Includes context (signatures, doc comments, imports)
- Enables structural search patterns
- Incremental parsing (only re-parse changed portions)

#### 3. Three-Modality Hybrid Search

```
┌─────────────────────────────────────────────────────────────┐
│                   User Query                                 │
│        "how does the ecocredit keeper handle claims"        │
└─────────────────────────────────────────────────────────────┘
                              │
           ┌──────────────────┼──────────────────┐
           ▼                  ▼                  ▼
    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
    │   Vector    │    │   BM25      │    │   Graph     │
    │   Search    │    │   Search    │    │   Query     │
    │  (semantic) │    │  (keyword)  │    │ (structural)│
    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘
           │                  │                  │
           │     "ecocredit"  │     Keeper →     │
           │     "claims"     │     Handles →    │
           │                  │     EcoCreditMsg │
           │                  │                  │
           └──────────────────┼──────────────────┘
                              ▼
              ┌─────────────────────────────────┐
              │  Reciprocal Rank Fusion (RRF)   │
              │  score = Σ 1/(k + rank_i)       │
              └─────────────────────────────────┘
                              │
                              ▼
              ┌─────────────────────────────────┐
              │   Cross-encoder Reranking       │
              │   (ms-marco-MiniLM or similar)  │
              └─────────────────────────────────┘
                              │
                              ▼
                       Final Results
```

#### 4. Cosmos SDK-Specific Schema

```yaml
# Structural entities (AST-extracted, ground truth)
Repository:
  name: string
  url: string
  cosmos_sdk_version: string

CosmosModule:
  name: string           # e.g., "ecocredit", "data"
  path: string           # e.g., "x/ecocredit"
  keeper_type: string    # e.g., "Keeper"
  msg_types: [string]    # e.g., ["MsgCreateClass", "MsgCreateBatch"]
  query_types: [string]  # e.g., ["QueryClassInfo", "QueryBatches"]

Function:
  name: string
  signature: string
  return_type: string
  complexity: int        # cyclomatic complexity
  docstring: string

ProtobufMessage:
  name: string
  package: string
  fields: [Field]

# Relationships (combination of AST + inference)
CONTAINS: Repository → Module → Package → File → Function
CALLS: Function → Function
IMPLEMENTS: Struct → Interface
MSG_HANDLER: ProtobufMessage → Function
KEEPER_ACCESSES: Keeper → KVStore
CROSS_REPO_DEPENDS: Repository → Repository
```

### Future MCP Tool Categories

Following GitHub MCP Server pattern:

```typescript
// Context Tools
'get_repository_list'        // List all indexed repos
'get_module_map'             // Cosmos SDK module structure
'get_current_project'        // Active working context

// Search Tools (Enhanced)
'search_code'                // Hybrid three-modality search
'search_github_docs'         // Current MVP tool
'ast_search'                 // Structural pattern matching
'semantic_search'            // Pure embedding search

// Navigation Tools
'get_file_contents'          // Retrieve full file
'get_symbol_definition'      // Jump to definition
'find_references'            // Find all usages
'get_type_hierarchy'         // Interface implementations

// Analysis Tools
'analyze_dependencies'       // Cross-repo dependencies
'get_call_graph'             // Function call relationships
'get_module_structure'       // Cosmos SDK module internals
'get_keeper_access_patterns' // State access analysis

// Documentation Tools
'search_docs'                // Technical documentation
'get_related_documentation'  // Link code to docs
```

### Implementation Roadmap (Post-MVP)

| Phase | Focus | Key Deliverables |
|-------|-------|------------------|
| **Future Phase A** | Tree-sitter Integration | AST-based chunking in GitHub sensor |
| **Future Phase B** | Code Embeddings | Integrate voyage-code-3 or CodeT5+ |
| **Future Phase C** | BM25 Search | Add Tantivy/VectorChord-BM25 for keyword search |
| **Future Phase D** | Code Knowledge Graph | FalkorDB with code schema |
| **Future Phase E** | Cosmos SDK Schema | Keeper, handler, proto entity extraction |
| **Future Phase F** | Advanced Tools | Call graph, symbol navigation, structural search |

### Sensor Enhancements Required

#### GitHub Sensor Changes

```python
# Current: Text-only extensions
doc_extensions = ['*.md', '*.yaml', '*.json']

# Future: Add source code
code_extensions = [
    '*.go',          # Cosmos SDK primary language
    '*.proto',       # Protobuf definitions
    '*.ts', '*.tsx', # Frontend (regen-web)
    '*.py',          # Scripts and tools
    '*.rs',          # Rust components
    '*.js',          # JavaScript
]

# Future: AST parsing configuration
ast_config = {
    'go': {
        'parser': 'tree-sitter-go',
        'extract': ['function_declaration', 'type_declaration',
                    'method_declaration', 'interface_type'],
        'cosmos_patterns': ['keeper', 'msg_server', 'query_server']
    },
    'proto': {
        'parser': 'tree-sitter-protobuf',
        'extract': ['message', 'service', 'rpc']
    }
}
```

#### Processor Changes

```python
# Current: Single embedding model
def generate_embedding(content: str) -> List[float]:
    return bge_client.embed(content)

# Future: Content-type aware embedding
def generate_embedding(content: str, content_type: str) -> List[float]:
    if content_type in ['go', 'python', 'typescript', 'proto']:
        return voyage_client.embed(content, model='voyage-code-3')
    else:
        return bge_client.embed(content)  # Keep BGE for docs
```

### Anti-Patterns to Avoid (From Research)

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Generic text tokenizers | Breaks on code punctuation | Use code-aware tokenizers |
| Embeddings only | Misses exact matches | Add BM25 keyword search |
| Ignoring ranking | Finds results, not best results | RRF + cross-encoder reranking |
| Sharding by repository | Uneven distribution | Shard by git blob object ID |
| Full re-indexing | Too slow at scale | Incremental via webhooks |
| LLM-only entity extraction | Hallucination risk | AST extraction for structure |

### Local Development: Sensor Debugging

When debugging sensors that depend on production state:

#### Option 1: State Export API
```bash
# Add to production server
GET /api/koi/debug/sensor-state?sensor=github
# Returns: { processed_items: [...], content_hashes: {...}, last_run: "..." }
```

#### Option 2: Database Snapshot (Sensor State Only)
```bash
# Export sensor state tables (small)
pg_dump -t sensor_state -t processed_items eliza > sensor_state.sql
scp server:sensor_state.sql .
psql -d local_eliza < sensor_state.sql
```

#### Option 3: Mock Webhook Server
```bash
# Replay GitHub webhook events locally for testing
npx github-webhook-replay --event push --repo regen-ledger
```

### Reference Implementations

| Project | Key Learning | Link |
|---------|--------------|------|
| github/github-mcp-server | Tool organization, read-only mode | GitHub |
| zilliztech/claude-context | AST chunking, hybrid search | GitHub |
| johnhuang316/code-index-mcp | Multi-language tree-sitter | GitHub |
| ast-grep/ast-grep-mcp | Structural search, YAML rules | GitHub |
| vitali87/code-graph-rag | Tree-sitter + Memgraph | GitHub |

### Resource Estimates (96-Repo Scale)

| Resource | Estimate | Notes |
|----------|----------|-------|
| Vector embeddings | 2-5 GB | ~100K chunks × 1024 dims × 4 bytes |
| BM25 index | 500MB-1GB | Tantivy or VectorChord-BM25 |
| Code knowledge graph | 200-500MB | Nodes + edges + properties |
| Total storage | 3-7 GB | Well within cloud deployment costs |

### Conclusion

The current MVP architecture (`search_github_docs` with BGE embeddings) is the correct starting point. It validates:
- MCP tool pattern
- API integration
- User value proposition

The future architecture should be implemented incrementally based on observed gaps:
1. **If semantic search quality is poor** → Add code-specific embeddings
2. **If exact matches are missed** → Add BM25 keyword search
3. **If structural queries needed** → Add tree-sitter + code graph
4. **If Cosmos SDK understanding needed** → Add domain-specific schema

> "Start with the simplest architecture that can work, then add complexity based on observed gaps."
> — Anthropic's recommendation for building agents

---

*This document will be updated throughout the project lifecycle.*
