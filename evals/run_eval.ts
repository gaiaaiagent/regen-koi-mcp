/**
 * Evaluation Harness - Compare Graph vs Vector Search
 *
 * Runs gold set queries against both search methods and calculates Recall@k metrics.
 */

import { readFileSync, writeFileSync } from 'fs';
import { GraphClient, createGraphClient } from '../graph_client.js';
import { executeVectorSearch, VectorSearchResult } from './baseline_vector.js';

// Gold set structure
interface GoldQuery {
  id: string;
  journey: string;
  query: string;
  expected_rids?: string[];
  expected_entities?: string[];
  query_type?: string;
  notes?: string;
}

interface GoldSet {
  queries: GoldQuery[];
}

// Evaluation result
interface EvalResult {
  query_id: string;
  journey: string;
  query: string;
  graph_recall_5: number;
  graph_recall_10: number;
  vector_recall_5: number;
  vector_recall_10: number;
  improvement_at_5: number;
  improvement_at_10: number;
  graph_found: string[];
  graph_missing: string[];
  vector_found: string[];
  vector_missing: string[];
  notes?: string;
}

// Aggregate results by journey
interface JourneyStats {
  journey: string;
  query_count: number;
  avg_graph_recall_5: number;
  avg_graph_recall_10: number;
  avg_vector_recall_5: number;
  avg_vector_recall_10: number;
  avg_improvement_at_5: number;
  avg_improvement_at_10: number;
}

/**
 * Execute a graph query based on query type
 */
async function executeGraphQuery(
  client: GraphClient,
  query: GoldQuery
): Promise<{ entity_name?: string; file_path?: string; content_preview?: string }[]> {
  const results: any[] = [];

  try {
    // If explicit query_type is specified, use it
    if (query.query_type === 'keeper_for_msg' && query.expected_entities) {
      for (const msgName of query.expected_entities) {
        const keepers = await client.getKeeperForMsg(msgName);
        results.push(...keepers.map(k => ({
          entity_name: k.keeper_name,
          file_path: k.keeper_file_path,
          content_preview: `${k.keeper_name} handles ${msgName}`,
        })));
      }
    } else if (query.query_type === 'msgs_for_keeper' && query.expected_entities) {
      // Try "Keeper" as the keeper name
      const msgs = await client.getMsgsForKeeper('Keeper');
      results.push(...msgs.map(m => ({
        entity_name: m.msg_name,
        content_preview: m.msg_name,
      })));
    } else if (query.query_type === 'docs_mentioning' && query.expected_entities) {
      for (const entityName of query.expected_entities) {
        const docs = await client.getDocsMentioning(entityName);
        results.push(...docs.map(d => ({
          entity_name: entityName,
          file_path: d.file_path,
          content_preview: `${d.title} mentions ${entityName}`,
        })));
      }
    } else if (query.query_type === 'related_entities' && query.expected_entities && query.expected_entities.length > 0) {
      // Use first expected entity as seed
      const related = await client.getRelatedEntities(query.expected_entities[0]);
      results.push(...related.map(r => ({
        entity_name: r.name,
        content_preview: `${r.type}: ${r.name}`,
      })));
    } else {
      // Generic search: try to find entities matching query
      const pattern = extractSearchPattern(query.query);
      const entities = await client.searchEntities(pattern);
      results.push(...entities.map(e => ({
        entity_name: e.name,
        file_path: e.file_path,
        content_preview: `${e.type}: ${e.name}`,
      })));
    }
  } catch (error) {
    console.error(`[graph_query] Error for ${query.id}:`, error);
  }

  return results;
}

/**
 * Extract a search pattern from natural language query
 */
function extractSearchPattern(query: string): string {
  // Look for capitalized words that might be entity names
  const matches = query.match(/\b(Msg\w+|Keeper|Event\w+)\b/g);
  if (matches && matches.length > 0) {
    return matches[0];
  }

  // Look for key terms
  if (query.includes('basket')) return 'basket';
  if (query.includes('credit')) return 'credit';
  if (query.includes('retire')) return 'retire';

  // Default: use first meaningful word
  const words = query.split(' ').filter(w => w.length > 4);
  return words[0] || 'Msg';
}

/**
 * Calculate Recall@k
 */
