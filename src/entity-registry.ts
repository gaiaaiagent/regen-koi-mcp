/**
 * Entity Registry for Regen Network
 *
 * Provides entity resolution for Regen entities (credit classes, projects, organizations).
 * Uses a two-tier approach:
 * 1. KOI API resolution (primary) - Real-time data from the KOI backend
 * 2. Local registry fallback - Cached JSON file for offline/backup
 *
 * This fixes polysemy issues where "City Forest Credits" could resolve to multiple entities.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Configuration for API-based resolution
const KOI_ENTITY_API_ENABLED = process.env.KOI_ENTITY_API_ENABLED !== 'false'; // Default: true
const KOI_API_ENDPOINT = process.env.KOI_API_ENDPOINT || 'https://regen.gaiaai.xyz/api/koi';
const KOI_ENTITY_RESOLVE_TIMEOUT = parseInt(process.env.KOI_ENTITY_RESOLVE_TIMEOUT || '5000', 10);

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Types for the registry
export interface CreditClass {
  id: string;
  name: string;
  type: 'CREDIT_CLASS';
  credit_type: string;
  aliases: string[];
  admin: string;
  metadata_iri: string;
  description: string;
}

export interface Project {
  id: string;
  name: string;
  type: 'PROJECT';
  class_id: string;
  jurisdiction: string;
  location: string;
  aliases: string[];
  reference_id?: string;
  metadata_iri: string;
}

export interface Organization {
  name: string;
  type: 'ORGANIZATION';
  aliases: string[];
  administered_classes: string[];
  description: string;
}

export interface EntityRegistry {
  version: string;
  generated: string;
  description: string;
  credit_classes: Record<string, CreditClass>;
  projects: Record<string, Project>;
  organizations: Record<string, Organization>;
  indexes: {
    name_to_class: Record<string, string>;
    name_to_project: Record<string, string>;
    org_to_classes: Record<string, string[]>;
  };
}

export interface PreResolutionResult {
  resolved: boolean;
  confidence: number;
  entity?: {
    uri: string;
    label: string;
    type: string;
    id?: string;
    class_id?: string;
    aliases?: string[];
    description?: string;
    administered_classes?: string[];
    metadata_iri?: string;
    admin_address?: string;
    jurisdiction?: string;
    source?: string;
  };
  source: 'registry' | 'api';
  match_type?: 'exact_id' | 'exact_name' | 'alias' | 'fuzzy' | 'ledger_id' | 'normalized_text';
}

// API response interface
interface APIEntityResolveResponse {
  query_label: string;
  type_hint: string | null;
  variant_count: number;
  winner: {
    uri: string;
    entity_text: string;
    entity_type: string;
    occurrence_count: number;
    relationship_count: number;
    match_type: string;
    ledger_id: string | null;
    metadata_iri: string | null;
    admin_address: string | null;
    aliases: string[] | null;
    jurisdiction: string | null;
    class_id: string | null;
    source: string | null;
    score: number;
    score_breakdown: string;
  } | null;
  alternatives: Array<any>;
  is_polysemy: boolean;
  resolution_method: string;
}

// Singleton registry instance
let registryInstance: EntityRegistry | null = null;

/**
 * Resolve an entity via the KOI API
 * This provides real-time resolution from the KOI backend
 */
