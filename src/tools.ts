/**
 * Tool definitions for Regen KOI MCP Server
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { GRAPH_TOOL } from './graph_tool.js';

export const TOOLS: Tool[] = [
  GRAPH_TOOL,
  {
    name: 'search',
    description: `Search the Regen Network knowledge base. Supports:
- Hybrid search (vector + graph + keyword) with entity boosting
- Intent-aware retrieval for better results on specific query types
- Date filtering with published_from/published_to
- Source filtering (notion, github, discourse, etc.)
- Date sorting (relevance, date_desc, date_asc)

**IMPORTANT - Use the intent parameter for better results:**
- For "what is X working on" or "what has X done" queries about a person → use intent="person_activity"
- For "who is X" or biography questions → use intent="person_bio"
- For "how do I" or technical implementation questions → use intent="technical_howto"
- For general searches → omit intent or use intent="general"

Example: Get what Gregory Landua is working on:
  search(query="Gregory Landua", intent="person_activity", limit=15)

Example: Get latest 5 Notion docs:
  search(query="*", source="notion", sort_by="date_desc", limit=5)

NOT for live blockchain queries - use Ledger MCP for on-chain state.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query (e.g., "carbon credits", "Regen Registry governance")'
        },
        intent: {
          type: 'string',
          enum: ['general', 'person_activity', 'person_bio', 'technical_howto', 'concept_explain'],
          description: 'Query intent for optimized retrieval. Use "person_activity" for "what is X working on" queries (finds docs authored by the person). Use "person_bio" for "who is X" queries. Use "technical_howto" for implementation questions. Default: "general"',
          default: 'general'
        },
        source: {
          type: 'string',
          description: "Filter by source type (e.g., 'notion', 'github', 'discourse'). Supports partial matching - 'discourse' matches 'discourse:forum.regen.network'. Use get_stats to see available sources."
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default: 10, max: 50)',
          minimum: 1,
          maximum: 50,
          default: 10
        },
        published_from: {
          type: 'string',
          format: 'date',
          description: 'Filter: include only content published on/after this date (YYYY-MM-DD)'
        },
        published_to: {
          type: 'string',
          format: 'date',
          description: 'Filter: include only content published on/before this date (YYYY-MM-DD)'
        },
        include_undated: {
          type: 'boolean',
          description: 'When using a date filter, also include documents with no known publication date',
          default: false
        },
        sort_by: {
          type: 'string',
          enum: ['relevance', 'date_desc', 'date_asc'],
          description: "Sort order: 'relevance' (default) for weighted hybrid score, 'date_desc' for newest first, 'date_asc' for oldest first. Documents with null dates appear last when sorting by date.",
          default: 'relevance'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'get_stats',
    description: 'Get statistics about the KOI knowledge base including document counts, data sources, and recent updates',
    inputSchema: {
      type: 'object',
      properties: {
        detailed: {
          type: 'boolean',
          description: 'Include detailed breakdown by source and type',
          default: false
        }
      }
    }
  },
  {
    name: 'generate_weekly_digest',
    description: 'Generate a weekly digest SUMMARY of Regen Network activity. **Sources aggregated:** Discourse forum discussions, GitHub activity (commits, PRs, issues), on-chain governance proposals and votes, credit issuance/retirement metrics, and community channels (Discord, Telegram summaries). **Output:** Curated markdown brief with executive summary, governance analysis, community discussions, and on-chain metrics. **Use cases:** Weekly team updates, stakeholder briefings, catching up on ecosystem activity, monitoring governance. This is a condensed overview - use get_notebooklm_export for full content with complete forum posts and Notion pages.',
    inputSchema: {
      type: 'object',
      properties: {
        start_date: {
          type: 'string',
          format: 'date',
          description: 'Start date for digest period (YYYY-MM-DD). Defaults to 7 days ago. Use with end_date to specify custom date ranges (e.g., monthly digest, quarterly review).'
        },
        end_date: {
          type: 'string',
          format: 'date',
          description: 'End date for digest period (YYYY-MM-DD). Defaults to today. Typically used with start_date for custom ranges.'
        },
        save_to_file: {
          type: 'boolean',
          description: 'Whether to save the digest to a file on disk. Useful for archiving or sharing. Default: false',
          default: false
        },
        output_path: {
          type: 'string',
          description: 'Custom file path for saving (only used if save_to_file is true). Defaults to timestamped filename (weekly_digest_YYYY-MM-DD.md) in current directory.'
        },
        format: {
          type: 'string',
          enum: ['markdown', 'json'],
          description: 'Output format. markdown: Human-readable report with sections. json: Structured data for programmatic use. Default: markdown',
          default: 'markdown'
        }
      }
    }
  },
  {
    name: 'get_notebooklm_export',
    description: 'Get the full NotebookLM export with COMPLETE content including: full forum thread posts, complete Notion page content (all chunks), enriched URLs, and detailed source material. Automatically saves to a local file to avoid bloating LLM context. Returns the file path and summary stats.',
    inputSchema: {
      type: 'object',
      properties: {
        output_path: {
          type: 'string',
          description: 'Custom file path for saving. Defaults to notebooklm_export_YYYY-MM-DD.md in the current directory.'
        }
      }
    }
  },
  {
    name: 'search_github_docs',
    description: 'Search Regen Network GitHub repositories for documentation, README files, configuration files, and technical content. Searches regen-ledger (blockchain), regen-web (frontend), regen-data-standards (schemas), and regenie-corpus (docs). Searches docs only - use Ledger MCP for on-chain data.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (e.g., "ecocredit module", "validator setup", "governance voting")'
        },
        repository: {
          type: 'string',
          description: 'Optional: Filter by specific repo. Omit to search all 4 repositories.',
          enum: ['regen-ledger', 'regen-web', 'regen-data-standards', 'regenie-corpus']
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
  },
  {
    name: 'get_repo_overview',
    description: 'Get a structured overview of a specific Regen Network repository including description, key files (README, CONTRIBUTING, etc.), and links to documentation.',
    inputSchema: {
      type: 'object',
      properties: {
        repository: {
          type: 'string',
          description: 'Repository to get overview for',
          enum: ['regen-ledger', 'regen-web', 'regen-data-standards', 'regenie-corpus']
        }
      },
      required: ['repository']
    }
  },
  {
    name: 'get_tech_stack',
    description: 'Get technical stack information for Regen Network repositories including languages, frameworks, dependencies, build tools, and infrastructure. Can show all repos or filter to a specific one.',
    inputSchema: {
      type: 'object',
      properties: {
        repository: {
          type: 'string',
          description: 'Optional: Filter to specific repo. Omit to show all repositories.',
          enum: ['regen-ledger', 'regen-web', 'regen-data-standards', 'regenie-corpus']
        }
      }
    }
  },
  {
    name: 'get_mcp_metrics',
    description: 'Get MCP server performance metrics, cache statistics, and health status. Useful for monitoring and debugging. Returns uptime, tool latencies, cache hit rates, error counts, and circuit breaker status.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'regen_koi_authenticate',
    description: 'Authenticate with your @regen.network email to access internal Regen Network documentation in addition to public sources. Opens a browser window for secure OAuth login. Authentication token is saved on the server and persists across sessions. Only needs to be done once.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'get_my_profile',
    description: `Get your user profile for personalized responses based on your experience level.

Returns your profile including:
- **experience_level**: junior, mid, senior, staff, or principal
- **role**: Your technical role (frontend, backend, full-stack, etc.)
- **preferences**: Response customization (verbosity, explain_before_code, etc.)
- **relationships**: Who you manage, projects you work on (from Jena graph)

If you haven't set a profile, returns sensible defaults (mid-level with balanced verbosity).

Use update_my_profile to change your settings.`,
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'update_my_profile',
    description: `Update your user profile to customize how responses are tailored to you.

**Experience Levels** (affects response verbosity and detail):
- **junior**: Detailed explanations, shows examples, explains before code
- **mid**: Balanced explanations, includes examples
- **senior**: Concise responses, minimal examples
- **staff/principal**: Very concise, assumes deep expertise

**Preferences** (optional, will use defaults based on experience_level):
- explain_before_code: true/false - Whether to explain the approach before showing code
- verbosity: "detailed" | "balanced" | "concise" - How verbose responses should be
- show_examples: true/false - Whether to include code examples

**Example:**
update_my_profile(experience_level="senior", role="backend", preferences={"verbosity": "concise"})`,
    inputSchema: {
      type: 'object',
      properties: {
        experience_level: {
          type: 'string',
          enum: ['junior', 'mid', 'senior', 'staff', 'principal'],
          description: 'Your experience level (affects response verbosity and detail)'
        },
        role: {
          type: 'string',
          description: 'Your technical role (e.g., frontend, backend, full-stack, devops, data)'
        },
        preferences: {
          type: 'object',
          description: 'Custom preferences (explain_before_code, verbosity, show_examples)',
          additionalProperties: true
        },
        managed_by: {
          type: 'string',
          description: 'Email of your manager (stored in Jena for team queries)'
        }
      }
    }
  },
  {
    name: 'resolve_entity',
    description: 'Resolve an ambiguous label to a canonical KOI entity. Returns ranked matches with URIs, types, and confidence scores. Use this when you have a label (like "ethereum" or "regen commons") and need to find the exact entity in the knowledge graph.',
    inputSchema: {
      type: 'object',
      properties: {
        label: {
          type: 'string',
          description: 'The label to resolve (e.g., "ethereum", "notion", "regen commons")'
        },
        type_hint: {
          type: 'string',
          description: 'Optional type hint to narrow results (e.g., "TECHNOLOGY", "ORGANIZATION", "PERSON")'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of candidates to return (default: 5)',
          minimum: 1,
          maximum: 20,
          default: 5
        }
      },
      required: ['label']
    }
  },
  {
    name: 'get_entity_neighborhood',
    description: 'Get the graph neighborhood of an entity - its direct relationships and connected entities. Returns edges with predicates (like "mentions", "relates_to") and neighboring nodes. Useful for understanding context and connections.',
    inputSchema: {
      type: 'object',
      properties: {
        label: {
          type: 'string',
          description: 'Entity label to look up (will be resolved if ambiguous)'
        },
        uri: {
          type: 'string',
          description: 'Entity URI (preferred if known, e.g., from resolve_entity)'
        },
        type_hint: {
          type: 'string',
          description: 'Optional type hint for disambiguation'
        },
        direction: {
          type: 'string',
          enum: ['out', 'in', 'both'],
          description: 'Edge direction: "out" (entity→neighbors), "in" (neighbors→entity), or "both" (default)',
          default: 'both'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of edges to return (default: 20)',
          minimum: 1,
          maximum: 100,
          default: 20
        }
      }
    }
  },
  {
    name: 'get_entity_documents',
    description: 'Get documents associated with an entity. Returns document references (chunks) that mention or relate to the entity. Respects privacy: unauthenticated requests only see public documents.',
    inputSchema: {
      type: 'object',
      properties: {
        label: {
          type: 'string',
          description: 'Entity label to look up'
        },
        uri: {
          type: 'string',
          description: 'Entity URI (preferred if known)'
        },
        type_hint: {
          type: 'string',
          description: 'Optional type hint for disambiguation'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of documents to return (default: 10)',
          minimum: 1,
          maximum: 50,
          default: 10
        }
      }
    }
  },
  // =============================================================================
  // SPARQL Power Tools (MCP-only)
  // =============================================================================
  {
    name: 'sparql_query',
    description: 'Execute raw SPARQL queries against the Regen Knowledge Graph (Apache Jena). Power tool for advanced graph investigations. Use for complex queries not covered by other tools. Prefer /api/koi/graph for simple entity lookups or /api/koi/entity for resolving labels.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The SPARQL query to execute. Must be a valid SELECT query. PREFIX declarations are optional (common prefixes auto-added).'
        },
        format: {
          type: 'string',
          enum: ['json', 'table'],
          description: 'Output format: "json" for structured data, "table" for human-readable rendering. Default: json',
          default: 'json'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of result rows to return (default: 100, max: 1000). Overrides LIMIT in query if lower.',
          minimum: 1,
          maximum: 1000,
          default: 100
        },
        timeout_ms: {
          type: 'number',
          description: 'Query timeout in milliseconds (default: 30000, max: 60000)',
          minimum: 1000,
          maximum: 60000,
          default: 30000
        }
      },
      required: ['query']
    }
  },
  // =============================================================================
  // Anchored Metadata Tools (Session E: Off-chain Metadata Resolution)
  // =============================================================================
  {
    name: 'resolve_metadata_iri',
    description: 'Resolve a Regen metadata IRI via the allowlisted resolver (api.regen.network). Caches results for efficient repeated lookups. Returns resolution details including content hash for integrity verification. Use this to verify metadata exists before deriving metrics.',
    inputSchema: {
      type: 'object',
      properties: {
        iri: {
          type: 'string',
          description: 'The Regen metadata IRI to resolve (e.g., "regen:13toVfvfM5B7yuJqq8h3iVRHp3PKUJ4ABxHyvn4MeUMwwv1pWQGL295.rdf")'
        },
        force_refresh: {
          type: 'boolean',
          description: 'If true, bypass cache and fetch fresh from resolver. Default: false',
          default: false
        }
      },
      required: ['iri']
    }
  },
  {
    name: 'derive_offchain_hectares',
    description: 'Derive project hectares from a Regen metadata IRI with full citation and derivation provenance. Enforces "no citation, no metric" policy - returns blocked=true if derivation is not possible. Only returns hectares when a valid citation can be constructed. Use this for accurate, citeable project size metrics.',
    inputSchema: {
      type: 'object',
      properties: {
        iri: {
          type: 'string',
          description: 'The Regen metadata IRI to derive hectares from (e.g., "regen:13toVfvfM5B7yuJqq8h3iVRHp3PKUJ4ABxHyvn4MeUMwwv1pWQGL295.rdf")'
        },
        force_refresh: {
          type: 'boolean',
          description: 'If true, bypass cache and re-derive from fresh metadata. Default: false',
          default: false
        }
      },
      required: ['iri']
    }
  },
  // =============================================================================
  // RID Tools (KOI-compatible RID model + KB convenience tools)
  // - parse_rid: Protocol-aligned RID parsing per rid-lib spec
  // - kb_rid_lookup, kb_list_rids: KB-specific conveniences (not KOI-net /rids/fetch etc.)
  // =============================================================================
  {
    name: 'parse_rid',
    description: 'Parse a KOI Resource Identifier (RID) into its components per the rid-lib specification. Stateless - no backend call. Returns: valid (boolean), error (string if invalid), scheme, namespace (null for URI schemes), context (<scheme>:<namespace> for ORN/URN, or just <scheme> for URI schemes like https), reference, rid_type (best-effort heuristic - may be null), uri_components (for HTTP/HTTPS), source_inferred (e.g., "github", "notion" - heuristic).',
    inputSchema: {
      type: 'object',
      properties: {
        rid: {
          type: 'string',
          description: 'The RID string to parse (e.g., "orn:regen.document:notion/page-abc123", "orn:slack.message:TEAM/CHANNEL/TS", "https://github.com/regen-network/regen-ledger")'
        }
      },
      required: ['rid']
    }
  },
  {
    name: 'kb_rid_lookup',
    description: 'Look up what the Regen KB knows about an RID. Searches indexed documents via /query by RID string match. Optionally queries /entity/neighborhood for graph edges (best-effort, may return empty). Does NOT implement KOI-net dereference or /bundles/fetch - this is a KB convenience tool. Use parse_rid first to validate format.',
    inputSchema: {
      type: 'object',
      properties: {
        rid: {
          type: 'string',
          description: 'The RID to look up in the knowledge base'
        },
        include: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['documents', 'relationships', 'chunks']
          },
          default: ['documents'],
          description: 'What to include: "documents" = indexed doc records matching RID, "relationships" = graph edges referencing RID, "chunks" = text chunks'
        },
        limit: {
          type: 'number',
          minimum: 1,
          maximum: 50,
          default: 10,
          description: 'Maximum items per category to return'
        }
      },
      required: ['rid']
    }
  },
  {
    name: 'kb_list_rids',
    description: 'List RIDs indexed in the Regen KB. Filter by context pattern, source, or date range. Returns aggregation counts. This is a KB discovery tool, NOT KOI-net /rids/fetch (which lists RIDs by type from a node).',
    inputSchema: {
      type: 'object',
      properties: {
        context: {
          type: 'string',
          description: 'Filter by RID context pattern (e.g., "orn:regen.document", "https"). Partial match.'
        },
        source: {
          type: 'string',
          enum: ['notion', 'discourse', 'github', 'slack', 'telegram', 'twitter', 'substack', 'youtube', 'medium'],
          description: 'Filter by data source'
        },
        indexed_after: {
          type: 'string',
          format: 'date',
          description: 'Only RIDs indexed after this date (YYYY-MM-DD)'
        },
        indexed_before: {
          type: 'string',
          format: 'date',
          description: 'Only RIDs indexed before this date (YYYY-MM-DD)'
        },
        limit: {
          type: 'number',
          minimum: 1,
          maximum: 200,
          default: 50,
          description: 'Maximum RIDs to return'
        },
        offset: {
          type: 'number',
          minimum: 0,
          default: 0,
          description: 'Pagination offset'
        }
      }
    }
  },
  // =============================================================================
  // Feedback Tool (User Experience Feedback Collection)
  // =============================================================================
  {
    name: 'submit_feedback',
    description: `Submit feedback about your experience using KOI MCP tools.

Use this after completing a task to share:
- Whether it worked well or had issues
- Suggestions for improvement
- Bugs or unexpected behavior

Your feedback helps improve the system. All feedback is stored anonymously with session context.

Example usage:
  submit_feedback(rating=5, category="success", notes="Found exactly what I needed about basket tokens")
  submit_feedback(rating=2, category="bug", notes="search returned no results for 'Registry Agent'")`,
    inputSchema: {
      type: 'object',
      properties: {
        rating: {
          type: 'number',
          minimum: 1,
          maximum: 5,
          description: 'Rating from 1 (poor) to 5 (excellent)'
        },
        category: {
          type: 'string',
          enum: ['success', 'partial', 'bug', 'suggestion', 'question', 'other'],
          description: 'Type of feedback: success (worked great), partial (mostly worked), bug (something broke), suggestion (feature idea), question (need help), other'
        },
        task_description: {
          type: 'string',
          description: 'Brief description of what you were trying to do (optional but helpful)'
        },
        notes: {
          type: 'string',
          description: 'Detailed feedback, observations, or suggestions'
        },
        include_session_context: {
          type: 'boolean',
          description: 'Include recent tool calls for debugging context (default: true)',
          default: true
        }
      },
      required: ['rating', 'category', 'notes']
    }
  }
];
