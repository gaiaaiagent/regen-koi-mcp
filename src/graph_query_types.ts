export const GRAPH_QUERY_TYPES = [
  // Core entity queries
  'list_repos',
  'find_by_type',
  'search_entities',
  'related_entities',
  'list_entity_types',
  'get_entity_stats',

  // Message/Keeper relationship queries
  'keeper_for_msg',
  'msgs_for_keeper',

  // Call graph queries (11,331 CALLS edges available)
  'find_callers',
  'find_callees',
  'find_call_graph',
  'trace_call_chain',  // Multi-hop: find path from entity A to entity B
  'find_orphaned_code', // Find code without callers (dead code detection)

  // Module queries
  'list_modules',
  'get_module',
  'search_modules',
  'module_entities',
  'module_for_entity',

  // Cross-file relationship queries
  'find_importers',
  'find_implementations',

  // Concept queries (available but may return empty results)
  'list_concepts',
  'explain_concept',
  'find_concept_for_query',
] as const;

export type GraphQueryType = (typeof GRAPH_QUERY_TYPES)[number];

