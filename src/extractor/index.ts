/**
 * Content extraction pipeline
 * Uses Readability for main content extraction + rehype-remark for conversion
 */

import { Readability } from "@mozilla/readability";
import * as cheerio from "cheerio";
import { JSDOM } from "jsdom";
import { cleanHtml, findMainContent } from "./cleaner.js";
import { extractLinks } from "./links.js";
import { htmlToMarkdown } from "./markdown.js";

export interface ExtractResult {
  title: string;
  markdown: string;
  description: string;
  author: string | null;
  publishedDate: string | null;
  links: string[];
  wordCount: number;
  byteSize: number;
}

export interface ExtractOptions {
  includeLinks?: boolean;
  maxContentLength?: number;
}

const DEFAULT_OPTIONS: ExtractOptions = {
  includeLinks: true,
  maxContentLength: 500000, // 500KB max content
};

export class Extractor {
  async extract(
    html: string,
    url: string,
    options: ExtractOptions = {},
  ): Promise<ExtractResult> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const $ = cheerio.load(html);

    // Extract metadata before cleaning
    const title = this.extractTitle($, url);
    const description = this.extractDescription($);
    const author = this.extractAuthor($);
    const publishedDate = this.extractDate($);
    const links = opts.includeLinks ? extractLinks($, url) : [];

    // Preserve code blocks BEFORE cleaning
    // This prevents Readability from mangling syntax-highlighted code
    this.preserveCodeBlocks($);

    // Clean HTML
    cleanHtml($);

    // Try Readability first for article extraction
    let markdown: string;
    try {
      const cleanedHtml = $.html();
      const dom = new JSDOM(cleanedHtml, { url });
      const reader = new Readability(dom.window.document, {
        charThreshold: 50,
      });
      const article = reader.parse();

      if (
        article?.content &&
        article.textContent &&
        article.textContent.length > 100
      ) {
        // Use rehype-remark for robust HTML to markdown conversion
        markdown = await htmlToMarkdown(article.content);

        // Readability often strips reference sections - try to append them back
        const referencesHtml = this.extractReferences($);
        if (referencesHtml) {
          const referencesMd = await htmlToMarkdown(referencesHtml);
          if (referencesMd.trim()) {
            markdown += `\n\n${referencesMd}`;
          }
        }

        // Use Readability's title if better
        if (article.title && article.title.length > title.length) {
          // title = article.title; // Uncomment if preferred
        }
      } else {
        // Fallback: try to find main content area
        const mainContent = findMainContent($);
        if (mainContent) {
          markdown = await htmlToMarkdown(mainContent);
        } else {
          // Last resort: convert body
          markdown = await htmlToMarkdown($("body").html() || cleanedHtml);
        }
      }
    } catch {
      // Fallback if Readability fails
      markdown = await htmlToMarkdown($.html());
    }

    // Truncate if too long
    if (opts.maxContentLength && markdown.length > opts.maxContentLength) {
      markdown = `${markdown.slice(0, opts.maxContentLength)}\n\n[Content truncated...]`;
    }

    const wordCount = markdown.split(/\s+/).filter(Boolean).length;