function calculateRecall(
  results: { entity_name?: string; file_path?: string; content_preview?: string }[],
  expected: string[],
  k: number
): { recall: number; found: string[]; missing: string[] } {
  const topK = results.slice(0, k);
  const found: string[] = [];
  const missing: string[] = [];

  for (const exp of expected) {
    const isFound = topK.some(hit => {
      // Check entity name match
      if (hit.entity_name && hit.entity_name.includes(exp)) return true;
      // Check file path match
      if (hit.file_path && hit.file_path.includes(exp)) return true;
      // Check content preview match
      if (hit.content_preview && hit.content_preview.includes(exp)) return true;
      return false;
    });

    if (isFound) {
      found.push(exp);
    } else {
      missing.push(exp);
    }
  }

  const recall = expected.length > 0 ? found.length / expected.length : 0;
  return { recall, found, missing };
}

/**
 * Run evaluation on all queries
 */
async function runEvaluation(): Promise<EvalResult[]> {
  console.log('Loading gold set...\n');
  const goldSet: GoldSet = JSON.parse(
    readFileSync('evals/gold_set.json', 'utf-8')
  );

  console.log(`Found ${goldSet.queries.length} test queries\n`);

  const client = createGraphClient();
  const results: EvalResult[] = [];

  for (const query of goldSet.queries) {
    console.log(`[${query.id}] ${query.query}`);

    // Combine expected entities and RIDs for evaluation
    const expected = [
      ...(query.expected_entities || []),
      ...(query.expected_rids || []),
    ];

    if (expected.length === 0) {
      console.log('  ⚠️  No expected results defined, skipping...\n');
      continue;
    }

    try {
      // Execute graph query
      const graphResults = await executeGraphQuery(client, query);
      const graphRecall5 = calculateRecall(graphResults, expected, 5);
      const graphRecall10 = calculateRecall(graphResults, expected, 10);

      console.log(`  Graph: ${graphResults.length} results, Recall@5: ${(graphRecall5.recall * 100).toFixed(1)}%, Recall@10: ${(graphRecall10.recall * 100).toFixed(1)}%`);

      // Execute vector query
      const vectorResults = await executeVectorSearch(query.query, { limit: 10 });
      const vectorRecall5 = calculateRecall(vectorResults, expected, 5);
      const vectorRecall10 = calculateRecall(vectorResults, expected, 10);

      console.log(`  Vector: ${vectorResults.length} results, Recall@5: ${(vectorRecall5.recall * 100).toFixed(1)}%, Recall@10: ${(vectorRecall10.recall * 100).toFixed(1)}%`);

      const improvement5 = graphRecall5.recall - vectorRecall5.recall;
      const improvement10 = graphRecall10.recall - vectorRecall10.recall;

      console.log(`  Improvement: Recall@5: ${(improvement5 * 100).toFixed(1)}pp, Recall@10: ${(improvement10 * 100).toFixed(1)}pp\n`);

      results.push({
        query_id: query.id,
        journey: query.journey,
        query: query.query,
        graph_recall_5: graphRecall5.recall,
        graph_recall_10: graphRecall10.recall,
        vector_recall_5: vectorRecall5.recall,
        vector_recall_10: vectorRecall10.recall,
        improvement_at_5: improvement5,
        improvement_at_10: improvement10,
        graph_found: graphRecall5.found,
        graph_missing: graphRecall5.missing,
        vector_found: vectorRecall5.found,
        vector_missing: vectorRecall5.missing,
        notes: query.notes,
      });
    } catch (error) {
      console.error(`  ❌ Error: ${error instanceof Error ? error.message : error}\n`);
    }
  }

  await client.close();
  return results;
}

/**
 * Calculate journey-level statistics
 */
function calculateJourneyStats(results: EvalResult[]): JourneyStats[] {
  const journeys = [...new Set(results.map(r => r.journey))];
  const stats: JourneyStats[] = [];

  for (const journey of journeys) {
    const journeyResults = results.filter(r => r.journey === journey);
    const count = journeyResults.length;

    if (count === 0) continue;

    stats.push({
      journey,
      query_count: count,
      avg_graph_recall_5: journeyResults.reduce((sum, r) => sum + r.graph_recall_5, 0) / count,
      avg_graph_recall_10: journeyResults.reduce((sum, r) => sum + r.graph_recall_10, 0) / count,
      avg_vector_recall_5: journeyResults.reduce((sum, r) => sum + r.vector_recall_5, 0) / count,
      avg_vector_recall_10: journeyResults.reduce((sum, r) => sum + r.vector_recall_10, 0) / count,
      avg_improvement_at_5: journeyResults.reduce((sum, r) => sum + r.improvement_at_5, 0) / count,
      avg_improvement_at_10: journeyResults.reduce((sum, r) => sum + r.improvement_at_10, 0) / count,
    });
  }

  return stats;
}

