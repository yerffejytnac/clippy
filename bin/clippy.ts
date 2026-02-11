#!/usr/bin/env node

/**
 * clippy CLI - Web scraper that saves content as markdown files.
 */

import { Command } from "commander";
import { existsSync } from "fs";
import * as auth from "../src/auth/index.js";
import { clippy, preview } from "../src/index.js";
import { setLogMode } from "../src/utils/logger.js";
import * as ui from "../src/utils/ui.js";

const VERSION = "1.0.5";

// Global error handlers to prevent crashes
process.on("uncaughtException", (err) => {
  console.error(ui.errorMessage(`Unexpected error: ${err.message}`));
  process.exit(1);
});

process.on("unhandledRejection", (reason: any) => {
  const message = reason?.message || String(reason);
  console.error(ui.errorMessage(`Unhandled error: ${message}`));
  process.exit(1);
});

/**
 * Wrap async action with better error handling
 */
function safeAction<T extends any[]>(
  fn: (...args: T) => Promise<void>,
): (...args: T) => Promise<void> {
  return async (...args: T) => {
    try {
      await fn(...args);
    } catch (error: any) {
      // Provide helpful error messages for common issues
      let message = error.message || "Unknown error";

      if (message.includes("dimension mismatch")) {
        message =
          "Vector dimension mismatch. The file was created with a different embedding model. Try: maw find <file> <query> (uses lexical search)";
      } else if (message.includes("OPENAI_API_KEY")) {
        message =
          "OpenAI API key required. Set OPENAI_API_KEY environment variable or use --api-key flag";
      } else if (message.includes("ENOENT")) {
        message = `File not found: ${message.split("'")[1] || "unknown"}`;
      } else if (message.includes("EACCES")) {
        message = "Permission denied. Check file permissions.";
      } else if (message.includes("ENOSPC")) {
        message = "Disk full. Free up space and try again.";
      } else if (
        message.includes("fetch failed") ||
        message.includes("ETIMEDOUT")
      ) {
        message = "Network error. Check your internet connection.";
      } else if (message.includes("rate limit") || message.includes("429")) {
        message = "Rate limited. Wait a moment and try again.";
      }

      console.error(ui.errorMessage(message));
      process.exit(1);
    }
  };
}

const program = new Command();

program
  .name("clippy")
  .description("Crawl any site. Save as markdown.")
  .version(VERSION);

