/**
 * Auth State Persistence
 *
 * Stores authentication state to .koi-auth.json to enable
 * the "One Tool, Two Calls" pattern (no polling loop).
 *
 * State Flow:
 * 1. No state -> Request device code, save to file
 * 2. Has device_code -> Check status with server
 * 3. Has access_token -> Already authenticated
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

// Store auth state in user's home directory
const AUTH_FILE = path.join(os.homedir(), '.koi-auth.json');

export interface AuthState {
  deviceCode?: string;
  userCode?: string;
  verificationUri?: string;
  deviceCodeExpiresAt?: number;  // Unix timestamp (ms)
  accessToken?: string;
  accessTokenExpiresAt?: number; // Unix timestamp (ms)
  userEmail?: string;
}

/**
 * Load auth state from disk.
 * Returns empty object if file doesn't exist or is invalid.
 */
export function loadAuthState(): AuthState {
  try {
    if (fs.existsSync(AUTH_FILE)) {
      const data = fs.readFileSync(AUTH_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('[Auth] Failed to load auth state:', err);
  }
  return {};
}

/**
 * Save auth state to disk.
 */
export function saveAuthState(state: AuthState): void {
  try {
    fs.writeFileSync(AUTH_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.error('[Auth] Failed to save auth state:', err);
  }
}

/**
 * Clear auth state (logout).
 */
export function clearAuthState(): void {
  try {
    if (fs.existsSync(AUTH_FILE)) {
      fs.unlinkSync(AUTH_FILE);
    }
  } catch (err) {
    console.error('[Auth] Failed to clear auth state:', err);
  }
}

/**
 * Check if access token is still valid.
 */
export function hasValidAccessToken(state: AuthState): boolean {
  if (!state.accessToken || !state.accessTokenExpiresAt) {
    return false;
  }
  return Date.now() < state.accessTokenExpiresAt;
}

/**
 * Check if device code is still valid.
 */
export function hasValidDeviceCode(state: AuthState): boolean {
  if (!state.deviceCode || !state.deviceCodeExpiresAt) {
    return false;
  }
  return Date.now() < state.deviceCodeExpiresAt;
}

/**
 * Clear device code from state (after successful auth or expiry).
 */
export function clearDeviceCode(state: AuthState): AuthState {
  const { deviceCode, userCode, verificationUri, deviceCodeExpiresAt, ...rest } = state;
  return rest;
}
