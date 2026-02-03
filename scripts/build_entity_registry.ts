#!/usr/bin/env npx ts-node
/**
 * Build Entity Registry Script - FULLY AUTOMATED
 *
 * Fetches credit class and project data from the Regen Ledger API,
 * resolves metadata IRIs to get canonical names, generates aliases,
 * and builds organizations from admin address grouping.
 *
 * NO HARDCODED DATA - everything is fetched and derived automatically.
 *
 * Usage:
 *   npx ts-node scripts/build_entity_registry.ts
 *
 * Or via npm script:
 *   npm run build:registry
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// API configuration
// Use Keplr's public LCD endpoint as default (reliable and maintained)
const LEDGER_API = process.env.LEDGER_API_ENDPOINT || 'https://lcd-regen.keplr.app';
const REGEN_DATA_API = 'https://api.regen.network/data/v2/metadata-graph';

// Rate limiting for metadata resolution
const METADATA_FETCH_DELAY_MS = 100;

// =============================================================================
// Types
// =============================================================================

interface LedgerCreditClass {
  id: string;
  admin: string;
  metadata: string;
  credit_type_abbrev: string;
}

interface LedgerProject {
  id: string;
  admin: string;
  class_id: string;
  jurisdiction: string;
  metadata: string;
  reference_id: string;
}

interface ResolvedMetadata {
  name?: string;
  description?: string;
  alternateNames?: string[];
  provider?: {
    name?: string;
    type?: string;
  };
  [key: string]: any;
}

interface AliasCandidate {
  alias: string;
  confidence: number;
  source: 'metadata' | 'acronym' | 'class_name';  // Removed 'word_pattern' - not authoritative
}

interface Override {
  name?: string;
  aliases?: string[];
  description?: string;
  org_name?: string;
}

interface Overrides {
  credit_classes?: Record<string, Override>;
  projects?: Record<string, Override>;
  organizations?: Record<string, Override>;
}

// =============================================================================
// Metadata Resolution
// =============================================================================

/**
 * Resolve a Regen metadata IRI to get the actual metadata content
 */
async function resolveMetadataIRI(iri: string): Promise<ResolvedMetadata | null> {
  if (!iri) return null;

  try {
    const encodedIRI = encodeURIComponent(iri);
    const url = `${REGEN_DATA_API}/${encodedIRI}`;

    const response = await axios.get(url, {
      timeout: 10000,
      headers: { 'Accept': 'application/ld+json, application/json' }
    });

    return parseMetadata(response.data);
  } catch (error: any) {
    // Silent fail - metadata resolution is best-effort
    if (error.response?.status !== 404) {
      console.error(`  [WARN] Failed to resolve metadata for ${iri.slice(0, 50)}...`);
    }
    return null;
  }
}

/**
 * Parse metadata from various RDF/JSON-LD formats
 */
function parseMetadata(data: any): ResolvedMetadata {
  const result: ResolvedMetadata = {};

  // Handle array wrapper (some responses are wrapped in an array)
  if (Array.isArray(data)) {
    data = data[0] || {};
  }

  // Extract name (try multiple schema variations)
  result.name =
    data['schema:name'] ||
    data['http://schema.org/name'] ||
    data['rdfs:label'] ||
    data['http://www.w3.org/2000/01/rdf-schema#label'] ||
    data['name'] ||
    data['title'] ||
    (data['@graph'] && data['@graph'][0]?.['schema:name']);

  // Handle name as array or object
  if (Array.isArray(result.name)) {
    result.name = result.name[0];
  }
  if (typeof result.name === 'object' && result.name !== null) {
    result.name = result.name['@value'] || result.name['value'] || String(result.name);
  }

  // Extract description
  result.description =
    data['schema:description'] ||
    data['http://schema.org/description'] ||
    data['rdfs:comment'] ||
    data['description'];

  if (Array.isArray(result.description)) {
    result.description = result.description[0];
  }
  if (typeof result.description === 'object' && result.description !== null) {
    result.description = result.description['@value'] || String(result.description);
  }

  // Extract alternate names
  const altNames =
    data['schema:alternateName'] ||
    data['http://schema.org/alternateName'] ||
    data['skos:altLabel'] ||
    data['alternateName'] ||
    [];

  result.alternateNames = Array.isArray(altNames)
    ? altNames.map(n => typeof n === 'object' ? n['@value'] || String(n) : String(n))
    : altNames ? [String(altNames)] : [];

  // Extract provider/organization info
  const provider =
    data['schema:provider'] ||
    data['http://schema.org/provider'] ||
    data['schema:creator'] ||
    data['http://schema.org/creator'] ||
    data['schema:sourceOrganization'] ||
    data['provider'] ||
    data['creator'];

  if (provider) {
    result.provider = {
      name: typeof provider === 'object'
        ? (provider['schema:name'] || provider['name'] || provider['@value'])
        : String(provider),
      type: typeof provider === 'object' ? provider['@type'] : undefined
    };
  }

  return result;
}

