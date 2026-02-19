/**
 * clippy - Web scraper that saves content as markdown files.
 *
 * One command to consume entire websites, git repos, and files into markdown.
 */

import { Crawler, SitemapParser } from "./crawler/index.js";
import { isGitUrl, isLocalGitRepo, readGitRepo } from "./git/index.js";
import {
  getDirectorySize,
  ingestGitToMarkdown,
  ingestToMarkdown,
} from "./ingestor/index.js";
import { createLogger, setLogMode } from "./utils/logger.js";
import { normalizeUrl } from "./utils/url.js";

export interface ClippyOptions {
  output: string;
  depth?: number;
  concurrency?: number;
  maxPages?: number;
  rateLimit?: number;
  timeout?: number;
  includePattern?: RegExp;
  excludePattern?: RegExp;
  useSitemap?: boolean;
  respectRobots?: boolean;
  forceEngine?: "fetch" | "playwright" | "rebrowser";
  useAuth?: boolean; // Auto-detect and use stored auth (default: true)
  label?: string;

  quiet?: boolean;
  verbose?: boolean;
}

export interface ClippyResult {
  output: string;
  pages: number;
  size: number;
  duration: number;
  stoppedAtLimit?: boolean;
  skippedDupes?: number;

  stats: {
    fetch: number;
    playwright: number;
    rebrowser: number;
    blocked: number;
    dedup: {
      localeSkipped: number;
      similarSkipped: number;
      total: number;
    };
  };
}

const log = createLogger();

/**
 * Extract the base name from an output directory path
 * Examples:
 *   ./my-docs -> my-docs
 *   /path/to/react-native-keyboard-controller -> react-native-keyboard-controller
 *   ./clippy-output -> clippy-output
 */
function getOutputDirName(outputPath: string): string {
  const parts = outputPath.replace(/\\/g, "/").split("/");
  const basename = parts[parts.length - 1];
  return basename || "output";
}

/**
 * Check if URL is a specific page (not a domain root)
 * e.g., https://stripe.com/docs/api -> true (specific page)
 *       https://stripe.com/ -> false (domain root)
 *       https://stripe.com -> false (domain root)
 */
