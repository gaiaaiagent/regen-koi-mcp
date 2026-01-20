/**
 * Entity Registry for Regen Network
 *
 * Provides local pre-resolution of known Regen entities (credit classes, projects, organizations)
 * before falling back to the KOI API. This fixes polysemy issues where "City Forest Credits"
 * could resolve to multiple entities.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

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
  };
  source: 'registry' | 'api';
  match_type?: 'exact_id' | 'exact_name' | 'alias' | 'fuzzy';
}

// Singleton registry instance
let registryInstance: EntityRegistry | null = null;

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
        text: 'Entity not found in local registry.'
      }]
    };
  }

  const entity = result.entity;
  let md = `## Entity Resolution (Local Registry)\n\n`;
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

  md += `\n---\n`;
  md += `*Source: Local Regen Entity Registry (${result.match_type} match)*`;

  return {
    content: [{
      type: 'text',
      text: md
    }]
  };
}