// Main command: clippy <urls...>
program
  .argument("[urls...]", "URLs/repos to crawl")
  .option(
    "-o, --output <dir>",
    "Output directory for markdown files",
    "./clippy-output",
  )
  .option("-d, --depth <n>", "Crawl depth (auto: 0 for pages, 2 for domains)")
  .option("-c, --concurrency <n>", "Concurrent requests", "10")
  .option("-m, --max-pages <n>", "Maximum pages to crawl (default: 150)")
  .option("-r, --rate-limit <n>", "Requests per second", "10")
  .option("-t, --timeout <ms>", "Request timeout in ms", "10000")
  .option("--include <pattern>", "URL pattern to include (regex)")
  .option("--exclude <pattern>", "URL pattern to exclude (regex)")
  .option("--label <label>", "Label for ingested documents", "web")
  .option("--sitemap", "Use sitemap.xml for discovery (default: true)")
  .option("--no-sitemap", "Disable sitemap discovery")
  .option("--no-robots", "Ignore robots.txt")
  .option(
    "--no-auth",
    "Disable automatic auth detection (ignores stored sessions)",
  )
  .option("--browser", "Force browser mode (for JavaScript-heavy sites)")
  .option("--stealth", "Force stealth mode (bypasses anti-bot)")
  .option("-q, --quiet", "Minimal output")
  .option("-v, --verbose", "Verbose output")
  .action(async (urls, options) => {
    if (urls.length === 0) {
      // Show banner and help
      console.log(ui.banner());
      program.help();
      return;
    }

    setLogMode(options.quiet, options.verbose);

    const sources = urls;

    if (sources.length === 0) {
      console.error(ui.errorMessage("No URLs or sources provided"));
      process.exit(1);
    }

    const outputDir = options.output;

    // Show header - detect git repos vs URLs
    if (!options.quiet) {
      const isGit = sources.some(
        (u: string) =>
          u.startsWith("https://github.com/") ||
          u.startsWith("https://gitlab.com/") ||
          u.includes(".git") ||
          u.startsWith(".") ||
          u.startsWith("/"),
      );
      const label = isGit ? "clippy (git)" : "clippy";
      const urlDisplay =
        sources.length === 1 ? sources[0] : `${sources.length} sources`;
      console.log(ui.header(label, urlDisplay));

      // Show output directory
      if (existsSync(outputDir)) {
        console.log(ui.theme.info(`  → Saving to ${outputDir}\n`));
      } else {
        console.log(ui.theme.info(`  → Creating ${outputDir}\n`));
      }
    }

    try {
      const result = await clippy(sources, {
        output: outputDir,
        depth: options.depth ? parseInt(options.depth, 10) : undefined, // undefined triggers auto-detect
        concurrency: parseInt(options.concurrency, 10),
        maxPages: options.maxPages ? parseInt(options.maxPages, 10) : undefined,
        rateLimit: parseInt(options.rateLimit, 10),
        timeout: parseInt(options.timeout, 10),
        includePattern: options.include
          ? new RegExp(options.include)
          : undefined,
        excludePattern: options.exclude
          ? new RegExp(options.exclude)
          : undefined,
        label: options.label,
        useSitemap: options.sitemap,
        respectRobots: options.robots,
        useAuth: options.auth, // Auto-uses stored sessions unless --no-auth
        forceEngine: options.stealth
          ? "rebrowser"
          : options.browser
            ? "playwright"
            : undefined,
        quiet: options.quiet,
        verbose: options.verbose,
      });

      // Success output
      console.log(
        ui.successMessage(
          result.output,
          result.size,
          result.pages,
          result.duration,
        ),
      );

      // Show dedup stats if any skipped
      const dedupStats = result.stats.dedup;
      if (
        dedupStats &&
        (dedupStats.localeSkipped > 0 || dedupStats.similarSkipped > 0)
      ) {
        console.log(ui.dedupStats(dedupStats));
      }

      // Show engine stats in verbose mode
      if (options.verbose) {
        console.log(ui.engineStats(result.stats));
      }

      // Warnings
      if (result.stoppedAtLimit) {
        console.log(ui.theme.warning("\n  ⚠ Stopped at size limit\n"));
      } else if (!options.quiet) {
        console.log(ui.theme.dim("  ✓ Done"));
      }

      console.log();
    } catch (error: any) {
      console.error(ui.errorMessage(error.message));
      process.exit(1);
    }
  });

// preview command: maw preview <url> (or np)
program
  .command("preview <url>")
  .alias("np")
  .description("Preview available pages on a site (sitemap discovery)")
  .option("-l, --limit <n>", "Number of pages to show", "20")
  .option("--json", "Output as JSON")
  .action(
    safeAction(async (url, options) => {
      // Basic URL validation
      try {
        new URL(url.startsWith("http") ? url : `https://${url}`);
      } catch {
        console.error(ui.errorMessage(`Invalid URL: ${url}`));
        process.exit(1);
      }

      const result = await preview(url, { limit: parseInt(options.limit, 10) });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log(ui.previewResults(result));
    }),
  );

// auth commands
const authCmd = program
  .command("auth")
  .description("Manage authentication sessions for protected sites");

authCmd
  .command("login <url>")
  .description("Login to a site (opens browser for manual authentication)")
  .option("--headless", "Run browser in headless mode")
  .action(
    safeAction(async (url, options) => {
      await auth.login(url, { headless: options.headless });
    }),
  );

authCmd
  .command("logout <url>")
  .description("Logout from a site (removes stored session)")
  .action(
    safeAction(async (url) => {
      auth.logout(url);
    }),
  );

authCmd
  .command("list")
  .alias("ls")
  .description("List all stored authentication sessions")
  .action(
    safeAction(async () => {
      auth.list();
    }),
  );

authCmd
  .command("clear")
  .description("Clear all stored sessions")
  .action(
    safeAction(async () => {
      auth.clear();
    }),
  );

program.parse();