export async function resolveEntityViaAPI(
  label: string,
  typeHint?: string
): Promise<PreResolutionResult> {
  const url = new URL(`${KOI_API_ENDPOINT}/entity/resolve`);
  url.searchParams.set('label', label);
  if (typeHint) {
    url.searchParams.set('type_hint', typeHint);
  }
  url.searchParams.set('limit', '1');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), KOI_ENTITY_RESOLVE_TIMEOUT);

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`[EntityRegistry] API resolution failed: ${response.status} ${response.statusText}`);
      return { resolved: false, confidence: 0, source: 'api' };
    }

    const data = await response.json() as APIEntityResolveResponse;

    if (!data.winner) {
      return { resolved: false, confidence: 0, source: 'api' };
    }

    const winner = data.winner;

    // Calculate confidence based on match type and score
    let confidence = 0.9;
    if (winner.match_type === 'ledger_id') {
      confidence = 1.0;
    } else if (winner.match_type === 'normalized_text') {
      confidence = 0.98;
    } else if (winner.match_type === 'alias') {
      confidence = 0.95;
    }

    // Map match_type to our interface
    let matchType: PreResolutionResult['match_type'] = 'exact_name';
    if (winner.match_type === 'ledger_id') {
      matchType = 'ledger_id';
    } else if (winner.match_type === 'alias') {
      matchType = 'alias';
    } else if (winner.match_type === 'normalized_text') {
      matchType = 'normalized_text';
    }

    return {
      resolved: true,
      confidence,
      entity: {
        uri: winner.uri,
        label: winner.entity_text,
        type: winner.entity_type,
        id: winner.ledger_id || undefined,
        class_id: winner.class_id || undefined,
        aliases: winner.aliases || undefined,
        metadata_iri: winner.metadata_iri || undefined,
        admin_address: winner.admin_address || undefined,
        jurisdiction: winner.jurisdiction || undefined,
        source: winner.source || undefined
      },
      source: 'api',
      match_type: matchType
    };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      console.error(`[EntityRegistry] API resolution timed out after ${KOI_ENTITY_RESOLVE_TIMEOUT}ms`);
    } else {
      console.error('[EntityRegistry] API resolution error:', error);
    }
    return { resolved: false, confidence: 0, source: 'api' };
  }
}

/**
 * Load the entity registry from disk
 * Caches the result for subsequent calls
 */
export function loadRegistry(): EntityRegistry {
  if (registryInstance) {
    return registryInstance;
  }

  const registryPath = path.join(__dirname, '..', 'data', 'regen_entity_registry.json');

  try {
    const data = fs.readFileSync(registryPath, 'utf-8');
    registryInstance = JSON.parse(data) as EntityRegistry;
    console.error(`[EntityRegistry] Loaded registry v${registryInstance.version} with ${Object.keys(registryInstance.credit_classes).length} credit classes and ${Object.keys(registryInstance.projects).length} projects`);
    return registryInstance;
  } catch (error) {
    console.error(`[EntityRegistry] Failed to load registry from ${registryPath}:`, error);
    // Return empty registry on failure
    registryInstance = {
      version: '0.0.0',
      generated: new Date().toISOString(),
      description: 'Empty fallback registry',
      credit_classes: {},
      projects: {},
      organizations: {},
      indexes: {
        name_to_class: {},
        name_to_project: {},
        org_to_classes: {}
      }
    };
    return registryInstance;
  }
}

/**
 * Normalize a label for matching (lowercase, trim whitespace)
 */
function normalizeLabel(label: string): string {
  return label.toLowerCase().trim();
}

/**
 * Calculate a simple fuzzy match score between two strings
 * Returns a value between 0 and 1
 */
function fuzzyMatchScore(a: string, b: string): number {
  const aNorm = normalizeLabel(a);
  const bNorm = normalizeLabel(b);

  // Exact match
  if (aNorm === bNorm) return 1.0;

  // One contains the other
  if (aNorm.includes(bNorm) || bNorm.includes(aNorm)) {
    const shorter = Math.min(aNorm.length, bNorm.length);
    const longer = Math.max(aNorm.length, bNorm.length);
    return 0.7 + (0.2 * (shorter / longer));
  }

  // Levenshtein-inspired simple distance
  const maxLen = Math.max(aNorm.length, bNorm.length);
  if (maxLen === 0) return 1.0;

  let matches = 0;
  const aWords = aNorm.split(/\s+/);
  const bWords = bNorm.split(/\s+/);

  for (const aWord of aWords) {
    if (bWords.some(bWord => bWord === aWord || bWord.includes(aWord) || aWord.includes(bWord))) {
      matches++;
    }
  }

  return matches / Math.max(aWords.length, bWords.length);
}

