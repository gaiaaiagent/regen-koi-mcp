/**
 * Baseline Vector Search - Wrapper for KOI API
 *
 * Provides a baseline for comparison against graph-enhanced search.
 * Uses the existing KOI hybrid RAG server (vector + FTS).
 */

export interface VectorSearchResult {
  rid: string;
  score: number;
  repo: string;
  file: string;
  content_preview: string;
  entity_type?: string;
  entity_name?: string;
}

export interface VectorSearchOptions {
  limit?: number;
  repo?: string;
}

/**
 * Query the KOI API for baseline vector search
 */
export async function executeVectorSearch(
  query: string,
  options: VectorSearchOptions = {}
): Promise<VectorSearchResult[]> {
  const { limit = 10, repo } = options;

  try {
    const response = await fetch('http://localhost:8301/api/koi/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        question: query,
        limit,
        repo_filter: repo,
      }),
    });

    if (!response.ok) {
      throw new Error(`KOI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Transform KOI response to standardized format
    // KOI API returns results under 'results' field, not 'memories'
    const results = data.results || data.memories || [];
    if (!Array.isArray(results)) {
      console.warn('Unexpected KOI response format:', data);
      return [];
    }

    return results.map((memory: any) => {
      // Extract entity information from content if available
      const entityInfo = extractEntityInfo(memory.content || memory.text || '');

      return {
        rid: memory.rid || memory.id || '',
        score: memory.score || 0,
        repo: memory.repo || extractRepo(memory.rid),
        file: memory.file_path || memory.file || extractFile(memory.rid),
        content_preview: truncate(memory.content || memory.text || '', 200),
        entity_type: entityInfo.type,
        entity_name: entityInfo.name,
      };
    });
  } catch (error) {
    console.error('[baseline_vector] Error querying KOI API:', error);
    throw error;
  }
}

/**
 * Extract entity information from content (best-effort)
 */
function extractEntityInfo(content: string): { type?: string; name?: string } {
  // Look for common patterns in code/docs
  const msgMatch = content.match(/\b(Msg\w+)\b/);
  if (msgMatch) {
    return { type: 'Msg', name: msgMatch[1] };
  }

  const keeperMatch = content.match(/\b(Keeper)\b/);
  if (keeperMatch) {
    return { type: 'Keeper', name: 'Keeper' };
  }

  const eventMatch = content.match(/\b(Event\w+)\b/);
  if (eventMatch) {
    return { type: 'Event', name: eventMatch[1] };
  }

  return {};
}

/**
 * Extract repository name from RID
 */
function extractRepo(rid: string): string {
  if (!rid) return 'unknown';

  // RID format: regen.github:regen-ledger/x/ecocredit/README.md
  const match = rid.match(/[^:]+:([^/]+)/);
  return match ? match[1] : 'unknown';
}

/**
 * Extract file path from RID
 */
function extractFile(rid: string): string {
  if (!rid) return 'unknown';

  // RID format: regen.github:regen-ledger/x/ecocredit/README.md
  const match = rid.match(/[^:]+:(.+)/);
  return match ? match[1] : rid;
}

/**
 * Truncate string to max length
 */
function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + '...';
}

/**
 * Test the baseline vector search
 */
export async function testVectorSearch(): Promise<void> {
  console.log('Testing baseline vector search...\n');

  const testQueries = [
    'How does the ecocredit module handle credit retirement?',
    'What is the basket module?',
    'MsgCreateBatch',
  ];

  for (const query of testQueries) {
    console.log(`Query: "${query}"`);
    try {
      const results = await executeVectorSearch(query, { limit: 5 });
      console.log(`  Found ${results.length} results:`);
      results.forEach((r, i) => {
        console.log(`    ${i + 1}. ${r.file} (score: ${r.score.toFixed(3)})`);
        if (r.entity_name) {
          console.log(`       Entity: ${r.entity_type}:${r.entity_name}`);
        }
      });
    } catch (error) {
      console.error(`  Error: ${error instanceof Error ? error.message : error}`);
    }
    console.log('');
  }
}

// Run test if executed directly
if (import.meta.main) {
  await testVectorSearch();
}