    return {
      title,
      markdown,
      description,
      author,
      publishedDate,
      links,
      wordCount,
      byteSize: Buffer.byteLength(markdown, "utf8"),
    };
  }

  /**
   * Extract references/bibliography section
   * Readability often strips these, but they contain valuable links
   */
  private extractReferences($: cheerio.CheerioAPI): string | null {
    const selectors = [
      "#references",
      ".references",
      ".references-section",
      '[class*="reference"]',
      "#bibliography",
      ".bibliography",
      '[id*="references"]',
    ];

    for (const selector of selectors) {
      const $section = $(selector).first();
      if ($section.length) {
        const html = $section.html();
        if (html && html.trim().length > 50) {
          return html;
        }
      }
    }

    return null;
  }

  /**
   * Preserve code blocks by extracting and simplifying them
   * This prevents syntax highlighting spans from being mangled by Readability
   */
  private preserveCodeBlocks($: cheerio.CheerioAPI): void {
    // Remove code elements that should be skipped
    $('code[data-md="skip"]').remove();

    // Merge adjacent inline code elements (common in documentation)
    $("code").each((_, elem) => {
      const $code = $(elem);
      const parent = $code.parent();

      // Skip if inside a pre block (handled separately)
      if (parent.is("pre")) return;

      // Merge with next sibling code elements
      let next = $code.next();
      while (next.length > 0 && next.is("code")) {
        $code.append(next.text());
        const toRemove = next;
        next = next.next();
        toRemove.remove();
      }
    });

    $("pre").each((_, elem) => {
      const $pre = $(elem);

      // Extract code text carefully to preserve newlines
      // For syntax-highlighted code (with nested divs/spans), we need to reconstruct line breaks
      let codeText: string;

      // Check if this is syntax-highlighted code (common patterns: ec-line, code-line, line, etc.)
      const $lines = $pre.find('[class*="line"]');

      if ($lines.length > 0) {
        // Syntax-highlighted code: extract text from each line div and join with newlines
        const lines: string[] = [];
        $lines.each((_, lineElem) => {
          const lineText = $(lineElem).text();
          lines.push(lineText);
        });
        codeText = lines.join("\n");
      } else {
        // Plain code: use .text() which should preserve newlines
        codeText = $pre.text();
      }

      // Detect language from various common attributes
      const lang =
        $pre.attr("data-lang") ||
        $pre.attr("data-language") ||
        $pre.attr("data-md-lang") ||
        $pre
          .find("code")
          .attr("class")
          ?.match(/language-(\w+)/)?.[1] ||
        $pre.find("code").attr("data-lang") ||
        "";

      // Create a clean, simple structure: <pre><code class="language-X">text</code></pre>
      const $code = $("<code></code>").text(codeText);
      if (lang) {
        $code.attr("class", `language-${lang}`);
      }

      $pre.empty().append($code);

      // Remove any extra attributes that might confuse processors
      $pre.removeAttr("style");
      $pre.removeAttr("data-highlighted");
    });
  }

  private extractTitle($: cheerio.CheerioAPI, url: string): string {
    const sources = [
      $('meta[property="og:title"]').attr("content"),
      $('meta[name="twitter:title"]').attr("content"),
      $("title").text(),
      $("h1").first().text(),
    ];

    for (const source of sources) {
      if (source?.trim()) {
        // Remove site name suffix (e.g., "Page Title | Site Name")
        const cleaned = source.split(/\s*[|\-–—]\s*/)[0].trim();
        if (cleaned.length > 0) {
          return cleaned;
        }
      }
    }

    // Fallback to URL path
    try {
      const pathname = new URL(url).pathname;
      if (pathname && pathname !== "/") {
        const result = pathname
          .replace(/\/$/, "")
          .split("/")
          .pop()
          ?.replace(/[-_]/g, " ")
          .replace(/\.\w+$/, "");
        if (result) {
          return result;
        }
      }
    } catch {}

    return url;
  }

  private extractDescription($: cheerio.CheerioAPI): string {
    const sources = [
      $('meta[property="og:description"]').attr("content"),
      $('meta[name="description"]').attr("content"),
      $('meta[name="twitter:description"]').attr("content"),
    ];

    for (const source of sources) {
      if (source?.trim()) {
        return source.slice(0, 300);
      }
    }

    return "";
  }

  private extractAuthor($: cheerio.CheerioAPI): string | null {
    const sources = [
      $('meta[name="author"]').attr("content"),
      $('meta[property="article:author"]').attr("content"),
      $('[rel="author"]').first().text(),
      $('[itemprop="author"]').first().text(),
      $(".author").first().text(),
      $('[class*="author-name"]').first().text(),
    ];

    for (const source of sources) {
      if (source?.trim()) {
        return source.trim().slice(0, 100);
      }
    }

    return null;
  }

  private extractDate($: cheerio.CheerioAPI): string | null {
    const sources = [
      $('meta[property="article:published_time"]').attr("content"),
      $('meta[name="date"]').attr("content"),
      $('meta[name="publish-date"]').attr("content"),
      $("time[datetime]").attr("datetime"),
      $('[itemprop="datePublished"]').attr("content"),
      $('[itemprop="datePublished"]').attr("datetime"),
    ];

    for (const source of sources) {
      if (source?.trim()) {
        try {
          const date = new Date(source);
          if (!Number.isNaN(date.getTime())) {
            return date.toISOString();
          }
        } catch {}
      }
    }

    return null;
  }
}

export { cleanHtml, findMainContent } from "./cleaner.js";
export {
  extractInternalLinks,
  extractLinks,
  extractLinksWithMeta,
} from "./links.js";
export { htmlToMarkdown, markdownToPlainText } from "./markdown.js";