/**
 * Pre-resolve an entity label using the local registry
 * Returns a result with the resolved entity if found with high confidence
 */
export function preResolveEntity(label: string, typeHint?: string): PreResolutionResult {
  const registry = loadRegistry();
  const normalizedLabel = normalizeLabel(label);

  // Check if it's a credit class ID (e.g., "C02", "BT01")
  const classIdPattern = /^[A-Z]{1,3}\d{1,2}$/i;
  if (classIdPattern.test(label)) {
    const classId = label.toUpperCase();
    const creditClass = registry.credit_classes[classId];
    if (creditClass) {
      return {
        resolved: true,
        confidence: 1.0,
        entity: {
          uri: `regen:credit_class:${classId}`,
          label: creditClass.name,
          type: 'CREDIT_CLASS',
          id: classId,
          aliases: creditClass.aliases,
          description: creditClass.description,
          metadata_iri: creditClass.metadata_iri
        },
        source: 'registry',
        match_type: 'exact_id'
      };
    }
  }

  // Check if it's a project ID (e.g., "C02-003", "BT01-001")
  const projectIdPattern = /^[A-Z]{1,3}\d{1,2}-\d{3}$/i;
  if (projectIdPattern.test(label)) {
    const projectId = label.toUpperCase();
    const project = registry.projects[projectId];
    if (project) {
      return {
        resolved: true,
        confidence: 1.0,
        entity: {
          uri: `regen:project:${projectId}`,
          label: project.name,
          type: 'PROJECT',
          id: projectId,
          class_id: project.class_id,
          aliases: project.aliases,
          description: `${project.location} - ${registry.credit_classes[project.class_id]?.name || project.class_id}`,
          metadata_iri: project.metadata_iri
        },
        source: 'registry',
        match_type: 'exact_id'
      };
    }
  }

  // Check name-to-class index for exact name/alias match
  const classIdFromName = registry.indexes.name_to_class[normalizedLabel];
  if (classIdFromName && (!typeHint || typeHint.toUpperCase() === 'CREDIT_CLASS')) {
    const creditClass = registry.credit_classes[classIdFromName];
    if (creditClass) {
      const isExactName = normalizedLabel === normalizeLabel(creditClass.name);
      return {
        resolved: true,
        confidence: isExactName ? 0.98 : 0.95,
        entity: {
          uri: `regen:credit_class:${classIdFromName}`,
          label: creditClass.name,
          type: 'CREDIT_CLASS',
          id: classIdFromName,
          aliases: creditClass.aliases,
          description: creditClass.description,
          metadata_iri: creditClass.metadata_iri
        },
        source: 'registry',
        match_type: isExactName ? 'exact_name' : 'alias'
      };
    }
  }

  // Check name-to-project index
  const projectIdFromName = registry.indexes.name_to_project[normalizedLabel];
  if (projectIdFromName && (!typeHint || typeHint.toUpperCase() === 'PROJECT')) {
    const project = registry.projects[projectIdFromName];
    if (project) {
      const isExactName = normalizedLabel === normalizeLabel(project.name);
      return {
        resolved: true,
        confidence: isExactName ? 0.98 : 0.95,
        entity: {
          uri: `regen:project:${projectIdFromName}`,
          label: project.name,
          type: 'PROJECT',
          id: projectIdFromName,
          class_id: project.class_id,
          aliases: project.aliases,
          description: `${project.location} - ${registry.credit_classes[project.class_id]?.name || project.class_id}`,
          metadata_iri: project.metadata_iri
        },
        source: 'registry',
        match_type: isExactName ? 'exact_name' : 'alias'
      };
    }
  }

  // Check organizations
  for (const [orgKey, org] of Object.entries(registry.organizations)) {
    if (normalizedLabel === normalizeLabel(org.name) ||
        org.aliases.some(alias => normalizeLabel(alias) === normalizedLabel)) {

      // If type hint is CREDIT_CLASS, return the class they administer instead
      if (typeHint?.toUpperCase() === 'CREDIT_CLASS' && org.administered_classes.length === 1) {
        const classId = org.administered_classes[0];
        const creditClass = registry.credit_classes[classId];
        if (creditClass) {
          return {
            resolved: true,
            confidence: 0.90,
            entity: {
              uri: `regen:credit_class:${classId}`,
              label: creditClass.name,
              type: 'CREDIT_CLASS',
              id: classId,
              aliases: creditClass.aliases,
              description: `Administered by ${org.name}`,
              metadata_iri: creditClass.metadata_iri
            },
            source: 'registry',
            match_type: 'alias'
          };
        }
      }

      return {
        resolved: true,
        confidence: 0.95,
        entity: {
          uri: `regen:organization:${orgKey}`,
          label: org.name,
          type: 'ORGANIZATION',
          aliases: org.aliases,
          administered_classes: org.administered_classes,
          description: org.description
        },
        source: 'registry',
        match_type: normalizedLabel === normalizeLabel(org.name) ? 'exact_name' : 'alias'
      };
    }
  }

  // Fuzzy matching as fallback
  let bestMatch: PreResolutionResult | null = null;
  let bestScore = 0;

  // Fuzzy match credit classes
  if (!typeHint || typeHint.toUpperCase() === 'CREDIT_CLASS') {
    for (const [classId, creditClass] of Object.entries(registry.credit_classes)) {
      const nameScore = fuzzyMatchScore(label, creditClass.name);
      const aliasScores = creditClass.aliases.map(alias => fuzzyMatchScore(label, alias));
      const maxScore = Math.max(nameScore, ...aliasScores);

      if (maxScore > bestScore && maxScore >= 0.7) {
        bestScore = maxScore;
        bestMatch = {
          resolved: true,
          confidence: maxScore * 0.9, // Reduce confidence for fuzzy matches
          entity: {
            uri: `regen:credit_class:${classId}`,
            label: creditClass.name,
            type: 'CREDIT_CLASS',
            id: classId,
            aliases: creditClass.aliases,
            description: creditClass.description,
            metadata_iri: creditClass.metadata_iri
          },
          source: 'registry',
          match_type: 'fuzzy'
        };
      }
    }
  }

  // Fuzzy match projects
  if (!typeHint || typeHint.toUpperCase() === 'PROJECT') {
    for (const [projectId, project] of Object.entries(registry.projects)) {
      const nameScore = fuzzyMatchScore(label, project.name);
      const aliasScores = project.aliases.map(alias => fuzzyMatchScore(label, alias));
      const maxScore = Math.max(nameScore, ...aliasScores);

      if (maxScore > bestScore && maxScore >= 0.7) {
        bestScore = maxScore;
        bestMatch = {
          resolved: true,
          confidence: maxScore * 0.9,
          entity: {
            uri: `regen:project:${projectId}`,
            label: project.name,
            type: 'PROJECT',
            id: projectId,
            class_id: project.class_id,
            aliases: project.aliases,
            description: `${project.location} - ${registry.credit_classes[project.class_id]?.name || project.class_id}`,
            metadata_iri: project.metadata_iri
          },
          source: 'registry',
          match_type: 'fuzzy'
        };
      }
    }
  }

  if (bestMatch) {
    return bestMatch;
  }

  // No match found
  return {
    resolved: false,
    confidence: 0,
    source: 'api'
  };
}