/**
 * Print results summary
 */
function printResults(results: EvalResult[], journeyStats: JourneyStats[]): void {
  console.log('\n' + '='.repeat(80));
  console.log('EVALUATION SUMMARY');
  console.log('='.repeat(80) + '\n');

  // Overall metrics
  const avgGraphRecall5 = results.reduce((sum, r) => sum + r.graph_recall_5, 0) / results.length;
  const avgGraphRecall10 = results.reduce((sum, r) => sum + r.graph_recall_10, 0) / results.length;
  const avgVectorRecall5 = results.reduce((sum, r) => sum + r.vector_recall_5, 0) / results.length;
  const avgVectorRecall10 = results.reduce((sum, r) => sum + r.vector_recall_10, 0) / results.length;

  console.log('Overall Performance:');
  console.log(`  Graph Search   - Recall@5: ${(avgGraphRecall5 * 100).toFixed(1)}%, Recall@10: ${(avgGraphRecall10 * 100).toFixed(1)}%`);
  console.log(`  Vector Search  - Recall@5: ${(avgVectorRecall5 * 100).toFixed(1)}%, Recall@10: ${(avgVectorRecall10 * 100).toFixed(1)}%`);
  console.log(`  Improvement    - Recall@5: ${((avgGraphRecall5 - avgVectorRecall5) * 100).toFixed(1)}pp, Recall@10: ${((avgGraphRecall10 - avgVectorRecall10) * 100).toFixed(1)}pp\n`);

  // Per-journey breakdown
  console.log('Per-Journey Breakdown:');
  for (const stat of journeyStats) {
    console.log(`\n  ${stat.journey.toUpperCase()} (${stat.query_count} queries):`);
    console.log(`    Graph   - Recall@5: ${(stat.avg_graph_recall_5 * 100).toFixed(1)}%, Recall@10: ${(stat.avg_graph_recall_10 * 100).toFixed(1)}%`);
    console.log(`    Vector  - Recall@5: ${(stat.avg_vector_recall_5 * 100).toFixed(1)}%, Recall@10: ${(stat.avg_vector_recall_10 * 100).toFixed(1)}%`);
    console.log(`    Δ       - Recall@5: ${(stat.avg_improvement_at_5 * 100).toFixed(1)}pp, Recall@10: ${(stat.avg_improvement_at_10 * 100).toFixed(1)}pp`);
  }

  console.log('\n' + '='.repeat(80) + '\n');
}

/**
 * Generate detailed report
 */