// =============================================================================
// Alias Generation
// =============================================================================

/**
 * Generate an acronym from a name
 * "City Forest Credits" → "CFC"
 */
function generateAcronym(name: string): string | null {
  if (!name) return null;

  const words = name.split(/\s+/).filter(w => w.length > 0);
  if (words.length < 2) return null;

  // Only use capitalized words for acronym
  const acronym = words
    .filter(word => /^[A-Z]/.test(word))
    .map(word => word[0].toUpperCase())
    .join('');

  // Acronym should be 2-5 characters
  if (acronym.length >= 2 && acronym.length <= 5) {
    return acronym;
  }

  return null;
}

/**
 * Generate all alias candidates for an entity - AUTHORITATIVE SOURCES ONLY
 *
 * Only includes:
 * - Metadata alternate names (from schema:alternateName) - highest confidence
 * - Acronyms (reasonably safe for multi-word names)
 *
 * REMOVED: Word patterns (not authoritative, caused false matches)
 */
function generateAliases(name: string, metadataAliases: string[] = []): AliasCandidate[] {
  const candidates: AliasCandidate[] = [];
  const seen = new Set<string>();

  const addCandidate = (alias: string, confidence: number, source: AliasCandidate['source']) => {
    const normalized = alias.toLowerCase().trim();
    if (normalized && !seen.has(normalized) && normalized !== name.toLowerCase()) {
      seen.add(normalized);
      candidates.push({ alias, confidence, source });
    }
  };

  // Metadata alternate names (authoritative - highest confidence)
  for (const alias of metadataAliases) {
    addCandidate(alias, 1.0, 'metadata');
  }

  // Acronym (reasonably safe)
  const acronym = generateAcronym(name);
  if (acronym) {
    addCandidate(acronym, 0.9, 'acronym');
  }

  // REMOVED: Word patterns (not authoritative, caused false matches like
  // "City Forest Credits" → "Forest Credits" which doesn't exist in ledger data)

  return candidates;
}

// =============================================================================
// Jurisdiction Parsing
// =============================================================================

/**
 * Parse ISO 3166 jurisdiction codes into human-readable locations
 */
function parseJurisdiction(jurisdiction: string): string {
  if (!jurisdiction) return 'Unknown';

  // ISO 3166-2 subdivision codes
  const subdivisions: Record<string, string> = {
    'US-WA': 'Washington, USA',
    'US-PA': 'Pennsylvania, USA',
    'US-OH': 'Ohio, USA',
    'US-VA': 'Virginia, USA',
    'US-TN': 'Tennessee, USA',
    'US-IA': 'Iowa, USA',
    'US-ID': 'Idaho, USA',
    'US-TX': 'Texas, USA',
    'US-IL': 'Illinois, USA',
    'US-CA': 'California, USA',
    'US-WI': 'Wisconsin, USA',
    'US-NY': 'New York, USA',
    'US-FL': 'Florida, USA',
    'GB-ENG': 'England, UK',
    'GB-SCT': 'Scotland, UK',
    'GB-WLS': 'Wales, UK',
    'AU-NSW': 'New South Wales, Australia',
    'AU-VIC': 'Victoria, Australia',
    'AU-QLD': 'Queensland, Australia',
    'CO-ANT': 'Antioquia, Colombia',
    'CO-CUN': 'Cundinamarca, Colombia',
    'BR-MS': 'Mato Grosso do Sul, Brazil',
    'BR-PA': 'Pará, Brazil',
  };

  // ISO 3166-1 country codes
  const countries: Record<string, string> = {
    'US': 'United States',
    'GB': 'United Kingdom',
    'AU': 'Australia',
    'CO': 'Colombia',
    'BR': 'Brazil',
    'KE': 'Kenya',
    'CD': 'Democratic Republic of Congo',
    'CG': 'Republic of Congo',
    'PE': 'Peru',
    'EC': 'Ecuador',
    'ID': 'Indonesia',
    'KH': 'Cambodia',
    'CN': 'China',
    'IN': 'India',
    'MX': 'Mexico',
    'AR': 'Argentina',
  };

  // Clean up jurisdiction (remove zip codes, etc.)
  const cleaned = jurisdiction.split(' ')[0].trim();

  // Try exact match on subdivision
  if (subdivisions[cleaned]) {
    return subdivisions[cleaned];
  }

  // Try country code (first 2 chars)
  const countryCode = cleaned.substring(0, 2).toUpperCase();
  if (countries[countryCode]) {
    // If it's a subdivision code, append country
    if (cleaned.includes('-')) {
      const subdivision = cleaned.split('-')[1];
      return `${subdivision}, ${countries[countryCode]}`;
    }
    return countries[countryCode];
  }

  return jurisdiction;
}

