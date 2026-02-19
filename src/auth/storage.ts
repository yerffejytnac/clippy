/**
 * Auth state storage - manages persistent browser sessions
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface AuthState {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: "Strict" | "Lax" | "None";
  }>;
  origins: Array<{
    origin: string;
    localStorage: Array<{ name: string; value: string }>;
  }>;
}

export interface StoredSession {
  domain: string;
  createdAt: string;
  lastUsed: string;
  authState: AuthState;
}

/**
 * Get the auth storage directory
 */
export function getAuthDir(): string {
  return join(homedir(), ".clippy", "auth");
}

/**
 * Ensure auth directory exists
 */
function ensureAuthDir(): void {
  const authDir = getAuthDir();
  if (!existsSync(authDir)) {
    mkdirSync(authDir, { recursive: true });
  }
}

/**
 * Get the file path for a domain's auth state
 */
function getAuthFilePath(domain: string): string {
  // Sanitize domain name for file system
  const safeDomain = domain.replace(/[^a-z0-9.-]/gi, "_");
  return join(getAuthDir(), `${safeDomain}.json`);
}

/**
 * Extract domain from URL
 */
export function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return url;
  }
}

/**
 * Save auth state for a domain
 */
export function saveAuthState(domain: string, authState: AuthState): void {
  ensureAuthDir();

  const session: StoredSession = {
    domain,
    createdAt: new Date().toISOString(),
    lastUsed: new Date().toISOString(),
    authState,
  };

  const filePath = getAuthFilePath(domain);
  writeFileSync(filePath, JSON.stringify(session, null, 2), "utf-8");
}

/**
 * Load auth state for a domain
 */
export function loadAuthState(domain: string): AuthState | null {
  try {
    const filePath = getAuthFilePath(domain);

    if (!existsSync(filePath)) {
      return null;
    }

    const content = readFileSync(filePath, "utf-8");
    const session: StoredSession = JSON.parse(content);

    // Update last used timestamp
    session.lastUsed = new Date().toISOString();
    writeFileSync(filePath, JSON.stringify(session, null, 2), "utf-8");

    return session.authState;
  } catch {
    return null;
  }
}

/**
 * Check if auth state exists for a domain
 */
export function hasAuthState(domain: string): boolean {
  const filePath = getAuthFilePath(domain);
  return existsSync(filePath);
}

/**
 * Delete auth state for a domain
 */
export function deleteAuthState(domain: string): boolean {
  try {
    const filePath = getAuthFilePath(domain);

    if (!existsSync(filePath)) {
      return false;
    }

    unlinkSync(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * List all stored sessions
 */
export function listSessions(): StoredSession[] {
  try {
    ensureAuthDir();
    const authDir = getAuthDir();
    const files = readdirSync(authDir).filter((f) => f.endsWith(".json"));

    return files
      .map((file) => {
        const content = readFileSync(join(authDir, file), "utf-8");
        return JSON.parse(content) as StoredSession;
      })
      .sort((a, b) => {
        return new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime();
      });
  } catch {
    return [];
  }
}

/**
 * Clear all stored sessions
 */
export function clearAllSessions(): number {
  try {
    const sessions = listSessions();
    let cleared = 0;

    for (const session of sessions) {
      if (deleteAuthState(session.domain)) {
        cleared++;
      }
    }

    return cleared;
  } catch {
    return 0;
  }
}