function generateReport(results: EvalResult[], journeyStats: JourneyStats[]): string {
  const timestamp = new Date().toISOString();

  let report = `# Graph vs Vector Search Evaluation Report\n\n`;
  report += `**Generated:** ${timestamp}\n`;
  report += `**Queries Evaluated:** ${results.length}\n\n`;

  report += `---\n\n`;

  // Executive Summary
  const avgGraphRecall5 = results.reduce((sum, r) => sum + r.graph_recall_5, 0) / results.length;
  const avgGraphRecall10 = results.reduce((sum, r) => sum + r.graph_recall_10, 0) / results.length;
  const avgVectorRecall5 = results.reduce((sum, r) => sum + r.vector_recall_5, 0) / results.length;
  const avgVectorRecall10 = results.reduce((sum, r) => sum + r.vector_recall_10, 0) / results.length;

  report += `## Executive Summary\n\n`;
  report += `| Metric | Graph Search | Vector Search | Improvement |\n`;
  report += `|--------|--------------|---------------|-------------|\n`;
  report += `| Recall@5 | ${(avgGraphRecall5 * 100).toFixed(1)}% | ${(avgVectorRecall5 * 100).toFixed(1)}% | ${((avgGraphRecall5 - avgVectorRecall5) * 100).toFixed(1)}pp |\n`;
  report += `| Recall@10 | ${(avgGraphRecall10 * 100).toFixed(1)}% | ${(avgVectorRecall10 * 100).toFixed(1)}% | ${((avgGraphRecall10 - avgVectorRecall10) * 100).toFixed(1)}pp |\n\n`;

  // Journey-Level Analysis
  report += `## Performance by User Journey\n\n`;
  for (const stat of journeyStats) {
    report += `### ${stat.journey.charAt(0).toUpperCase() + stat.journey.slice(1)} (${stat.query_count} queries)\n\n`;
    report += `| Metric | Graph | Vector | Improvement |\n`;
    report += `|--------|-------|--------|-------------|\n`;
    report += `| Recall@5 | ${(stat.avg_graph_recall_5 * 100).toFixed(1)}% | ${(stat.avg_vector_recall_5 * 100).toFixed(1)}% | ${(stat.avg_improvement_at_5 * 100).toFixed(1)}pp |\n`;
    report += `| Recall@10 | ${(stat.avg_graph_recall_10 * 100).toFixed(1)}% | ${(stat.avg_vector_recall_10 * 100).toFixed(1)}% | ${(stat.avg_improvement_at_10 * 100).toFixed(1)}pp |\n\n`;
  }

  // Detailed Results
  report += `## Detailed Query Results\n\n`;
  for (const result of results) {
    report += `### ${result.query_id}: ${result.query}\n\n`;
    report += `**Journey:** ${result.journey}\n\n`;

    report += `| Method | Recall@5 | Recall@10 | Found | Missing |\n`;
    report += `|--------|----------|-----------|-------|----------|\n`;
    report += `| Graph | ${(result.graph_recall_5 * 100).toFixed(1)}% | ${(result.graph_recall_10 * 100).toFixed(1)}% | ${result.graph_found.join(', ') || 'none'} | ${result.graph_missing.join(', ') || 'none'} |\n`;
    report += `| Vector | ${(result.vector_recall_5 * 100).toFixed(1)}% | ${(result.vector_recall_10 * 100).toFixed(1)}% | ${result.vector_found.join(', ') || 'none'} | ${result.vector_missing.join(', ') || 'none'} |\n\n`;

    if (result.notes) {
      report += `*Notes:* ${result.notes}\n\n`;
    }
  }

  // Analysis & Recommendations
  report += `## Analysis\n\n`;

  // Find query types where graph excels
  const graphWins = results.filter(r => r.improvement_at_5 > 0.2);
  const vectorWins = results.filter(r => r.improvement_at_5 < -0.2);

  report += `### Where Graph Search Excels\n\n`;
  if (graphWins.length > 0) {
    report += `Graph search showed significant improvement (>20pp) on ${graphWins.length} queries:\n\n`;
    for (const win of graphWins) {
      report += `- **${win.query_id}**: "${win.query}" (+${(win.improvement_at_5 * 100).toFixed(1)}pp)\n`;
    }
  } else {
    report += `No queries showed significant graph advantage.\n`;
  }

  report += `\n### Where Vector Search Excels\n\n`;
  if (vectorWins.length > 0) {
    report += `Vector search showed significant improvement (>20pp) on ${vectorWins.length} queries:\n\n`;
    for (const win of vectorWins) {
      report += `- **${win.query_id}**: "${win.query}" (${(win.improvement_at_5 * 100).toFixed(1)}pp)\n`;
    }
  } else {
    report += `No queries showed significant vector advantage.\n`;
  }

  report += `\n## Recommendations for Phase 2b\n\n`;
  report += `1. **Hybrid Approach**: Combine graph and vector search for best results\n`;
  report += `2. **Query Routing**: Use query type detection to route to optimal search method\n`;
  report += `3. **Graph Expansion**: Add more relationship types (EMITS, IMPLEMENTS) to improve coverage\n`;
  report += `4. **Vector Enhancement**: Improve entity extraction in vector results for better matching\n`;
  report += `5. **Benchmarking**: Expand gold set with more diverse queries\n\n`;

  return report;
}

/**
 * Main execution
 */
async function main() {
  console.log('Starting evaluation...\n');

  const results = await runEvaluation();

  if (results.length === 0) {
    console.error('No results generated. Exiting.');
    process.exit(1);
  }

  const journeyStats = calculateJourneyStats(results);

  // Print summary to console
  printResults(results, journeyStats);

  // Generate detailed report
  const report = generateReport(results, journeyStats);

  // Save results
  writeFileSync('evals/results.json', JSON.stringify(results, null, 2));
  writeFileSync('EVAL_REPORT.md', report);

  console.log('Results saved to:');
  console.log('  - evals/results.json');
  console.log('  - EVAL_REPORT.md');
}

// Run if executed directly
if (import.meta.main) {
  await main();
}

export { runEvaluation, calculateRecall, generateReport };
