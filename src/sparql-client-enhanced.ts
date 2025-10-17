/**
 * Enhanced SPARQL client with focused predicate retrieval
 * Uses consolidated predicates and semantic search for better NL→SPARQL
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const JENA_ENDPOINT = process.env.JENA_ENDPOINT || 'http://localhost:3030/koi/sparql';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const GPT_MODEL = process.env.GPT_MODEL || 'gpt-4o-mini';
const EMBEDDING_SERVICE_URL = process.env.EMBEDDING_SERVICE_URL || 'http://localhost:8095';
const COMMUNITY_PATH = process.env.COMMUNITY_PATH;
const CONSOLIDATION_PATH = process.env.CONSOLIDATION_PATH;
const PATTERNS_PATH = process.env.PATTERNS_PATH;

// Load consolidated predicates and patterns
let PREDICATE_MAPPING: any = {};
let PREDICATE_PATTERNS: any[] = [];
let CONSOLIDATION_INFO: any = {};
let PREDICATE_TO_COMMUNITY: Record<string, number> = {};
let COMMUNITY_MEMBERS: Record<string, string[]> = {};
let COMMUNITY_CENTRALITY: Record<string, number> = {};

// Domain stopwords to suppress obvious non-domain noise (e.g., JS i18n libs)
const STOPWORDS = [
  'lingui', 'i18n', '@lingui', 'trans component', 'gettext', 'webpack', 'babel', 'eslint', 'typescript', 'react-intl'
];

// Canonical category keyword mapping
const CANONICAL_KEYWORDS: Record<string, string[]> = {
  eco_credit: [
    'eco credit', 'ecocredit', 'ecocredits', 'carbon', 'carbon credit', 'carbon credits',
    'retire', 'retired', 'retirement', 'retirements', 'credit retirement', 'credit retirements',
    'offset', 'offsets', 'registry', 'credit class', 'vcs', 'verra', 'vcu', 'tco2', 'co2', 'ton', 'tons', 'tonne', 'tonnes'
  ],
  finance: [
    'treasury', 'treasuries', 'token', 'stablecoin', 'stablecoins', 'usdc', 'usdt', 'finance', 'financial',
    'market', 'price', 'swap', 'dex', 'amm', 'liquidity', 'liquidity pool', 'yield', 'stake', 'staking', 'loan', 'interest', 'bond', 'flywheel'
  ],
  funding: [
    'fund', 'funds', 'funded', 'funding', 'grant', 'grants', 'grantmaking', 'invest', 'investment', 'invests',
    'investor', 'sponsor', 'backed', 'fundraise', 'fundraising', 'donate', 'donation'
  ],
  governance: [
    'governance', 'vote', 'voting', 'proposal', 'proposals', 'proposal id', 'validator', 'validators', 'delegate',
    'delegation', 'quorum', 'onchain', 'on-chain', 'dao', 'governor', 'upgrade', 'veto', 'referendum'
  ],
  water: [
    'water', 'hydro', 'aquifer', 'groundwater', 'watershed', 'river', 'lake', 'ocean', 'wbu',
    'water benefit', 'water benefit unit', 'water benefit units', 'stormwater', 'river basin', 'aquifer recharge'
  ],
  creation: ['create', 'created', 'author', 'authored', 'build', 'built', 'develop', 'founded', 'publish', 'published', 'design', 'designed'],
  leadership: ['lead', 'leads', 'leader', 'ceo', 'cto', 'director', 'head', 'chair', 'chairman', 'manage', 'managed', 'manages', 'runs', 'run', 'president', 'founder', 'cofounder'],
  collaboration: ['partner', 'partners', 'partnership', 'collaborate', 'collaboration', 'works with', 'coalition', 'ally', 'alliance'],
  location: ['located', 'based in', 'headquarter', 'hq', 'city', 'country', 'region']
};

// Load consolidation data
try {
  const candidates = [
    CONSOLIDATION_PATH,
    path.join(__dirname, '../../koi-processor/src/core/final_consolidation_all_t0.25.json'),
    path.join(__dirname, '../../koi-processor/src/core/final_consolidation_t0.25.json'),
    path.join(__dirname, '../../koi-processor/src/core/final_consolidation_all_t0.30.json'),
    path.join(__dirname, '../../koi-processor/src/core/final_consolidation_t0.30.json')
  ].filter(Boolean) as string[];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
      PREDICATE_MAPPING = data.mapping || data.predicate_mapping || {};
      CONSOLIDATION_INFO = data.consolidation_info || data.cluster_info || {};
      console.log(`Loaded consolidation: ${Object.keys(PREDICATE_MAPPING).length} predicate mappings from ${p}`);
      break;
    }
  }
} catch (error) {
  console.warn('Could not load predicate consolidation:', error);
}

// Load predicate patterns for better context
try {
  const patternsPath = PATTERNS_PATH || path.join(__dirname, '../../koi-processor/src/core/predicate_patterns.json');
  if (fs.existsSync(patternsPath)) {
    PREDICATE_PATTERNS = JSON.parse(fs.readFileSync(patternsPath, 'utf-8'));
    console.log(`Loaded ${PREDICATE_PATTERNS.length} predicate patterns`);
  }
} catch (error) {
  console.warn('Could not load predicate patterns:', error);
}

// Load predicate communities if available
try {
  const candidates = [
    COMMUNITY_PATH,
    path.join(__dirname, '../../koi-processor/src/core/predicate_communities.json')
  ].filter(Boolean) as string[];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
      PREDICATE_TO_COMMUNITY = data.predicate_to_community || {};
      COMMUNITY_CENTRALITY = data.centrality || {};
      // Build community to members map
      const comms = data.communities || [];
      for (const c of comms) {
        COMMUNITY_MEMBERS[String(c.id)] = c.members || [];
      }
      console.log(`Loaded predicate communities: ${Object.keys(COMMUNITY_MEMBERS).length} communities`);
      break;
    }
  }
} catch (e) {
  console.warn('Could not load predicate communities:', e);
}

// Intent patterns for better query understanding
const INTENT_PATTERNS = {
  employment: ['work', 'employ', 'job', 'staff', 'hire', 'position'],
  creation: ['create', 'develop', 'build', 'make', 'produce', 'design', 'establish'],
  collaboration: ['partner', 'collaborate', 'cooperate', 'work with', 'team'],
  funding: ['fund', 'finance', 'sponsor', 'invest', 'support', 'back'],
  leadership: ['lead', 'direct', 'manage', 'head', 'oversee', 'run'],
  ownership: ['own', 'have', 'possess', 'control', 'hold'],
  focus: ['focus', 'aim', 'target', 'address', 'concentrate'],
  aggregation: ['how many', 'count', 'number', 'total', 'amount']
};

export class EnhancedSPARQLClient {
  private queryCache: Map<string, any> = new Map();
  private totalPredicateUsage: number = 0;

  constructor() {
    // Precompute total usage for coverage calculations
    try {
      this.totalPredicateUsage = PREDICATE_PATTERNS.reduce((sum, p) => sum + (p.count || 0), 0);
    } catch {
      this.totalPredicateUsage = 0;
    }
  }

  /**
   * Detect intent from natural language query
   */
  private detectIntent(query: string): string {
    const queryLower = query.toLowerCase();

    for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
      if (patterns.some(pattern => queryLower.includes(pattern))) {
        return intent;
      }
    }

    return 'general';
  }

  /** Detect canonical categories from query keywords */
  private detectCanonicalCategories(query: string): string[] {
    const q = query.toLowerCase();
    const cats: string[] = [];
    for (const [cat, kws] of Object.entries(CANONICAL_KEYWORDS)) {
      if (kws.some(k => q.includes(k))) cats.push(cat);
    }
    // De-duplicate
    return Array.from(new Set(cats));
  }

  /** Build canonical predicate clause + filter */
  private buildCanonicalFilter(categories: string[]): string {
    if (!categories || categories.length === 0) return '';
    const vals = categories.map(c => `"${c.replace(/"/g, '\\"')}"`).join(' ');
    return `?stmt regx:canonicalPredicate ?_canon .\n  VALUES ?_canon { ${vals} }`;
  }

  /**
   * Find relevant predicates for the query using patterns and intent
   */
  private findRelevantPredicatesScored(query: string, intent: string): {predicate: string; score: number; count: number;}[] {
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter(Boolean);

    // Build a scored list from patterns
    const scored: {predicate: string; score: number; count: number;}[] = [];

    const intentSet = new Set(this.getIntentPredicates(intent).map(s => s.toLowerCase()));

    for (const pattern of PREDICATE_PATTERNS) {
      const pred = pattern.predicate as string;
      const predLower = pred.toLowerCase();
      const predWords = predLower.split(/[\s_-]+/);
      const count = pattern.count || 0;

      let score = 0;
      // Intent boost if predicate resembles an intent term
      if ([...intentSet].some(ip => predLower.includes(ip))) score += 3;
      // Keyword overlap
      const overlap = queryWords.filter(qw => qw.length > 2 && predWords.some(pw => pw.includes(qw) || qw.includes(pw))).length;
      score += overlap * 2;
      // Usage prior
      score += Math.min(count / 100, 5);

      if (score > 0) scored.push({ predicate: pred, score, count });
    }

    // Sort descending by score, then by count
    scored.sort((a, b) => (b.score - a.score) || (b.count - a.count));
    return scored;
  }

  private async findRelevantPredicatesByEmbedding(query: string, topK = 50): Promise<{predicate: string; score: number; count: number;}[]> {
    try {
      const resp = await axios.post(`${EMBEDDING_SERVICE_URL}/similar`, { query, top_k: topK }, { timeout: 2000 });
      const items: any[] = (resp.data as any[]) || [];
      // Map to common shape
      return items.map(it => ({
        predicate: it.predicate || it.consolidated || '',
        score: typeof it.score === 'number' ? it.score : 0,
        count: typeof it.count === 'number' ? it.count : 0
      })).filter(x => x.predicate);
    } catch (e) {
      return [];
    }
  }

  private cumulativeCoverage(predicates: string[]): number {
    if (!this.totalPredicateUsage) return 0;
    const set = new Set(predicates);
    const covered = PREDICATE_PATTERNS.reduce((sum, p) => sum + (set.has(p.predicate) ? (p.count || 0) : 0), 0);
    return covered / this.totalPredicateUsage;
  }

  private async findRelevantPredicatesAdaptiveAsync(query: string, intent: string, baseK = 15, coverageTarget = 0.8, maxK = 300): Promise<string[]> {
    const [embed, scored] = await Promise.all([
      this.findRelevantPredicatesByEmbedding(query, Math.max(baseK * 3, 60)),
      Promise.resolve(this.findRelevantPredicatesScored(query, intent))
    ]);
    // Merge, preferring embedding order then scored
    const mergedMap = new Map<string, {predicate: string; score: number; count: number; src: string}>();
    embed.forEach((e, idx) => mergedMap.set(e.predicate, { ...e, src: 'embed' }));
    scored.forEach((s) => {
      if (!mergedMap.has(s.predicate)) mergedMap.set(s.predicate, { ...s, src: 'scored' });
    });
    const merged = Array.from(mergedMap.values());
    // Start with K and grow until coverage is met or maxK reached
    // Start with K and grow until coverage is met or maxK reached
    let K = baseK;
    let selected: string[] = merged.slice(0, K).map(s => s.predicate);
    let cov = this.cumulativeCoverage(selected);
    while (cov < coverageTarget && K < maxK && K < merged.length) {
      K = Math.min(K + 20, maxK);
      selected = merged.slice(0, K).map(s => s.predicate);
      cov = this.cumulativeCoverage(selected);
    }

    // Expand with a small number of variants per consolidated form
    const expanded = new Set<string>(selected);
    for (const p of selected.slice(0, 100)) { // widen expansion overhead for coverage
      const consolidated = PREDICATE_MAPPING[p];
      if (consolidated && CONSOLIDATION_INFO[consolidated]?.members) {
        for (const m of CONSOLIDATION_INFO[consolidated].members.slice(0, 10)) {
          expanded.add(m);
        }
      }
    }

    // Community-aware expansion: add top-central members from same communities
    const communityIds = new Set<number>();
    for (const p of selected) {
      const cid = PREDICATE_TO_COMMUNITY[p];
      if (cid !== undefined) communityIds.add(cid);
    }
    let added = 0;
    for (const cid of Array.from(communityIds)) {
      const members = COMMUNITY_MEMBERS[String(cid)] || [];
      // Sort by centrality desc
      const sorted = members.slice().sort((a, b) => (COMMUNITY_CENTRALITY[b] || 0) - (COMMUNITY_CENTRALITY[a] || 0));
      for (const m of sorted) {
        if (!expanded.has(m)) {
          expanded.add(m);
          added += 1;
          if (added >= 150) break;
        }
      }
      if (added >= 150) break;
    }

    return Array.from(expanded);
  }

  /**
   * Get predicates for specific intent
   */
  private getIntentPredicates(intent: string): string[] {
    const intentMappings: Record<string, string[]> = {
      employment: ['works for', 'employed by', 'works at', 'employee of', 'hired by'],
      creation: ['created', 'developed', 'built', 'made', 'produced', 'designed'],
      collaboration: ['partners with', 'collaborates with', 'works with', 'cooperates with'],
      funding: ['funds', 'finances', 'sponsors', 'invests in', 'supports', 'backs'],
      leadership: ['leads', 'directs', 'manages', 'heads', 'oversees', 'runs'],
      ownership: ['owns', 'has', 'possesses', 'controls', 'holds'],
      focus: ['focuses on', 'aims to', 'targets', 'addresses', 'concentrates on'],
      aggregation: ['has', 'includes', 'contains', 'comprises']
    };

    return intentMappings[intent] || [];
  }

  /**
   * Build focused schema context for LLM
   */
  private buildFocusedSchema(query: string, predicates: string[]): string {
    const intent = this.detectIntent(query);

    let schema = `# Focused Schema for Query\n\n`;
    schema += `## Query Intent: ${intent}\n\n`;

    schema += `## Entity Types\n`;
    schema += `- Text strings (subjects and objects are literals, not URIs)\n`;
    schema += `- Common patterns: Person names, Organization names, Project descriptions\n\n`;

    schema += `## Relevant Predicates (${predicates.length})\n`;

    // Group predicates by consolidated form
    const groups: Record<string, string[]> = {};

    for (const pred of predicates) {
      const consolidated = PREDICATE_MAPPING[pred] || pred;
      if (!groups[consolidated]) {
        groups[consolidated] = [];
      }
      if (!groups[consolidated].includes(pred)) {
        groups[consolidated].push(pred);
      }
    }

    // Show consolidated groups
    for (const [consolidated, variants] of Object.entries(groups).slice(0, 10)) {
      schema += `- **${consolidated}**`;
      if (variants.length > 1) {
        schema += ` (variants: ${variants.slice(0, 3).join(', ')}`;
        if (variants.length > 3) schema += `, +${variants.length - 3} more`;
        schema += ')';
      }
      schema += '\n';
    }

    schema += `\n## Query Structure\n`;
    schema += `Note: Subjects and objects are text literals, not entity URIs\n`;
    schema += `\`\`\`sparql\n`;
    schema += `PREFIX regx: <https://regen.network/ontology/experimental#>\n`;
    schema += `SELECT ?subject ?predicate ?object WHERE {\n`;
    schema += `  ?stmt a regx:Statement .\n`;
    schema += `  ?stmt regx:subject ?subject .\n`;
    schema += `  ?stmt regx:predicate ?predicate .\n`;
    schema += `  ?stmt regx:object ?object .\n`;
    schema += `  # Use FILTER with CONTAINS for text matching\n`;
    schema += `  # Use OR filters for predicate variants\n`;
    schema += `}\n`;
    schema += `\`\`\`\n`;

    return schema;
  }

  /** Build a predicate FILTER clause */
  private buildPredicateFilter(predicates: string[], maxPredicates = 50): string {
    const unique = Array.from(new Set(predicates)).slice(0, maxPredicates);
    if (unique.length === 0) return '';
    const cond = unique.map(p => `?predicate = "${p.replace(/"/g, '\\"')}"`).join(' || ');
    return `FILTER(${cond})`;
  }

  /** Build a broad SPARQL without predicate filter (entity/topic regex only) */
  private buildBroadQuery(nlQuery: string, limit: number, applyCanonical: boolean = true): string {
    const words = nlQuery.split(/\s+/);
    const entities = words.filter(w => w[0] === w[0].toUpperCase() && w.length > 2);
    const eps = entities.map(e => e.toLowerCase());
    const tokens = words.map(w => w.toLowerCase()).filter(w => w.length > 3 && !['what','which','who','that','with','from','into','about','this','will','have','been','were','your','their','those'].includes(w));
    let textFilter = '';
    if (eps.length > 0) {
      const re = eps.map(ep => ep.replace(/[-/\\^$*+?.()|[\]{}]/g, '')).join('|');
      textFilter = `FILTER(regex(LCASE(STR(?subject)), "(${re})") || regex(LCASE(STR(?object)), "(${re})"))`;
    } else if (tokens.length > 0) {
      const re = tokens.map(t => t.replace(/[-/\\^$*+?.()|[\]{}]/g, '')).join('|');
      textFilter = `FILTER(regex(LCASE(STR(?subject)), "(${re})") || regex(LCASE(STR(?object)), "(${re})") || regex(LCASE(STR(?predicate)), "(${re})"))`;
    }
    // Negative filter for stopwords
    const stopRe = STOPWORDS.map(s => s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '')).join('|');
    const negativeFilter = `FILTER(!regex(LCASE(STR(?subject)), "(${stopRe})") && !regex(LCASE(STR(?object)), "(${stopRe})") && !regex(LCASE(STR(?predicate)), "(${stopRe})"))`;

    const canon = applyCanonical ? this.buildCanonicalFilter(this.detectCanonicalCategories(nlQuery)) : '';
    return `PREFIX regx: <https://regen.network/ontology/experimental#>
SELECT DISTINCT ?subject ?predicate ?object WHERE {
  ?stmt a regx:Statement .
  ?stmt regx:subject ?subject .
  ?stmt regx:predicate ?predicate .
  ?stmt regx:object ?object .
  ${canon}
  ${textFilter}
  ${negativeFilter}
}
LIMIT ${limit}`;
  }

  /** Build a focused SPARQL with predicate filter */
  private buildFocusedQuery(nlQuery: string, predicates: string[], limit: number, applyCanonical: boolean = true): string {
    const predicateFilter = this.buildPredicateFilter(predicates, 80);
    const words = nlQuery.split(/\s+/);
    const entities = words.filter(w => w[0] === w[0].toUpperCase() && w.length > 2);
    const eps = entities.map(e => e.toLowerCase());
    let entityFilter = '';
    if (eps.length === 1) {
      const ep = eps[0].replace(/[-/\\^$*+?.()|[\]{}]/g, '');
      entityFilter = `FILTER(CONTAINS(LCASE(?subject), "${ep}") || CONTAINS(LCASE(?object), "${ep}"))`;
    } else if (eps.length > 1) {
      const re = eps.map(ep => ep.replace(/[-/\\^$*+?.()|[\]{}]/g, '')).join('|');
      entityFilter = `FILTER(regex(LCASE(STR(?subject)), "(${re})") || regex(LCASE(STR(?object)), "(${re})"))`;
    }
    if (!entityFilter) {
      const tokens = words.map(w => w.toLowerCase()).filter(w => w.length > 3 && !['what','which','who','that','with','from','into','about','this','will','have','been','were','your','their','those'].includes(w));
      if (tokens.length > 0) {
        const re = tokens.map(t => t.replace(/[-/\\^$*+?.()|[\]{}]/g, '')).join('|');
        entityFilter = `FILTER(regex(LCASE(STR(?subject)), "(${re})") || regex(LCASE(STR(?object)), "(${re})"))`;
      }
    }
    const stopRe = STOPWORDS.map(s => s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '')).join('|');
    const negativeFilter = `FILTER(!regex(LCASE(STR(?subject)), "(${stopRe})") && !regex(LCASE(STR(?object)), "(${stopRe})") && !regex(LCASE(STR(?predicate)), "(${stopRe})"))`;

    const canon = applyCanonical ? this.buildCanonicalFilter(this.detectCanonicalCategories(nlQuery)) : '';
    return `PREFIX regx: <https://regen.network/ontology/experimental#>
SELECT DISTINCT ?subject ?predicate ?object WHERE {
  ?stmt a regx:Statement .
  ?stmt regx:subject ?subject .
  ?stmt regx:predicate ?predicate .
  ?stmt regx:object ?object .
  ${canon}
  ${predicateFilter}
  ${entityFilter}
  ${negativeFilter}
}
LIMIT ${limit}`;
  }

  /** Grouped summary by predicate for exploration */
  private buildGroupedSummary(nlQuery: string, limit: number): string {
    const words = nlQuery.split(/\s+/);
    const entities = words.filter(w => w[0] === w[0].toUpperCase() && w.length > 2);
    const entityPattern = entities.join('|').toLowerCase();
    const textFilter = entityPattern
      ? `FILTER(CONTAINS(LCASE(?subject), "${entityPattern}") || CONTAINS(LCASE(?object), "${entityPattern}"))`
      : '';
    const canon = this.buildCanonicalFilter(this.detectCanonicalCategories(nlQuery));
    return `PREFIX regx: <https://regen.network/ontology/experimental#>
SELECT ?predicate (COUNT(*) as ?count) WHERE {
  ?stmt a regx:Statement .
  ?stmt regx:subject ?subject .
  ?stmt regx:predicate ?predicate .
  ?stmt regx:object ?object .
  ${canon}
  ${textFilter}
}
GROUP BY ?predicate
ORDER BY DESC(?count)
LIMIT ${Math.max(50, limit)}`;
  }

  /**
   * Convert natural language to SPARQL using focused retrieval
   */
  async naturalLanguageToSparql(nlQuery: string, limit: number = 50): Promise<string> {
    // Check cache
    const cacheKey = createHash('md5').update(nlQuery).digest('hex');
    if (this.queryCache.has(cacheKey)) {
      return this.queryCache.get(cacheKey);
    }

    // Detect intent
    const intent = this.detectIntent(nlQuery);

    // Find relevant predicates (base K) using adaptive + embeddings where available
    const relevantPredicates = await this.findRelevantPredicatesAdaptiveAsync(nlQuery, intent, 15, 0.8, 300);

    // Build focused schema
    const schema = this.buildFocusedSchema(nlQuery, relevantPredicates);

    // If no OpenAI key, generate template query
    if (!OPENAI_API_KEY) {
      return this.generateTemplateQuery(nlQuery, intent, relevantPredicates, limit);
    }

    try {
      // Generate SPARQL with focused context
      const prompt = `Convert this natural language query to SPARQL.

Natural Language Query: ${nlQuery}

${schema}

Instructions:
1. Use the exact predicate names from the schema above
2. Remember that subjects and objects are text strings, not URIs
3. Use FILTER with CONTAINS for text matching
4. Include LIMIT ${limit}
5. Return only the SPARQL query, no explanation

SPARQL Query:`;

      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: GPT_MODEL,
          messages: [
            { role: 'system', content: 'You are a SPARQL query expert. Generate valid SPARQL queries based on the provided schema.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3,
          max_tokens: 500
        },
        {
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const data: any = response.data as any;
      let sparql = data?.choices?.[0]?.message?.content?.trim?.() || '';

      // Clean up the response
      if (sparql.includes('```sparql')) {
        sparql = sparql.split('```sparql')[1].split('```')[0].trim();
      } else if (sparql.includes('```')) {
        sparql = sparql.split('```')[1].split('```')[0].trim();
      }

      // Cache the result
      this.queryCache.set(cacheKey, sparql);

      return sparql;
    } catch (error: any) {
      console.error('OpenAI API error:', error.response?.data || error.message);
      // Fallback to template
      return this.generateTemplateQuery(nlQuery, intent, relevantPredicates, limit);
    }
  }

  /**
   * Run adaptive query: dual-branch (focused + broad) when appropriate and fuse results
   */
  async queryAdaptive(nlQuery: string, options: { limit?: number; mode?: 'auto'|'focused'|'broad'|'dual'; } = {}) {
    const limit = options.limit ?? 50;
    const queryLower = nlQuery.toLowerCase();
    const intent = this.detectIntent(nlQuery);

    // Heuristic mode selection
    const hasEntity = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/.test(nlQuery);
    const hasExplicitVerb = Object.values(INTENT_PATTERNS).flat().some(v => queryLower.includes(v));
    const wantsExploration = /(everything|all|show|list|about)/.test(queryLower);

    let mode: 'focused'|'broad'|'dual' = 'focused';
    if (options.mode && options.mode !== 'auto') {
      mode = options.mode as any;
    } else {
      if (hasExplicitVerb && hasEntity) mode = 'focused';
      else if (hasEntity && wantsExploration) mode = 'dual';
      else mode = 'broad';
    }

    // Prepare focused predicates (dynamic K). Use a higher baseK for topic/exploration.
    const baseK = (hasExplicitVerb && hasEntity) ? 15 : 50;
    const predicates = await this.findRelevantPredicatesAdaptiveAsync(nlQuery, intent, baseK, 0.7, 300);
    // Start with canonical filtering enabled
    let focusedSPARQL = this.buildFocusedQuery(nlQuery, predicates, limit, true);
    let broadSPARQL = this.buildBroadQuery(nlQuery, limit, true);

    // Execute branch(es)
    let resultsFocused: any = null;
    let resultsBroad: any = null;

    const countBindings = (res: any) => res?.results?.bindings?.length || 0;
    if (mode === 'focused') {
      resultsFocused = await this.executeQuery(focusedSPARQL);
      // Fallback: if no results, try a broad query without canonical filter
      if (countBindings(resultsFocused) === 0) {
        const fallbackBroad = this.buildBroadQuery(nlQuery, limit, false);
        broadSPARQL = fallbackBroad;
        resultsBroad = await this.executeQuery(fallbackBroad);
      }
    } else if (mode === 'broad') {
      resultsBroad = await this.executeQuery(broadSPARQL);
      // Fallback: if no results, disable canonical filter
      if (countBindings(resultsBroad) === 0) {
        const fallbackBroad = this.buildBroadQuery(nlQuery, limit, false);
        broadSPARQL = fallbackBroad;
        resultsBroad = await this.executeQuery(fallbackBroad);
      }
    } else {
      const [a, b] = await Promise.all([
        this.executeQuery(focusedSPARQL),
        this.executeQuery(broadSPARQL)
      ]);
      resultsFocused = a; resultsBroad = b;
      // If union is empty, drop canonical from broad branch and retry
      if (countBindings(resultsFocused) + countBindings(resultsBroad) === 0) {
        const fallbackBroad = this.buildBroadQuery(nlQuery, limit, false);
        broadSPARQL = fallbackBroad;
        resultsBroad = await this.executeQuery(fallbackBroad);
      }
    }

    // Optionally, get grouped summary for exploration
    let summary: any = null;
    if (mode !== 'focused') {
      try {
        summary = await this.executeQuery(this.buildGroupedSummary(nlQuery, limit));
      } catch {}
    }

    // Fuse results
    const fused = this.fuseResults(resultsFocused, resultsBroad);
    const formatted = this.formatFusedResults(fused, nlQuery, summary);

    return { formatted, raw: fused, focusedSPARQL, broadSPARQL };
  }

  private fuseResults(resA: any, resB: any) {
    // Simple reciprocal rank fusion over triples
    const map = new Map<string, {subject: string; predicate: string; object: string; score: number; source: string[]}>();
    const add = (res: any, src: string) => {
      const bindings = res?.results?.bindings || [];
      bindings.forEach((b: any, idx: number) => {
        const s = b.subject?.value || '';
        const p = b.predicate?.value || '';
        const o = b.object?.value || '';
        const key = `${s}\u241E${p}\u241E${o}`;
        const rrf = 1 / (60 + idx + 1);
        if (map.has(key)) {
          const entry = map.get(key)!;
          entry.score += rrf;
          if (!entry.source.includes(src)) entry.source.push(src);
        } else {
          map.set(key, { subject: s, predicate: p, object: o, score: rrf, source: [src] });
        }
      });
    };
    if (resA) add(resA, 'focused');
    if (resB) add(resB, 'broad');
    return Array.from(map.values()).sort((a, b) => b.score - a.score);
  }

  private formatFusedResults(fused: any[], originalQuery: string, summary?: any): string {
    if (!fused || fused.length === 0) {
      return 'No results found.';
    }
    let out = `## Graph Query Results (Adaptive, ${fused.length} merged)\n\n`;
    const both = fused.filter(f => f.source.length > 1).slice(0, 5);
    if (both.length > 0) {
      out += '### Found in Focused and Broad\n';
      for (const f of both) {
        const subjShort = f.subject.length > 80 ? f.subject.slice(0, 80) + '...' : f.subject;
        const objShort = f.object.length > 120 ? f.object.slice(0, 120) + '...' : f.object;
        out += `- ${subjShort} → ${f.predicate} → ${objShort}\n`;
      }
      out += '\n';
    }
    out += '### Top Results\n';
    for (const f of fused.slice(0, 15)) {
      const subjShort = f.subject.length > 80 ? f.subject.slice(0, 80) + '...' : f.subject;
      const objShort = f.object.length > 120 ? f.object.slice(0, 120) + '...' : f.object;
      out += `- ${subjShort} → ${f.predicate} → ${objShort}  (src: ${f.source.join('+')})\n`;
    }

    if (summary?.results?.bindings?.length) {
      out += '\n### Predicate Summary (top)\n';
      for (const b of summary.results.bindings.slice(0, 15)) {
        out += `- ${b.predicate.value} (${b.count.value})\n`;
      }
    }
    return out;
  }

  /**
   * Generate template SPARQL query without AI
   */
  private generateTemplateQuery(query: string, intent: string, predicates: string[], limit: number): string {
    const queryLower = query.toLowerCase();

    // Build predicate filter
    let predicateFilter = '';
    if (predicates.length > 0) {
      const predicateConditions = predicates
        .slice(0, 5)
        .map(p => `?predicate = "${p}"`)
        .join(' || ');
      predicateFilter = `FILTER(${predicateConditions})`;
    }

    // Extract potential entity names (capitalized words)
    const words = query.split(/\s+/);
    const entities = words.filter(w => w[0] === w[0].toUpperCase() && w.length > 2);

    let entityFilter = '';
    if (entities.length > 0) {
      const entityPattern = entities.join('|').toLowerCase();
      entityFilter = `FILTER(CONTAINS(LCASE(?subject), "${entityPattern}") || CONTAINS(LCASE(?object), "${entityPattern}"))`;
    }

    // Generate query based on intent
    let sparql = `PREFIX regx: <https://regen.network/ontology/experimental#>\n\n`;

    if (intent === 'aggregation') {
      sparql += `SELECT (COUNT(DISTINCT ?subject) as ?count) WHERE {\n`;
    } else {
      sparql += `SELECT DISTINCT ?subject ?predicate ?object WHERE {\n`;
    }

    sparql += `  ?stmt a regx:Statement .\n`;
    sparql += `  ?stmt regx:subject ?subject .\n`;
    sparql += `  ?stmt regx:predicate ?predicate .\n`;
    sparql += `  ?stmt regx:object ?object .\n`;
    const canon = this.buildCanonicalFilter(this.detectCanonicalCategories(query));
    if (canon) {
      sparql += `  ${canon}\n`;
    }

    if (predicateFilter) {
      sparql += `  ${predicateFilter}\n`;
    }

    if (entityFilter) {
      sparql += `  ${entityFilter}\n`;
    }

    sparql += `}\n`;

    if (intent !== 'aggregation') {
      sparql += `LIMIT ${limit}`;
    }

    return sparql;
  }

  /**
   * Execute a SPARQL query against Apache Jena
   */
  async executeQuery(sparql: string): Promise<any> {
    try {
      const response = await axios.post(
        JENA_ENDPOINT,
        `query=${encodeURIComponent(sparql)}`,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/sparql-results+json'
          },
          timeout: 30000
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('SPARQL execution error:', error.response?.data || error.message);
      throw new Error(`SPARQL query failed: ${error.response?.data || error.message}`);
    }
  }

  /**
   * Format SPARQL results for display
   */
  formatResults(results: any, originalQuery: string): string {
    if (!results?.results?.bindings) {
      return 'No results found.';
    }

    const bindings = results.results.bindings;

    if (bindings.length === 0) {
      return 'No results found for your query.';
    }

    let formatted = `## Graph Query Results (${bindings.length} results)\n\n`;

    // Format based on result structure
    if (bindings[0].count) {
      // Aggregation result
      formatted += `**Count**: ${bindings[0].count.value}\n`;
    } else {
      // Triple results
      for (const binding of bindings.slice(0, 20)) {
        const subject = binding.subject?.value || '';
        const predicate = binding.predicate?.value || '';
        const object = binding.object?.value || '';

        // Truncate long values
        const subjShort = subject.length > 50 ? subject.substring(0, 50) + '...' : subject;
        const objShort = object.length > 100 ? object.substring(0, 100) + '...' : object;

        formatted += `- **${subjShort}** → *${predicate}* → ${objShort}\n`;
      }

      if (bindings.length > 20) {
        formatted += `\n... and ${bindings.length - 20} more results\n`;
      }
    }

    return formatted;
  }
}

// Export as default for compatibility
export { EnhancedSPARQLClient as SPARQLClient };