// =============================================================================
// Organization Building
// =============================================================================

interface OrgData {
  key: string;
  name: string;
  type: 'ORGANIZATION';
  aliases: string[];
  administered_classes: string[];
  description: string;
}

/**
 * Build organizations by grouping classes by admin address
 * and extracting org names from metadata
 */
function buildOrganizations(
  classes: Array<{ id: string; admin: string; name: string; provider?: { name?: string } }>
): Record<string, OrgData> {
  const adminToClasses = new Map<string, string[]>();
  const adminToOrgName = new Map<string, string>();

  // Group classes by admin address
  for (const cls of classes) {
    const admin = cls.admin;
    if (!adminToClasses.has(admin)) {
      adminToClasses.set(admin, []);
    }
    adminToClasses.get(admin)!.push(cls.id);

    // Try to extract org name from provider metadata
    if (cls.provider?.name && !adminToOrgName.has(admin)) {
      adminToOrgName.set(admin, cls.provider.name);
    }
  }

  const organizations: Record<string, OrgData> = {};

  for (const [admin, classIds] of adminToClasses) {
    // Get org name from metadata, or generate from class names
    let orgName = adminToOrgName.get(admin);
    let aliases: string[] = [];

    if (!orgName) {
      // Try to derive org name from class names by finding distinctive first words
      const classNames = classIds.map(id =>
        classes.find(c => c.id === id)?.name || id
      );

      // Look for distinctive first words (not generic like "Credit", "Class", etc.)
      const genericWords = new Set([
        'credit', 'credits', 'class', 'carbon', 'protocol', 'tokens', 'token',
        'for', 'the', 'and', 'of', 'in', 'a', 'an', 'through', 'with', 'by',
        'unit', 'units', 'system', 'systems', 'benefits', 'ghg', 'biodiversity'
      ]);

      const firstWords: string[] = [];
      for (const name of classNames) {
        const words = name.split(/\s+/).filter(w => w.length > 2);
        // Get first non-generic word
        for (const word of words) {
          if (!genericWords.has(word.toLowerCase())) {
            firstWords.push(word);
            break;
          }
        }
      }

      // Use the most common distinctive first word if consistent
      const wordCounts = new Map<string, number>();
      for (const word of firstWords) {
        wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
      }

      let bestWord = '';
      let maxCount = 0;
      for (const [word, count] of wordCounts) {
        // Only use if it appears in majority of classes for this admin
        if (count > maxCount && count >= Math.ceil(classIds.length / 2)) {
          maxCount = count;
          bestWord = word;
        }
      }

      if (bestWord && bestWord.length > 3) {
        orgName = bestWord;
      } else {
        // Fallback: use admin address short identifier
        orgName = `Admin_${admin.slice(5, 13)}`;
      }
    }

    // Generate org key from name
    const key = orgName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');

    // Generate org aliases
    const acronym = generateAcronym(orgName);
    if (acronym) {
      aliases.push(acronym);
    }

    // Generate description
    const classNamesList = classIds.map(id =>
      classes.find(c => c.id === id)?.name || id
    ).join(', ');

    organizations[key] = {
      key,
      name: orgName,
      type: 'ORGANIZATION',
      aliases,
      administered_classes: classIds.sort(),
      description: `Administrator of ${classNamesList}`
    };
  }

  return organizations;
}

// =============================================================================
// Overrides
// =============================================================================

/**
 * Load optional overrides file
 */
