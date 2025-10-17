#!/usr/bin/env node
// NL→SPARQL evaluation harness (adaptive dual-branch)
// Reports validity (execution), answer presence, and branch contribution

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadClient() {
  const mod = await import('../dist/sparql-client-enhanced.js');
  return new mod.SPARQLClient();
}

function tripleSet(results) {
  const set = new Set();
  const bindings = results?.results?.bindings || [];
  for (const b of bindings) {
    const s = b.subject?.value || '';
    const p = b.predicate?.value || '';
    const o = b.object?.value || '';
    set.add(`${s}\u241E${p}\u241E${o}`);
  }
  return set;
}

async function run() {
  const client = await loadClient();

  const queries = [
    'Everything about Gregory Landua',
    'What did Gregory Landua create related to AI agents?',
    'Which statements mention eco-credit retirements matched in stablecoins?',
    'Find relationships mentioning water benefit units',
    'What does Regen Network have a license for?',
    'Count statements about treasury mechanisms',
    'Show collaborations with Ethereum',
    'Projects developed by Microsoft',
    'Who leads regenerative initiatives?',
    'Funding related to carbon credits',
    'Water regulation and scrutiny',
    'Regen Treasury flywheel statements',
    'Governance proposals and validators',
    'Entities connected to Regen Network',
    'Partnerships and collaborations',
    'Created or authored by Gregory',
    'Statements about stablecoins',
    'Eco-credit retirements topics',
    'Which organizations fund regenerative agriculture?',
    'Which statements discuss soil health?'
  ];
  // Stopword list for noise detection (mirror client)
  const STOPWORDS = [
    'lingui', 'i18n', '@lingui', 'trans component', 'gettext', 'webpack', 'babel', 'eslint', 'typescript', 'react-intl'
  ];

  const results = [];
  let pass = 0;
  for (const q of queries) {
    const start = Date.now();
    const adaptive = await client.queryAdaptive(q, { limit: 40 });

    // Execute returned SPARQL branches for counts
    const [resF, resB] = await Promise.all([
      client.executeQuery(adaptive.focusedSPARQL).catch(() => null),
      client.executeQuery(adaptive.broadSPARQL).catch(() => null)
    ]);

    const setF = tripleSet(resF);
    const setB = tripleSet(resB);
    const unionSize = new Set([...setF, ...setB]).size;
    const interSize = [...setF].filter(x => setB.has(x)).length;

    const valid = !!(resF || resB);
    const answered = unionSize > 0;
    if (valid && answered) pass += 1;

    const latency = Date.now() - start;
    console.log(`\n=== ${q} ===`);
    console.log(`Focused: ${setF.size} triples, Broad: ${setB.size}, Union: ${unionSize}, Overlap: ${interSize}`);
    console.log(`Latency: ${latency} ms`);
    console.log(adaptive.formatted.split('\n').slice(0, 6).join('\n'));

    // Noise detection on union
    const unionBindings = [
      ...(resF?.results?.bindings || []),
      ...(resB?.results?.bindings || [])
    ];
    let noise = 0;
    let total = unionBindings.length;
    for (const b of unionBindings) {
      const s = (b.subject?.value || '').toLowerCase();
      const p = (b.predicate?.value || '').toLowerCase();
      const o = (b.object?.value || '').toLowerCase();
      if (STOPWORDS.some(w => s.includes(w) || p.includes(w) || o.includes(w))) noise += 1;
    }
    const noiseRate = total ? noise / total : 0;

    // Heuristic query type
    const isEntity = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/.test(q);
    const thresholds = {
      overlap: isEntity ? 3 : 1,
      union: isEntity ? 5 : 25,
      noiseMax: 0.05
    };
    const status = (interSize >= thresholds.overlap && unionSize >= thresholds.union && noiseRate <= thresholds.noiseMax) ? 'pass' : 'warn';

    results.push({
      query: q,
      type: isEntity ? 'entity' : 'topic',
      latency_ms: latency,
      focused: setF.size,
      broad: setB.size,
      union: unionSize,
      overlap: interSize,
      noiseRate,
      thresholds,
      status
    });
  }

  console.log(`\nSummary: ${pass}/${queries.length} valid+answered`);

  // Persist results to disk
  const now = new Date();
  const ts = now.toISOString().replace(/[-:T]/g, '').slice(0, 15);
  const outDir = path.join(__dirname, '..', 'results');
  const outPath = path.join(outDir, `eval_${ts}.json`);
  await (await import('fs/promises')).mkdir(outDir, { recursive: true });
  await (await import('fs/promises')).writeFile(outPath, JSON.stringify({
    timestamp: now.toISOString(),
    summary: { valid_answered: pass, total: queries.length },
    results
  }, null, 2));
  console.log(`Saved eval results to ${outPath}`);
}

run().catch(e => { console.error(e); process.exit(1); });