/**
 * Pre-resolve an entity using API-first approach with local registry fallback
 * This is the recommended method for production use
 *
 * Resolution order:
 * 1. Try KOI API (real-time data from the backend)
 * 2. Fall back to local registry if API fails/unavailable
 *
 * @param label - The entity label to resolve
 * @param typeHint - Optional type hint (e.g., "CREDIT_CLASS", "PROJECT")
 * @returns Promise<PreResolutionResult>
 */
export async function preResolveEntityAsync(
  label: string,
  typeHint?: string
): Promise<PreResolutionResult> {
  // Try API first if enabled
  if (KOI_ENTITY_API_ENABLED) {
    try {
      const apiResult = await resolveEntityViaAPI(label, typeHint);
      if (apiResult.resolved) {
        console.error(`[EntityRegistry] Resolved "${label}" via API (${apiResult.match_type})`);
        return apiResult;
      }
    } catch (error) {
      console.error(`[EntityRegistry] API resolution failed, falling back to local registry:`, error);
    }
  }

  // Fall back to local registry
  const localResult = preResolveEntity(label, typeHint);
  if (localResult.resolved) {
    console.error(`[EntityRegistry] Resolved "${label}" via local registry (${localResult.match_type})`);
  }
  return localResult;
}

/**
 * Get all credit classes from the registry
 */