function loadOverrides(): Overrides {
  const overridesPath = path.join(__dirname, '..', 'data', 'overrides.json');

  try {
    if (fs.existsSync(overridesPath)) {
      const data = fs.readFileSync(overridesPath, 'utf-8');
      console.log('  Loaded overrides file');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('  [WARN] Failed to load overrides:', error);
  }

  return {};
}

/**
 * Apply overrides to an entity
 */
function applyOverride<T extends { name?: string; aliases?: string[]; description?: string }>(
  entity: T,
  override?: Override
): T {
  if (!override) return entity;

  return {
    ...entity,
    name: override.name || entity.name,
    aliases: override.aliases || entity.aliases,
    description: override.description || entity.description,
  };
}

// =============================================================================
// Main Build Process
// =============================================================================

async function fetchCreditClasses(): Promise<LedgerCreditClass[]> {
  try {
    console.log('  Fetching credit classes from Ledger...');
    const response = await axios.get(`${LEDGER_API}/regen/ecocredit/v1/classes`);
    const classes = response.data.classes || [];
    console.log(`  Found ${classes.length} credit classes`);
    return classes;
  } catch (error) {
    console.error('  [ERROR] Failed to fetch credit classes:', error);
    return [];
  }
}

async function fetchProjects(): Promise<LedgerProject[]> {
  try {
    console.log('  Fetching projects from Ledger...');
    const response = await axios.get(`${LEDGER_API}/regen/ecocredit/v1/projects`);
    const projects = response.data.projects || [];
    console.log(`  Found ${projects.length} projects`);
    return projects;
  } catch (error) {
    console.error('  [ERROR] Failed to fetch projects:', error);
    return [];
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function buildRegistry() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  REGEN ENTITY REGISTRY BUILDER (Fully Automated)');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Ledger API: ${LEDGER_API}`);
  console.log(`  Metadata API: ${REGEN_DATA_API}`);
  console.log('');

  // 1. Fetch raw data from Ledger
  console.log('STEP 1: Fetching data from Ledger API');
  const [rawClasses, rawProjects] = await Promise.all([
    fetchCreditClasses(),
    fetchProjects()
  ]);
  console.log('');

  // 2. Resolve metadata for credit classes
  console.log('STEP 2: Resolving credit class metadata');
  const classesWithMetadata: Array<any> = [];

  for (const cls of rawClasses) {
    process.stdout.write(`  Resolving ${cls.id}...`);

    const metadata = await resolveMetadataIRI(cls.metadata);
    await sleep(METADATA_FETCH_DELAY_MS);

    const name = metadata?.name || cls.id;
    const description = metadata?.description || `${cls.id} credit class`;
    const metadataAliases = metadata?.alternateNames || [];

    // Generate aliases
    const aliasCandidates = generateAliases(name, metadataAliases);
    const aliases = aliasCandidates
      .filter(a => a.confidence >= 0.7)
      .map(a => a.alias);

    classesWithMetadata.push({
      id: cls.id,
      name,
      type: 'CREDIT_CLASS',
      credit_type: cls.credit_type_abbrev,
      aliases,
      admin: cls.admin,
      metadata_iri: cls.metadata,
      description,
      provider: metadata?.provider,
    });

    console.log(` ${name} (${aliases.length} aliases)`);
  }
  console.log('');

  // 3. Resolve metadata for projects
  console.log('STEP 3: Resolving project metadata');
  const projectsWithMetadata: Array<any> = [];

  for (const proj of rawProjects) {
    process.stdout.write(`  Resolving ${proj.id}...`);

    const metadata = await resolveMetadataIRI(proj.metadata);
    await sleep(METADATA_FETCH_DELAY_MS);

    const location = parseJurisdiction(proj.jurisdiction);
    const className = classesWithMetadata.find(c => c.id === proj.class_id)?.name || proj.class_id;
    const name = metadata?.name || `${className} - ${location}`;
    const description = metadata?.description || `${className} project in ${location}`;
    const metadataAliases = metadata?.alternateNames || [];

    // Generate aliases (include class name as alias for projects)
    const aliasCandidates = generateAliases(name, metadataAliases);
    const aliases = aliasCandidates
      .filter(a => a.confidence >= 0.7)
      .map(a => a.alias);

    projectsWithMetadata.push({
      id: proj.id,
      name,
      type: 'PROJECT',
      class_id: proj.class_id,
      jurisdiction: proj.jurisdiction,
      location,
      aliases,
      ...(proj.reference_id && { reference_id: proj.reference_id }),
      metadata_iri: proj.metadata,
      description,
    });

    console.log(` ${name.slice(0, 40)}... (${aliases.length} aliases)`);
  }
  console.log('');

  // 4. Build organizations
  console.log('STEP 4: Building organizations from admin addresses');
  const organizations = buildOrganizations(classesWithMetadata);
  console.log(`  Found ${Object.keys(organizations).length} organizations`);
  for (const [key, org] of Object.entries(organizations)) {
    console.log(`    - ${org.name}: ${org.administered_classes.join(', ')}`);
  }
  console.log('');

  // 5. Load and apply overrides
  console.log('STEP 5: Applying overrides');
  const overrides = loadOverrides();

  for (const cls of classesWithMetadata) {
    const override = overrides.credit_classes?.[cls.id];
    if (override) {
      Object.assign(cls, applyOverride(cls, override));
      console.log(`  Applied override for ${cls.id}`);
    }
  }

  for (const proj of projectsWithMetadata) {
    const override = overrides.projects?.[proj.id];
    if (override) {
      Object.assign(proj, applyOverride(proj, override));
      console.log(`  Applied override for ${proj.id}`);
    }
  }

  for (const [orgKey, org] of Object.entries(organizations)) {
    const override = overrides.organizations?.[orgKey];
    if (override) {
      if (override.name) org.name = override.name;
      if (override.aliases) org.aliases = [...org.aliases, ...override.aliases];
      org.description = `Administrator of ${org.administered_classes.map(id =>
        classesWithMetadata.find(c => c.id === id)?.name || id
      ).join(', ')}`;
      console.log(`  Applied override for org ${orgKey} -> ${org.name}`);
    }
  }
  console.log('');

  // 6. Build indexes
  console.log('STEP 6: Building indexes');
  const indexes = {
    name_to_class: {} as Record<string, string>,
    name_to_project: {} as Record<string, string>,
    org_to_classes: {} as Record<string, string[]>,
  };

  for (const cls of classesWithMetadata) {
    indexes.name_to_class[cls.name.toLowerCase()] = cls.id;
    for (const alias of cls.aliases) {
      indexes.name_to_class[alias.toLowerCase()] = cls.id;
    }
  }

  for (const proj of projectsWithMetadata) {
    indexes.name_to_project[proj.name.toLowerCase()] = proj.id;
    for (const alias of proj.aliases) {
      indexes.name_to_project[alias.toLowerCase()] = proj.id;
    }
  }

  for (const org of Object.values(organizations)) {
    indexes.org_to_classes[org.name.toLowerCase()] = org.administered_classes;
    for (const alias of org.aliases) {
      indexes.org_to_classes[alias.toLowerCase()] = org.administered_classes;
    }
  }

  console.log(`  ${Object.keys(indexes.name_to_class).length} class name mappings`);
  console.log(`  ${Object.keys(indexes.name_to_project).length} project name mappings`);
  console.log(`  ${Object.keys(indexes.org_to_classes).length} org name mappings`);
  console.log('');

  // 7. Build final registry
  const registry = {
    version: '2.0.0',
    generated: new Date().toISOString(),
    description: 'Canonical entity registry for Regen Network - FULLY AUTOMATED',
    automation: {
      ledger_api: LEDGER_API,
      metadata_api: REGEN_DATA_API,
      note: 'This file is auto-generated. Edit overrides.json to make corrections.',
    },
    credit_classes: Object.fromEntries(
      classesWithMetadata.map(c => {
        const { provider, ...rest } = c;
        return [c.id, rest];
      })
    ),
    projects: Object.fromEntries(
      projectsWithMetadata.map(p => [p.id, p])
    ),
    organizations,
    indexes,
  };

  // 8. Write output
  const outputPath = path.join(__dirname, '..', 'data', 'regen_entity_registry.json');

  // Ensure data directory exists
  const dataDir = path.dirname(outputPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(registry, null, 2));

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  REGISTRY BUILD COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Output: ${outputPath}`);
  console.log(`  Credit classes: ${Object.keys(registry.credit_classes).length}`);
  console.log(`  Projects: ${Object.keys(registry.projects).length}`);
  console.log(`  Organizations: ${Object.keys(registry.organizations).length}`);
  console.log(`  Total index entries: ${
    Object.keys(indexes.name_to_class).length +
    Object.keys(indexes.name_to_project).length +
    Object.keys(indexes.org_to_classes).length
  }`);
  console.log('');
  console.log('  To apply manual corrections, edit: data/overrides.json');
  console.log('═══════════════════════════════════════════════════════════════');
}

buildRegistry().catch(error => {
  console.error('Build failed:', error);
  process.exit(1);
});
