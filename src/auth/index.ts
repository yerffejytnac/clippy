/**
 * Auth commands - interactive login and session management
 */

import { createLogger } from "../utils/logger.js";
import {
  type AuthState,
  clearAllSessions,
  deleteAuthState,
  extractDomain,
  getAuthDir,
  hasAuthState,
  listSessions,
  loadAuthState,
  saveAuthState,
} from "./storage.js";

const log = createLogger();

/**
 * Interactive login flow - opens browser for manual authentication
 */
export async function login(
  url: string,
  options: { headless?: boolean } = {},
): Promise<void> {
  let playwrightModule: typeof import("playwright");

  try {
    playwrightModule = await import("playwright");
  } catch {
    log.error(
      "Playwright is not installed. Run: npx playwright install chromium",
    );
    throw new Error("Playwright not available");
  }

  const domain = extractDomain(url);
  log.info(`\n  Opening browser for ${domain}...`);
  log.info(`  Please log in manually. Session will be saved automatically.\n`);

  const browser = await playwrightModule.chromium.launch({
    headless: options.headless ?? false, // Default to visible browser for login
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-setuid-sandbox",
    ],
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1920, height: 1080 },
    locale: "en-US",
  });

  const page = await context.newPage();

  try {
    // Navigate to the URL
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

    // Wait for user to complete login
    log.info("  Waiting for you to complete login...");
    log.info("  Press Ctrl+C when done, or wait for auto-detection.\n");

    // Watch for navigation or successful login indicators
    await Promise.race([
      // Wait for common post-login indicators
      page.waitForFunction(
        () => {
          // Check for common authenticated states
          return (
            document.cookie.includes("session") ||
            document.cookie.includes("auth") ||
            document.cookie.includes("token") ||
            localStorage.length > 0
          );
        },
        { timeout: 300000 },
      ), // 5 minutes

      // Or wait for user signal (they can press Ctrl+C)
      new Promise((resolve) => {
        process.on("SIGINT", resolve);
      }),
    ]);

    // Capture the auth state
    const storageState = await context.storageState();
    const authState: AuthState = {
      cookies: storageState.cookies,
      origins: storageState.origins,
    };

    // Save the auth state
    saveAuthState(domain, authState);

    log.success(`\n  ✓ Session saved for ${domain}`);
    log.info(`  Stored in: ${getAuthDir()}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message?.includes("Timeout")) {
      log.error("\n  Login timeout. Please try again.");
    } else {
      log.error(`\n  Login failed: ${message}`);
    }
    throw error;
  } finally {
    await browser.close();
  }
}

/**
 * List all stored sessions
 */
export function list(): void {
  const sessions = listSessions();

  if (sessions.length === 0) {
    log.info("\n  No stored sessions.\n");
    return;
  }

  log.info(`\n  Stored sessions (${sessions.length}):\n`);

  for (const session of sessions) {
    const lastUsed = new Date(session.lastUsed);
    const daysAgo = Math.floor(
      (Date.now() - lastUsed.getTime()) / (1000 * 60 * 60 * 24),
    );
    const timeStr =
      daysAgo === 0
        ? "today"
        : daysAgo === 1
          ? "yesterday"
          : `${daysAgo} days ago`;

    log.info(`  • ${session.domain}`);
    log.dim(`    Last used: ${timeStr}`);
  }

  log.info(`\n  Storage: ${getAuthDir()}\n`);
}

/**
 * Logout (delete) a session
 */
export function logout(url: string): void {
  const domain = extractDomain(url);

  if (!hasAuthState(domain)) {
    log.error(`\n  No session found for ${domain}\n`);
    return;
  }

  if (deleteAuthState(domain)) {
    log.success(`\n  ✓ Session removed for ${domain}\n`);
  } else {
    log.error(`\n  Failed to remove session for ${domain}\n`);
  }
}

/**
 * Clear all sessions
 */
export function clear(): void {
  const count = clearAllSessions();

  if (count === 0) {
    log.info("\n  No sessions to clear.\n");
  } else {
    log.success(`\n  ✓ Cleared ${count} session${count > 1 ? "s" : ""}\n`);
  }
}

/**
 * Check if a domain has stored auth
 */
export function check(url: string): boolean {
  const domain = extractDomain(url);
  return hasAuthState(domain);
}

// Re-export storage utilities
export {
  saveAuthState,
  loadAuthState,
  hasAuthState,
  deleteAuthState,
  extractDomain,
  getAuthDir,
  type AuthState,
};