function isSpecificPage(url: string): boolean {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname;
    // It's a specific page if path has content beyond just /
    // Ignore common index patterns like /index.html
    if (path === "/" || path === "") return false;
    if (path.match(/^\/(index\.(html?|php|aspx?)|default\.(html?|aspx?))$/i))
      return false;
    // Has a meaningful path
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if input is a git repo (URL or local path)
 */
function isGitInput(input: string): boolean {
  return isGitUrl(input) || isLocalGitRepo(input);
}

/**
 * Main clippy function - crawl URLs, git repos, or files and save to markdown files
 */
export async function clippy(
  urls: string[],
  options: ClippyOptions,
): Promise<ClippyResult> {
  setLogMode(options.quiet || false, options.verbose || false);

  // Check if any input is a git repo
  const gitInputs = urls.filter((u) => isGitInput(u));
  const webInputs = urls.filter((u) => !isGitInput(u));

  // If we have git repos, handle them
  if (gitInputs.length > 0) {
    return clippyGit(gitInputs, options);
  }

  // Auto-detect single page mode: if ALL urls are specific pages, use single-page mode
  const allSpecificPages = webInputs.every((u) => isSpecificPage(u));
  const singlePageMode = allSpecificPages && options.depth === undefined;

  // Show mode indicator (CLI shows header, this adds context)
  if (!options.quiet) {
    if (singlePageMode) {
      log.info(
        `  Fetching ${webInputs.length} page${webInputs.length > 1 ? "s" : ""}...`,
      );
    } else {
      log.info(
        `  Crawling (depth ${options.depth ?? 2}, max ${options.maxPages ?? 150} pages)...`,
      );
    }
  }

  const crawler = new Crawler({
    // Single page mode: depth=0, maxPages=urls.length, no sitemap
    depth: singlePageMode ? 0 : (options.depth ?? 2),
    concurrency: options.concurrency ?? 10,
    maxPages: singlePageMode ? webInputs.length : (options.maxPages ?? 150),
    rateLimit: options.rateLimit ?? 10,
    timeout: options.timeout ?? 10000,
    includePattern: options.includePattern,
    excludePattern: options.excludePattern,
    useSitemap: singlePageMode ? false : (options.useSitemap ?? true),
    respectRobots: options.respectRobots ?? true,
    forceEngine: options.forceEngine,
    useAuth: options.useAuth ?? true, // Default to true - auto-detect stored auth
  });

  try {
    // Crawl and ingest
    const crawlResults = crawler.crawl(webInputs);

    const ingestStats = await ingestToMarkdown(crawlResults, {
      output: options.output,
      label: options.label,
      outputDirName: getOutputDirName(options.output),
    });

    // Get final stats
    const engineStats = crawler.getStats();
    const dirSize = await getDirectorySize(options.output);

    return {
      output: options.output,
      pages: ingestStats.pages,
      size: dirSize,
      duration: ingestStats.duration,
      stoppedAtLimit: ingestStats.stoppedAtLimit,
      skippedDupes: ingestStats.skippedDupes,

      stats: {
        fetch: engineStats.fetch,
        playwright: engineStats.playwright,
        rebrowser: engineStats.rebrowser,
        blocked: engineStats.blocked,
        dedup: engineStats.dedup || {
          localeSkipped: 0,
          similarSkipped: 0,
          total: 0,
        },
      },
    };
  } finally {
    await crawler.close();
  }
}

/**
 * Ingest git repos into markdown files
 */
async function clippyGit(
  repos: string[],
  options: ClippyOptions,
): Promise<ClippyResult> {
  const startTime = Date.now();

  if (!options.quiet) {
    log.info(`  Reading ${repos.length} repo${repos.length > 1 ? "s" : ""}...`);
  }

  // Read all git repos
  const allFiles = readGitRepo(repos[0]); // For now, handle one repo at a time

  const ingestStats = await ingestGitToMarkdown(allFiles, {
    output: options.output,
    label: options.label || "code",
  });

  const dirSize = await getDirectorySize(options.output);
  const duration = Date.now() - startTime;

  return {
    output: options.output,
    pages: ingestStats.files,
    size: dirSize,
    duration,
    stoppedAtLimit: ingestStats.stoppedAtLimit,

    stats: {
      fetch: ingestStats.files,
      playwright: 0,
      rebrowser: 0,
      blocked: 0,
      dedup: { localeSkipped: 0, similarSkipped: 0, total: ingestStats.files },
    },
  };
}

export interface PreviewResult {
  domain: string;
  totalPages: number;
  hasSitemap: boolean;
  estimatedSize?: string;
  recentPages: Array<{ url: string; lastmod?: string }>;
}

/**
 * Preview available pages on a site (sitemap discovery)
 */
export async function preview(
  url: string,
  options: { limit?: number } = {},
): Promise<PreviewResult> {
  const normalized = normalizeUrl(url);
  const parsedUrl = new URL(normalized);
  const domain = parsedUrl.hostname;

  const sitemap = new SitemapParser();
  const pages = await sitemap.parseWithMetadata(normalized);

  // Sort by lastmod (most recent first)
  const sortedPages = pages.sort((a, b) => {
    if (!a.lastmod && !b.lastmod) return 0;
    if (!a.lastmod) return 1;
    if (!b.lastmod) return -1;
    return new Date(b.lastmod).getTime() - new Date(a.lastmod).getTime();
  });

  const limit = options.limit || 20;
  const recentPages = sortedPages.slice(0, limit).map((p) => ({
    url: p.loc,
    lastmod: p.lastmod,
  }));

  // Estimate size (~300KB average per page for news sites, ~100KB for docs)
  const avgPageSize =
    domain.includes("cnn") || domain.includes("news") ? 300 : 100;
  const estimatedMB = (pages.length * avgPageSize) / 1024;
  const estimatedSize =
    estimatedMB < 50
      ? `${estimatedMB.toFixed(0)}MB (fits in free tier)`
      : `${estimatedMB.toFixed(0)}MB (needs API key for full crawl)`;

  return {
    domain,
    totalPages: pages.length,
    hasSitemap: pages.length > 0,
    estimatedSize: pages.length > 0 ? estimatedSize : undefined,
    recentPages,
  };
}

// Export types and utilities
export type { CrawlOptions, CrawlResult } from "./crawler/index.js";
export { Crawler } from "./crawler/index.js";
export type {
  EngineOptions,
  EngineResult,
  EngineStats,
} from "./engine/index.js";
export { EngineWaterfall } from "./engine/index.js";
export type { ExtractResult } from "./extractor/index.js";
export { Extractor } from "./extractor/index.js";
export { createLogger, setLogMode } from "./utils/logger.js";
