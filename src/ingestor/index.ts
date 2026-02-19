import { existsSync } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { CrawlResult } from "../crawler/index.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger();

export interface IngestOptions {
  output: string; // output directory path
  label?: string;
  maxSizeMB?: number;
  outputDirName?: string; // base name of output directory for filename prefixing
}

export interface IngestStats {
  pages: number;
  bytes: number;
  duration: number;
  stoppedAtLimit?: boolean;
  skippedDupes?: number;
}

export interface GitIngestOptions {
  output: string; // output directory path
  label?: string;
  maxSizeMB?: number;
}

export interface GitIngestStats {
  files: number;
  bytes: number;
  duration: number;
  stoppedAtLimit?: boolean;
}

/**
 * Sanitize a URL or title into a safe filename
 */
function sanitizeFilename(url: string, outputDirName?: string): string {
  let prefix = "";
  let pathPart = "";

  // Extract domain and path from URL
  if (url.startsWith("http://") || url.startsWith("https://")) {
    try {
      const parsed = new URL(url);

      // Use outputDirName if provided, otherwise fall back to domain
      prefix = outputDirName || parsed.hostname.replace(/^www\./, "");

      // Get path and convert to filename-safe format
      pathPart = parsed.pathname
        .replace(/^\//, "") // Remove leading slash
        .replace(/\/$/, "") // Remove trailing slash
        .replace(/\//g, "_") // Replace slashes with underscores
        .toLowerCase();

      // If path is empty, use 'index'
      if (!pathPart) {
        pathPart = "index";
      }
    } catch {
      // Invalid URL, use as-is
      prefix = outputDirName || "page";
      pathPart = url.replace(/[^a-z0-9._-]/gi, "_").toLowerCase();
    }
  } else {
    // Not a URL
    prefix = outputDirName || "page";
    pathPart = url.replace(/[^a-z0-9._-]/gi, "_").toLowerCase();
  }

  // Clean prefix and pathPart first (before combining)
  prefix = prefix
    .toLowerCase()
    .replace(/[^a-z0-9._-]/gi, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

  pathPart = pathPart
    .replace(/[^a-z0-9._-]/gi, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

  // Combine with double underscore separator
  let filename = `${prefix}__${pathPart}`;

  // Truncate if too long (leave room for .md extension and counter)
  if (filename.length > 200) {
    filename = filename.slice(0, 200);
  }

  return filename || "untitled";
}

/**
 * Generate YAML frontmatter for a markdown file
 */
function generateFrontmatter(result: CrawlResult): string {
  const lines = ["---"];

  if (result.extracted.title) {
    lines.push(`title: "${result.extracted.title.replace(/"/g, '\\"')}"`);
  }

  if (result.url) {
    lines.push(`url: "${result.url}"`);
  }

  if (result.extracted.author) {
    lines.push(`author: "${result.extracted.author.replace(/"/g, '\\"')}"`);
  }

  if (result.extracted.publishedDate) {
    lines.push(`date: "${result.extracted.publishedDate}"`);
  }

  lines.push(`crawled: "${new Date().toISOString()}"`);

  lines.push("---");
  lines.push("");

  return lines.join("\n");
}

/**
 * Ensure unique filename by appending counter if needed
 */
async function getUniqueFilename(
  dir: string,
  basename: string,
): Promise<string> {
  let filename = `${basename}.md`;
  let filepath = join(dir, filename);
  let counter = 1;

  while (existsSync(filepath)) {
    filename = `${basename}-${counter}.md`;
    filepath = join(dir, filename);
    counter++;
  }

  return filename;
}

/**
 * Ingest crawl results to markdown files
 */
export async function ingestToMarkdown(
  results: AsyncIterable<CrawlResult>,
  options: IngestOptions,
): Promise<IngestStats> {
  const startTime = Date.now();
  const { output, maxSizeMB } = options;

  const stats: IngestStats = {
    pages: 0,
    bytes: 0,
    duration: 0,
    skippedDupes: 0,
  };

  // Create output directory if it doesn't exist
  if (!existsSync(output)) {
    await mkdir(output, { recursive: true });
    log.info(`Created output directory: ${output}`);
  }

  const maxBytes = maxSizeMB ? maxSizeMB * 1024 * 1024 : Infinity;

  try {
    for await (const result of results) {
      // Check size limit
      if (stats.bytes >= maxBytes) {
        log.warn(`Reached size limit of ${maxSizeMB}MB`);
        stats.stoppedAtLimit = true;
        break;
      }

      // Skip if no markdown content
      if (
        !result.extracted.markdown ||
        result.extracted.markdown.trim().length === 0
      ) {
        log.dim(`Skipping ${result.url} - no markdown content`);
        continue;
      }

      // Generate filename
      const basename = sanitizeFilename(result.url, options.outputDirName);
      const filename = await getUniqueFilename(output, basename);
      const filepath = join(output, filename);

      // Generate content with frontmatter
      const frontmatter = generateFrontmatter(result);
      const content = frontmatter + result.extracted.markdown;

      // Write file
      await writeFile(filepath, content, "utf-8");

      const fileSize = Buffer.byteLength(content, "utf-8");
      stats.bytes += fileSize;
      stats.pages++;

      log.dim(`Wrote ${filename} (${fileSize} bytes)`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`Error writing markdown files: ${message}`);
    throw error;
  }

  stats.duration = Date.now() - startTime;
  return stats;
}

/**
 * Ingest git repository files to markdown files
 */
export async function ingestGitToMarkdown(
  files: AsyncIterable<{
    path: string;
    content: string;
    language: string;
    size: number;
  }>,
  options: GitIngestOptions,
): Promise<GitIngestStats> {
  const startTime = Date.now();
  const { output, maxSizeMB } = options;

  const stats: GitIngestStats = {
    files: 0,
    bytes: 0,
    duration: 0,
  };

  // Create output directory if it doesn't exist
  if (!existsSync(output)) {
    await mkdir(output, { recursive: true });
    log.info(`Created output directory: ${output}`);
  }

  const maxBytes = maxSizeMB ? maxSizeMB * 1024 * 1024 : Infinity;

  try {
    for await (const file of files) {
      // Check size limit
      if (stats.bytes >= maxBytes) {
        log.warn(`Reached size limit of ${maxSizeMB}MB`);
        stats.stoppedAtLimit = true;
        break;
      }

      // Create subdirectories if needed
      const filename = `${file.path.replace(/\//g, "-")}.md`;
      const filepath = join(output, filename);

      // Ensure parent directory exists
      const parentDir = dirname(filepath);
      if (!existsSync(parentDir)) {
        await mkdir(parentDir, { recursive: true });
      }

      // Generate frontmatter
      const frontmatter = [
        "---",
        `path: "${file.path}"`,
        `language: "${file.language}"`,
        `size: ${file.size}`,
        `crawled: "${new Date().toISOString()}"`,
        "---",
        "",
      ].join("\n");

      // Wrap content in code fence
      const content = `${frontmatter}\`\`\`${file.language}\n${file.content}\n\`\`\`\n`;

      // Write file
      await writeFile(filepath, content, "utf-8");

      const fileSize = Buffer.byteLength(content, "utf-8");
      stats.bytes += fileSize;
      stats.files++;

      log.dim(`Wrote ${filename} (${fileSize} bytes)`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`Error writing git files: ${message}`);
    throw error;
  }

  stats.duration = Date.now() - startTime;
  return stats;
}

/**
 * Get total size of output directory
 */
export async function getDirectorySize(path: string): Promise<number> {
  try {
    if (!existsSync(path)) {
      return 0;
    }

    const stats = await stat(path);
    if (!stats.isDirectory()) {
      return stats.size;
    }

    // For simplicity, just return 0 for directories
    // In practice, we track size during ingestion
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`Error getting directory size: ${message}`);
    return 0;
  }
}