export function getAllCreditClasses(): CreditClass[] {
  const registry = loadRegistry();
  return Object.values(registry.credit_classes);
}

/**
 * Get all projects from the registry
 */
export function getAllProjects(): Project[] {
  const registry = loadRegistry();
  return Object.values(registry.projects);
}

/**
 * Get projects by credit class ID
 */
export function getProjectsByClass(classId: string): Project[] {
  const registry = loadRegistry();
  return Object.values(registry.projects).filter(p => p.class_id === classId.toUpperCase());
}

/**
 * Get credit classes administered by an organization
 */
export function getClassesByOrganization(orgName: string): CreditClass[] {
  const registry = loadRegistry();
  const normalizedName = normalizeLabel(orgName);

  for (const org of Object.values(registry.organizations)) {
    if (normalizeLabel(org.name) === normalizedName ||
        org.aliases.some(a => normalizeLabel(a) === normalizedName)) {
      return org.administered_classes
        .map(id => registry.credit_classes[id])
        .filter((c): c is CreditClass => c !== undefined);
    }
  }

  return [];
}

/**
 * Format a pre-resolved entity for MCP response
 */
export function formatCanonicalResponse(result: PreResolutionResult): {
  content: Array<{ type: string; text: string }>;
} {
  if (!result.resolved || !result.entity) {
    return {
      content: [{
        type: 'text',
        text: 'Entity not found in registry or API.'
      }]
    };
  }

  const entity = result.entity;
  const sourceLabel = result.source === 'api' ? 'KOI API' : 'Local Registry';
  let md = `## Entity Resolution (${sourceLabel})\n\n`;
  md += `**Canonical Match Found** (${(result.confidence * 100).toFixed(0)}% confidence)\n\n`;
  md += `### ${entity.label}\n`;
  md += `- **URI:** \`${entity.uri}\`\n`;
  md += `- **Type:** ${entity.type}\n`;

  if (entity.id) {
    md += `- **ID:** ${entity.id}\n`;
  }
  if (entity.class_id) {
    md += `- **Credit Class:** ${entity.class_id}\n`;
  }
  if (entity.jurisdiction) {
    md += `- **Jurisdiction:** ${entity.jurisdiction}\n`;
  }
  if (entity.admin_address) {
    md += `- **Admin:** \`${entity.admin_address}\`\n`;
  }
  if (entity.aliases && entity.aliases.length > 0) {
    md += `- **Aliases:** ${entity.aliases.join(', ')}\n`;
  }
  if (entity.description) {
    md += `- **Description:** ${entity.description}\n`;
  }
  if (entity.administered_classes && entity.administered_classes.length > 0) {
    md += `- **Administered Classes:** ${entity.administered_classes.join(', ')}\n`;
  }
  if (entity.metadata_iri) {
    md += `- **Metadata IRI:** \`${entity.metadata_iri}\`\n`;
  }
  if (entity.source) {
    md += `- **Data Source:** ${entity.source}\n`;
  }

  md += `\n---\n`;
  md += `*Source: ${sourceLabel} (${result.match_type} match)*`;

  return {
    content: [{
      type: 'text',
      text: md
    }]
  };
}
