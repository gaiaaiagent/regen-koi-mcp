/**
 * Cache Module - LRU Caching for Query Results
 *
 * Provides in-memory caching with TTL for query results to reduce
 * database load and improve response times.
 */

import { LRUCache } from 'lru-cache';
import crypto from 'crypto';
import { logCacheOp } from './logger.js';
import { recordCacheHit, recordCacheMiss } from './metrics.js';

/**
 * Cache configuration by query type
 */
interface CacheConfig {
  ttlMs: number;           // Time to live in milliseconds
  maxSize: number;         // Maximum number of entries
  staleWhileRevalidate?: boolean;  // Return stale data while fetching fresh
}

/**
 * Default cache configurations by category
 */
const CACHE_CONFIGS: Record<string, CacheConfig> = {
  // Static data - cache for 1 hour
  static: {
    ttlMs: 60 * 60 * 1000,  // 1 hour
    maxSize: 100
  },
  // Semi-static data - cache for 10 minutes
  semi_static: {
    ttlMs: 10 * 60 * 1000,  // 10 minutes
    maxSize: 200
  },
  // Dynamic queries - cache for 5 minutes
  dynamic: {
    ttlMs: 5 * 60 * 1000,   // 5 minutes
    maxSize: 500
  },
  // Frequently changing - cache for 1 minute
  volatile: {
    ttlMs: 60 * 1000,       // 1 minute
    maxSize: 100
  }
};

/**
 * Map query types to cache categories
 */
const QUERY_TYPE_TO_CATEGORY: Record<string, string> = {
  // Static (changes rarely)
  'list_repos': 'static',
  'list_entity_types': 'static',
  'get_entity_stats': 'static',
  'get_tech_stack': 'static',
  'get_repo_overview': 'static',
  'list_modules': 'static',

  // Semi-static (changes occasionally)
  'find_by_type': 'semi_static',
  'get_module': 'semi_static',
  'search_modules': 'semi_static',
  'module_entities': 'semi_static',
  'module_for_entity': 'semi_static',

  // Dynamic (user queries)
  'search_entities': 'dynamic',
  'search_knowledge': 'dynamic',
  'search_github_docs': 'dynamic',
  'hybrid_search': 'dynamic',
  'keeper_for_msg': 'dynamic',
  'msgs_for_keeper': 'dynamic',
  'docs_mentioning': 'dynamic',
  'entities_in_doc': 'dynamic',
  'related_entities': 'dynamic',

  // Volatile (changes frequently)
  'get_stats': 'volatile',
  'generate_weekly_digest': 'volatile'
};

/**
 * Generate a cache key from query parameters
 */
function generateCacheKey(tool: string, queryType: string, params: Record<string, any>): string {
  // Create a deterministic string from params
  const sortedParams = Object.keys(params)
    .filter(k => params[k] !== undefined && params[k] !== null)
    .sort()
    .map(k => `${k}=${JSON.stringify(params[k])}`)
    .join('|');

  const keyString = `${tool}:${queryType}:${sortedParams}`;

  // Hash for consistent key length
  const hash = crypto.createHash('sha256').update(keyString).digest('hex').substring(0, 16);

  return `${tool}:${queryType}:${hash}`;
}

/**
 * Query Cache class
 */
class QueryCache {
  private caches: Map<string, LRUCache<string, any>> = new Map();

  constructor() {
    // Initialize caches for each category
    for (const [category, config] of Object.entries(CACHE_CONFIGS)) {
      this.caches.set(category, new LRUCache({
        max: config.maxSize,
        ttl: config.ttlMs,
        updateAgeOnGet: false,  // Don't refresh TTL on read
        updateAgeOnHas: false
      }));
    }
  }

  /**
   * Get cache for a specific category
   */
  private getCache(category: string): LRUCache<string, any> {
    const cache = this.caches.get(category);
    if (!cache) {
      // Fall back to dynamic cache
      return this.caches.get('dynamic')!;
    }
    return cache;
  }

  /**
   * Get the category for a query type
   */
  private getCategory(queryType: string): string {
    return QUERY_TYPE_TO_CATEGORY[queryType] || 'dynamic';
  }

  /**
   * Get a cached result
   */
  get<T>(tool: string, queryType: string, params: Record<string, any>): T | undefined {
    const category = this.getCategory(queryType);
    const cache = this.getCache(category);
    const key = generateCacheKey(tool, queryType, params);

    const cached = cache.get(key) as T | undefined;

    if (cached !== undefined) {
      logCacheOp({ operation: 'hit', key });
      recordCacheHit();
      return cached;
    } else {
      logCacheOp({ operation: 'miss', key });
      recordCacheMiss();
      return undefined;
    }
  }

  /**
   * Set a cached result
   */
  set<T>(tool: string, queryType: string, params: Record<string, any>, value: T): void {
    const category = this.getCategory(queryType);
    const cache = this.getCache(category);
    const key = generateCacheKey(tool, queryType, params);
    const config = CACHE_CONFIGS[category] || CACHE_CONFIGS.dynamic;

    cache.set(key, value);
    logCacheOp({ operation: 'set', key, ttl_ms: config.ttlMs });
  }

  /**
   * Check if a key exists in cache
   */
  has(tool: string, queryType: string, params: Record<string, any>): boolean {
    const category = this.getCategory(queryType);
    const cache = this.getCache(category);
    const key = generateCacheKey(tool, queryType, params);
    return cache.has(key);
  }

  /**
   * Delete a specific cached result
   */
  delete(tool: string, queryType: string, params: Record<string, any>): void {
    const category = this.getCategory(queryType);
    const cache = this.getCache(category);
    const key = generateCacheKey(tool, queryType, params);
    cache.delete(key);
    logCacheOp({ operation: 'evict', key });
  }

  /**
   * Clear all caches
   */
  clear(): void {
    for (const cache of this.caches.values()) {
      cache.clear();
    }
  }

  /**
   * Clear a specific category's cache
   */
  clearCategory(category: string): void {
    const cache = this.caches.get(category);
    if (cache) {
      cache.clear();
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    totalSize: number;
    byCategory: Record<string, { size: number; maxSize: number }>;
  } {
    let totalSize = 0;
    const byCategory: Record<string, { size: number; maxSize: number }> = {};

    for (const [category, cache] of this.caches) {
      const size = cache.size;
      totalSize += size;
      byCategory[category] = {
        size,
        maxSize: CACHE_CONFIGS[category]?.maxSize || 0
      };
    }

    return { totalSize, byCategory };
  }
}

// Singleton instance
export const queryCache = new QueryCache();

/**
 * Wrapper function to cache async query results
 */
export async function cachedQuery<T>(
  tool: string,
  queryType: string,
  params: Record<string, any>,
  fetchFn: () => Promise<T>
): Promise<T> {
  // Check cache first
  const cached = queryCache.get<T>(tool, queryType, params);
  if (cached !== undefined) {
    return cached;
  }

  // Execute query
  const result = await fetchFn();

  // Cache result
  queryCache.set(tool, queryType, params, result);

  return result;
}

/**
 * Check if a query type should be cached
 */
export function shouldCache(queryType: string): boolean {
  // Don't cache volatile queries
  return QUERY_TYPE_TO_CATEGORY[queryType] !== 'volatile';
}

/**
 * Get TTL for a query type
 */
export function getTTL(queryType: string): number {
  const category = QUERY_TYPE_TO_CATEGORY[queryType] || 'dynamic';
  return CACHE_CONFIGS[category]?.ttlMs || CACHE_CONFIGS.dynamic.ttlMs;
}

export default queryCache;
