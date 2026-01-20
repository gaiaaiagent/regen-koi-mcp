#!/usr/bin/env npx ts-node
/**
 * Build Entity Registry Script
 *
 * Fetches credit class and project data from the Regen Ledger API
 * and builds the canonical entity registry JSON file.
 *
 * Usage:
 *   npx ts-node scripts/build_entity_registry.ts
 *
 * Or run via npm script:
 *   npm run build:registry
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

// API configuration
const LEDGER_API = process.env.LEDGER_API_ENDPOINT || 'https://regen.gaiaai.xyz/regen-api';

interface CreditClass {
  id: string;
  admin: string;
  metadata: string;
  credit_type_abbrev: string;
}

interface Project {
  id: string;
  admin: string;
  class_id: string;
  jurisdiction: string;
  metadata: string;
  reference_id: string;
}

// Known credit class names and aliases (from documentation and registry standards)
const CREDIT_CLASS_METADATA: Record<string, {
  name: string;
  aliases: string[];
  description: string;
}> = {
  'C01': {
    name: 'CarbonPlus Grasslands',
    aliases: ['Grasslands', 'CarbonPlus', 'Grassland Credits'],
    description: 'Grassland carbon sequestration credits'
  },
  'C02': {
    name: 'City Forest Credits',
    aliases: ['Urban Forest Carbon', 'CFC', 'City Forest', 'Urban Forest'],
    description: 'Urban forest carbon credits from City Forest Credits methodology'
  },
  'C03': {
    name: 'TCO2: Toucan Carbon Tokens',
    aliases: ['Toucan', 'TCO2', 'Toucan Carbon', 'NCT'],
    description: 'Toucan bridged carbon credits'
  },
  'C04': {
    name: 'Ruuts Soil Carbon',
    aliases: ['Ruuts', 'Soil Carbon', 'Ruuts Carbon'],
    description: 'Soil carbon credits from Ruuts methodology'
  },
  'C05': {
    name: 'Biochar Carbon Credits',
    aliases: ['Biochar', 'Kulshan Biochar', 'Kulshan Carbon'],
    description: 'Biochar carbon removal credits'
  },
  'C06': {
    name: 'EcoMetric UK Peatland',
    aliases: ['UK Peatland', 'Peatland', 'EcoMetric Peatland'],
    description: 'UK peatland restoration carbon credits administered by EcoMetric'
  },
  'C07': {
    name: 'Australian Carbon',
    aliases: ['ACCU', 'Australian Carbon Credit Units', 'Australia Carbon'],
    description: 'Australian carbon credit units'
  },
  'C08': {
    name: 'EcoMetric Biodiversity',
    aliases: ['Biodiversity Credits', 'EcoMetric Bio'],
    description: 'EcoMetric biodiversity credits'
  },
  'C09': {
    name: 'EcoMetric Soil Health',
    aliases: ['Soil Health Credits', 'EcoMetric Soil'],
    description: 'EcoMetric soil health credits'
  },
  'BT01': {
    name: 'BioTerra',
    aliases: ['Terrasos Protocol', 'Terrasos', 'BioTerra Credits'],
    description: 'Biodiversity credits from Terrasos methodology in Colombia'
  },
  'KSH01': {
    name: 'Grazing Management',
    aliases: ['Kilo-Sheep-Hour', 'KSH', 'Grazing Credits', 'Sheep Hour'],
    description: 'Grazing management credits measured in Kilo-Sheep-Hours'
  },
  'MBS01': {
    name: 'Marine Biodiversity',
    aliases: ['Marine Bio Stewardship', 'Marine Credits', 'MBS'],
    description: 'Marine biodiversity stewardship credits'
  },
  'USS01': {
    name: 'Umbrella Species',
    aliases: ['Umbrella Species Stewardship', 'USS', 'Species Credits'],
    description: 'Umbrella species stewardship credits for wildlife habitat'
  }
};

// Known project names (from documentation and metadata)
const PROJECT_METADATA: Record<string, {
  name: string;
  aliases: string[];
  location: string;
}> = {
  'BT01-001': {
    name: 'El Globo Nature Reserve',
    aliases: ['El Globo', 'Globo Reserve'],
    location: 'Antioquia, Colombia'
  },
  'BT01-002': {
    name: 'La Pedregoza Reserve',
    aliases: ['La Pedregoza', 'Pedregoza'],
    location: 'Cundinamarca, Colombia'
  },
  'C02-003': {
    name: 'Buena Vista Heights',
    aliases: ['Buena Vista', 'BVH', 'Pennsylvania Forest'],
    location: 'Pennsylvania, USA'
  },
  'C05-001': {
    name: 'Kulshan Biochar Project',
    aliases: ['Kulshan', 'Kulshan Biochar', 'Washington Biochar'],
    location: 'Washington, USA'
  }
};

// Organization mappings
const ORGANIZATIONS = {
  'city_forest_credits': {
    name: 'City Forest Credits',
    aliases: ['CFC', 'City Forest'],
    administered_classes: ['C02'],
    description: 'Urban forestry carbon credit methodology developer'
  },
  'ecometric': {
    name: 'EcoMetric',
    aliases: ['Ecometric', 'EcoMetric Ltd'],
    administered_classes: ['C06', 'C08', 'C09'],
    description: 'UK-based environmental credits administrator'
  },
  'terrasos': {
    name: 'Terrasos',
    aliases: ['Terrasos Foundation', 'BioTerra'],
    administered_classes: ['BT01'],
    description: 'Colombian biodiversity credit developer'
  },
  'toucan': {
    name: 'Toucan Protocol',
    aliases: ['Toucan', 'Toucan Carbon'],
    administered_classes: ['C03'],
    description: 'Carbon credit tokenization and bridging protocol'
  },
  'kulshan_carbon': {
    name: 'Kulshan Carbon Trust',
    aliases: ['Kulshan', 'Kulshan Biochar'],
    administered_classes: ['C05'],
    description: 'Biochar carbon removal credit developer'
  },
  'ruuts': {
    name: 'Ruuts',
    aliases: ['Ruuts Carbon', 'Ruuts Soil'],
    administered_classes: ['C04'],
    description: 'Soil carbon credit methodology developer'
  },
  'regen_network': {
    name: 'Regen Network',
    aliases: ['Regen', 'Regen Network Development'],
    administered_classes: ['C01', 'C07', 'KSH01', 'MBS01', 'USS01'],
    description: 'Core development organization for Regen Network blockchain'
  }
};

async function fetchCreditClasses(): Promise<CreditClass[]> {
  try {
    const response = await axios.get(`${LEDGER_API}/cosmos/ecocredit/v1/classes`);
    return response.data.classes || [];
  } catch (error) {
    console.error('Failed to fetch credit classes:', error);
    return [];
  }
}

async function fetchProjects(): Promise<Project[]> {
  try {
    const response = await axios.get(`${LEDGER_API}/cosmos/ecocredit/v1/projects`);
    return response.data.projects || [];
  } catch (error) {
    console.error('Failed to fetch projects:', error);
    return [];
  }
}

function getJurisdictionLocation(jurisdiction: string): string {
  const jurisdictionMap: Record<string, string> = {
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
    'GB-ENG': 'England, UK',
    'AU-NSW': 'New South Wales, Australia',
    'CO-ANT': 'Antioquia, Colombia',
    'CO-CUN': 'Cundinamarca, Colombia',
    'CO': 'Colombia',
    'KE': 'Kenya',
    'CD': 'Democratic Republic of Congo',
    'CD-MN': 'Democratic Republic of Congo',
    'PE-MDD': 'Madre de Dios, Peru',
    'BR': 'Brazil',
    'BR-MS': 'Mato Grosso do Sul, Brazil',
    'EC-Y': 'Ecuador',
    'ID': 'Indonesia',
    'KH': 'Cambodia',
    'CN': 'China',
    'CG': 'Republic of Congo'
  };

  // Try exact match
  if (jurisdictionMap[jurisdiction]) {
    return jurisdictionMap[jurisdiction];
  }

  // Try prefix match
  const prefix = jurisdiction.split(' ')[0];
  if (jurisdictionMap[prefix]) {
    return jurisdictionMap[prefix];
  }

  return jurisdiction;
}

function buildRegistry(classes: CreditClass[], projects: Project[]): any {
  const registry: any = {
    version: '1.0.0',
    generated: new Date().toISOString(),
    description: 'Canonical entity registry for Regen Network credit classes and projects',
    credit_classes: {},
    projects: {},
    organizations: ORGANIZATIONS,
    indexes: {
      name_to_class: {},
      name_to_project: {},
      org_to_classes: {}
    }
  };

  // Build credit classes
  for (const cls of classes) {
    const metadata = CREDIT_CLASS_METADATA[cls.id];
    registry.credit_classes[cls.id] = {
      id: cls.id,
      name: metadata?.name || cls.id,
      type: 'CREDIT_CLASS',
      credit_type: cls.credit_type_abbrev,
      aliases: metadata?.aliases || [],
      admin: cls.admin,
      metadata_iri: cls.metadata,
      description: metadata?.description || `${cls.id} credit class`
    };

    // Build name-to-class index
    if (metadata) {
      registry.indexes.name_to_class[metadata.name.toLowerCase()] = cls.id;
      for (const alias of metadata.aliases) {
        registry.indexes.name_to_class[alias.toLowerCase()] = cls.id;
      }
    }
  }

  // Build projects
  for (const proj of projects) {
    const metadata = PROJECT_METADATA[proj.id];
    const location = metadata?.location || getJurisdictionLocation(proj.jurisdiction);
    const className = registry.credit_classes[proj.class_id]?.name || proj.class_id;

    registry.projects[proj.id] = {
      id: proj.id,
      name: metadata?.name || `${className} - ${location}`,
      type: 'PROJECT',
      class_id: proj.class_id,
      jurisdiction: proj.jurisdiction,
      location: location,
      aliases: metadata?.aliases || [],
      ...(proj.reference_id && { reference_id: proj.reference_id }),
      metadata_iri: proj.metadata
    };

    // Build name-to-project index
    if (metadata) {
      registry.indexes.name_to_project[metadata.name.toLowerCase()] = proj.id;
      for (const alias of metadata.aliases) {
        registry.indexes.name_to_project[alias.toLowerCase()] = proj.id;
      }
    }
  }

  // Build org-to-classes index
  for (const [orgKey, org] of Object.entries(ORGANIZATIONS)) {
    registry.indexes.org_to_classes[org.name.toLowerCase()] = org.administered_classes;
    for (const alias of org.aliases) {
      registry.indexes.org_to_classes[alias.toLowerCase()] = org.administered_classes;
    }
  }

  return registry;
}

async function main() {
  console.log('Building Regen entity registry...');
  console.log(`Fetching data from: ${LEDGER_API}`);

  const [classes, projects] = await Promise.all([
    fetchCreditClasses(),
    fetchProjects()
  ]);

  console.log(`Found ${classes.length} credit classes and ${projects.length} projects`);

  const registry = buildRegistry(classes, projects);

  const outputPath = path.join(__dirname, '..', 'data', 'regen_entity_registry.json');
  fs.writeFileSync(outputPath, JSON.stringify(registry, null, 2));

  console.log(`Registry written to: ${outputPath}`);
  console.log(`  - ${Object.keys(registry.credit_classes).length} credit classes`);
  console.log(`  - ${Object.keys(registry.projects).length} projects`);
  console.log(`  - ${Object.keys(registry.organizations).length} organizations`);
  console.log(`  - ${Object.keys(registry.indexes.name_to_class).length} class name mappings`);
  console.log(`  - ${Object.keys(registry.indexes.name_to_project).length} project name mappings`);
}

main().catch(console.error);
