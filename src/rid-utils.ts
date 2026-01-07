/**
 * RID (Resource Identifier) Utilities
 *
 * Implements RID parsing according to the KOI protocol specification.
 * Reference: koi-research/sources/blockscience/rid-lib/README.md
 *
 * RID Syntax: <context>:<reference>
 * - Generic URIs: <scheme>:<reference> (e.g., https://example.com/path)
 * - Object Reference Names (ORN): orn:<namespace>:<reference>
 * - Uniform Resource Names (URN): urn:<namespace>:<reference>
 */

// Known namespace schemes that use the orn/urn pattern
const NAMESPACE_SCHEMES = ['orn', 'urn'];

// Known RID types and their context patterns
const RID_TYPE_REGISTRY: Record<string, string> = {
  // Regen-specific types
  'orn:regen.document': 'RegenDocument',
  'orn:regen.ontology': 'RegenOntology',
  'orn:regen.methodology': 'RegenMethodology',
  'orn:regen.credit': 'RegenCredit',
  'orn:regen.agent': 'RegenAgent',
  'orn:regen.project': 'RegenProject',

  // Slack types
  'orn:slack.workspace': 'SlackWorkspace',
  'orn:slack.channel': 'SlackChannel',
  'orn:slack.message': 'SlackMessage',
  'orn:slack.user': 'SlackUser',

  // KOI-net types
  'orn:koi-net.node': 'KoiNetNode',
  'orn:koi-net.edge': 'KoiNetEdge',

  // Discourse types
  'orn:discourse.post': 'DiscoursePost',
  'orn:discourse.topic': 'DiscourseTopic',

  // GitHub types (using regen.github for indexed docs)
  'regen.github': 'GitHubDocument',

  // Standard URI schemes
  'http': 'HTTP',
  'https': 'HTTPS',
  'mailto': 'Mailto',
  'tel': 'Tel',
  'file': 'File',
};

export interface ParsedRID {
  rid: string;
  valid: boolean;

  // Core components (per rid-lib spec)
  scheme: string | null;           // "orn", "urn", "https", etc.
  namespace: string | null;        // For ORN/URN: e.g., "regen.document"; null for URI schemes
  context: string | null;          // ORN/URN: "<scheme>:<namespace>"; URI schemes: "<scheme>" (i.e., context === scheme)
  reference: string | null;        // Everything after the context

  // Type identification
  rid_type: string | null;
  rid_type_known: boolean;

  // For URI-style RIDs (HTTP/HTTPS)
  uri_components?: {
    authority: string | null;
    path: string | null;
    query: string | null;
    fragment: string | null;
  };

  // Error details if invalid
  error?: string;
}

/**
 * Parse a RID string into its components according to KOI protocol.
 *
 * @param ridString - The RID string to parse
 * @returns ParsedRID object with components and validation status
 */
export function parseRID(ridString: string): ParsedRID {
  const result: ParsedRID = {
    rid: ridString,
    valid: false,
    scheme: null,
    namespace: null,
    context: null,
    reference: null,
    rid_type: null,
    rid_type_known: false,
  };

  // Basic validation
  if (!ridString || typeof ridString !== 'string') {
    result.error = 'RID must be a non-empty string';
    return result;
  }

  const trimmed = ridString.trim();
  if (trimmed.length === 0) {
    result.error = 'RID must be a non-empty string';
    return result;
  }

  // Find the first colon to split scheme
  const firstColon = trimmed.indexOf(':');
  if (firstColon === -1) {
    result.error = 'Invalid RID format: missing scheme separator \':\'';
    return result;
  }

  const scheme = trimmed.substring(0, firstColon).toLowerCase();
  if (scheme.length === 0) {
    result.error = 'Invalid RID format: empty scheme';
    return result;
  }

  result.scheme = scheme;

  // Check if this is a namespace scheme (orn/urn)
  if (NAMESPACE_SCHEMES.includes(scheme)) {
    // Format: orn:<namespace>:<reference> or urn:<namespace>:<reference>
    const afterScheme = trimmed.substring(firstColon + 1);
    const secondColon = afterScheme.indexOf(':');

    if (secondColon === -1) {
      result.error = `Invalid ${scheme.toUpperCase()} format: missing namespace separator. Expected ${scheme}:<namespace>:<reference>`;
      return result;
    }

    const namespace = afterScheme.substring(0, secondColon);
    const reference = afterScheme.substring(secondColon + 1);

    if (namespace.length === 0) {
      result.error = `Invalid ${scheme.toUpperCase()} format: empty namespace`;
      return result;
    }

    result.namespace = namespace;
    result.context = `${scheme}:${namespace}`;
    result.reference = reference;
    result.valid = true;

  } else {
    // Generic URI format: <scheme>:<reference>
    // For http/https, the reference includes the // prefix
    result.context = scheme;
    result.reference = trimmed.substring(firstColon + 1);
    result.valid = true;

    // Parse URI components for http/https
    if (scheme === 'http' || scheme === 'https') {
      try {
        const url = new URL(trimmed);
        result.uri_components = {
          authority: url.host || null,
          path: url.pathname || null,
          query: url.search ? url.search.substring(1) : null,
          fragment: url.hash ? url.hash.substring(1) : null,
        };
      } catch {
        // URL parsing failed, but the RID is still valid as a generic reference
        result.uri_components = {
          authority: null,
          path: null,
          query: null,
          fragment: null,
        };
      }
    }
  }

  // Look up RID type
  const contextKey = result.context || result.scheme;
  if (contextKey && RID_TYPE_REGISTRY[contextKey]) {
    result.rid_type = RID_TYPE_REGISTRY[contextKey];
    result.rid_type_known = true;
  } else {
    // Try to infer type from scheme
    const schemeType = result.scheme ? RID_TYPE_REGISTRY[result.scheme] : null;
    if (schemeType) {
      result.rid_type = schemeType;
      result.rid_type_known = true;
    }
  }

  return result;
}

