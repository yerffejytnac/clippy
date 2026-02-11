/**
 * HTML to Markdown conversion using unified/rehype/remark ecosystem
 * More robust and feature-rich than node-html-markdown
 */

import rehypeParse from "rehype-parse";
import rehypeRemark from "rehype-remark";
import remarkGfm from "remark-gfm";
import remarkStringify from "remark-stringify";
import { unified } from "unified";

/**
 * Convert HTML to Markdown using rehype-remark
 */
export async function htmlToMarkdown(html: string): Promise<string> {
  if (!html || !html.trim()) {
    return "";
  }

  try {
    const processor = unified()
      .use(rehypeParse, { fragment: true }) // Parse HTML fragment
      .use(rehypeRemark) // Convert HTML (hast) to markdown (mdast)
      .use(remarkGfm) // Support GitHub Flavored Markdown (tables, task lists, etc)
      .use(remarkStringify, {
        bullet: "-",
        fence: "`",
        fences: true,
        incrementListMarker: false,
      });

    const result = await processor.process(html);
    return String(result);
  } catch (error) {
    // Fallback: strip HTML tags if conversion fails
    return html
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
}

/**
 * Extract plain text from markdown (remove formatting)
 */
export function markdownToPlainText(markdown: string): string {
  return (
    markdown
      // Remove code blocks
      .replace(/```[\s\S]*?```/g, "")
      .replace(/`[^`]+`/g, "")

      // Remove images
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")

      // Convert links to text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")

      // Remove headers
      .replace(/^#{1,6}\s+/gm, "")

      // Remove emphasis
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/_([^_]+)_/g, "$1")

      // Remove blockquotes
      .replace(/^>\s*/gm, "")

      // Remove horizontal rules
      .replace(/^---$/gm, "")

      // Remove list markers
      .replace(/^[-*+]\s+/gm, "")
      .replace(/^\d+\.\s+/gm, "")

      // Collapse whitespace
      .replace(/\s+/g, " ")

      .trim()
  );
}
