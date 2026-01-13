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

  // Module queries
  'list_modules',
  'get_module',
] as const;

// Query types not yet supported by backend API:
// - 'list_concepts', 'explain_concept', 'find_concept_for_query' (concept queries - no data)
// - 'search_modules', 'module_entities', 'module_for_entity' (module queries - not implemented)

export type GraphQueryType = (typeof GRAPH_QUERY_TYPES)[number];