/**
 * Validate a RID string without full parsing.
 * Faster than full parse for simple validation.
 */
export function isValidRID(ridString: string): boolean {
  if (!ridString || typeof ridString !== 'string') return false;
  const trimmed = ridString.trim();
  if (trimmed.length === 0) return false;

  const firstColon = trimmed.indexOf(':');
  if (firstColon === -1 || firstColon === 0) return false;

  const scheme = trimmed.substring(0, firstColon).toLowerCase();

  // For namespace schemes, ensure there's a second colon
  if (NAMESPACE_SCHEMES.includes(scheme)) {
    const afterScheme = trimmed.substring(firstColon + 1);
    const secondColon = afterScheme.indexOf(':');
    return secondColon > 0; // Must have non-empty namespace
  }

  return true;
}

/**
 * Extract source from a RID (for filtering purposes).
 * Returns the source type like 'notion', 'discourse', 'github', etc.
 */
export function extractSourceFromRID(ridString: string): string | null {
  const parsed = parseRID(ridString);
  if (!parsed.valid) return null;

  // For ORN-style RIDs, extract from namespace
  if (parsed.namespace) {
    // orn:regen.document:notion/page-123 -> notion
    if (parsed.namespace === 'regen.document' && parsed.reference) {
      const firstSlash = parsed.reference.indexOf('/');
      if (firstSlash > 0) {
        return parsed.reference.substring(0, firstSlash);
      }
    }
    // orn:slack.message:... -> slack
    if (parsed.namespace.startsWith('slack.')) {
      return 'slack';
    }
    // orn:discourse.post:... -> discourse
    if (parsed.namespace.startsWith('discourse.')) {
      return 'discourse';
    }
  }

  // For GitHub docs with special RID format
  if (parsed.context === 'regen.github' || parsed.rid.includes('github_sensor')) {
    return 'github';
  }

  // For HTTP URLs, extract domain
  if (parsed.uri_components?.authority) {
    const domain = parsed.uri_components.authority;
    if (domain.includes('github.com')) return 'github';
    if (domain.includes('notion.')) return 'notion';
    if (domain.includes('discourse') || domain.includes('forum')) return 'discourse';
    if (domain.includes('medium.com')) return 'medium';
    if (domain.includes('substack.com')) return 'substack';
    if (domain.includes('youtube.com') || domain.includes('youtu.be')) return 'youtube';
    if (domain.includes('twitter.com') || domain.includes('x.com')) return 'twitter';
    if (domain.includes('t.me') || domain.includes('telegram')) return 'telegram';
  }

  return null;
}

/**
 * Normalize a RID to a canonical form.
 * - Lowercases scheme and namespace
 * - Trims whitespace
 * - Preserves reference case (may be case-sensitive)
 */
export function normalizeRID(ridString: string): string | null {
  const parsed = parseRID(ridString);
  if (!parsed.valid) return null;

  if (parsed.namespace) {
    // ORN/URN format
    return `${parsed.scheme}:${parsed.namespace}:${parsed.reference}`;
  } else {
    // Generic URI format - preserve as-is after trimming
    return ridString.trim();
  }
}

/**
 * Get all registered RID types.
 */
export function getRegisteredRIDTypes(): { context: string; type: string }[] {
  return Object.entries(RID_TYPE_REGISTRY).map(([context, type]) => ({
    context,
    type,
  }));
}
