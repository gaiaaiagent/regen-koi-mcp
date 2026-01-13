export const GRAPH_QUERY_TYPES = [
  // Core entity queries
  'list_repos',
  'find_by_type',
  'search_entities',
  'related_entities',
  'list_entity_types',
  'get_entity_stats',

  // Message/Keeper relationship queries (data exists but edges may be sparse)
  'keeper_for_msg',
  'msgs_for_keeper',

  // Module queries (limited backend support)
  'list_modules',
  'get_module',
] as const;

// Query types removed (not supported by backend API):
// - 'list_concepts', 'explain_concept', 'find_concept_for_query' (concept queries)
// - 'find_callers', 'find_callees', 'find_call_graph' (call graph queries)
// - 'search_modules', 'module_entities', 'module_for_entity' (module queries - backend returns 400)

export type GraphQueryType = (typeof GRAPH_QUERY_TYPES)[number];

