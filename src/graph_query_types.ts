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

  // Concept queries
  'list_concepts',
  'explain_concept',
  'find_concept_for_query',

  // Call graph queries
  'find_callers',
  'find_callees',
  'find_call_graph',

  // Module queries
  'list_modules',
  'get_module',
  'search_modules',
  'module_entities',
  'module_for_entity',
] as const;

export type GraphQueryType = (typeof GRAPH_QUERY_TYPES)[number];

