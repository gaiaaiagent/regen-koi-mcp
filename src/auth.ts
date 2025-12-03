/**
 * Authentication Module
 * Manages access tokens for authenticated API calls
 *
 * SECURITY: This module stores and provides access tokens for API authentication.
 * Tokens are validated server-side on every request.
 */

import { execSync } from 'child_process';
import { logger } from './logger.js';

// Determine user email for authentication context
function determineUserEmail(): string {
  // Check environment variables first
  if (process.env.REGEN_USER_EMAIL) return process.env.REGEN_USER_EMAIL;
  if (process.env.USER_EMAIL) return process.env.USER_EMAIL;

  // Try to get from git config
  try {
    const email = execSync('git config user.email').toString().trim();
    if (email) return email;
  } catch (e) {
    // Git config not available
  }

  // Fall back to system user
  return `${process.env.USER || 'unknown'}@local`;
}

export const USER_EMAIL = determineUserEmail();

// Auth cache for storing access tokens
interface AuthCacheEntry {
  accessToken: string;
  expiresAt: number;
}

const authCache = new Map<string, AuthCacheEntry>();
const AUTH_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Stored access token (persisted in memory for the session)
let storedAccessToken: string | null = null;

/**
 * Get the current access token (if any)
 * Returns null if no token is stored or cached
 */
export function getAccessToken(): string | null {
  // Check if token in cache is still valid
  const cached = authCache.get(USER_EMAIL);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.accessToken;
  }
  return storedAccessToken;
}

/**
 * Store access token after successful OAuth
 * @param token - The access token from OAuth
 * @param expiresAt - Optional expiry timestamp
 */
export function setAccessToken(token: string, expiresAt?: number): void {
  storedAccessToken = token;
  authCache.set(USER_EMAIL, {
    accessToken: token,
    expiresAt: expiresAt || Date.now() + AUTH_CACHE_TTL_MS
  });
  logger.info({ action: 'auth_token_stored', email: USER_EMAIL }, 'Access token stored');
}

/**
 * Clear auth cache (called when token is invalid)
 */
export function clearAuthCache(): void {
  authCache.delete(USER_EMAIL);
  storedAccessToken = null;
  logger.info({ action: 'auth_cache_cleared', email: USER_EMAIL }, 'Auth cache cleared');
}

/**
 * Check if we have a stored access token
 */
export function hasAccessToken(): boolean {
  return getAccessToken() !== null;
}
