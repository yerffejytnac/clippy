/**
 * HTML to Markdown conversion using unified/rehype/remark ecosystem
 * More robust and feature-rich with security and enhancements
 */

import type { Element, Root } from "hast";
import type { Code } from "mdast";
import rehypeParse from "rehype-parse";
import rehypeRaw from "rehype-raw";
import rehypeRemark from "rehype-remark";
import remarkGfm from "remark-gfm";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import { SKIP, visit } from "unist-util-visit";

/**
 * Rehype plugin to clean up code elements and comments before conversion
 * - Removes HTML comments (except those inside <pre> or <code> blocks)
 * - Removes elements with data-md="skip"
 * - Merges adjacent inline code elements
 */
function rehypeCleanCode() {
  return (tree: Root) => {
    // Remove HTML comments (but preserve those inside code blocks)
    visit(tree, "comment", (_node, index, parent) => {
      if (parent && typeof index === "number") {
        // Don't remove comments if parent is pre or code
        if (
          parent.type === "element" &&
          (parent.tagName === "pre" || parent.tagName === "code")
        ) {
          return; // Keep the comment
        }
        parent.children.splice(index, 1);
        return [SKIP, index];
      }
    });

    // Remove elements with data-md="skip"
    visit(tree, "element", (node: Element, index, parent) => {
      if (node.tagName === "code" && node.properties?.dataMd === "skip") {
        if (parent && typeof index === "number") {
          parent.children.splice(index, 1);
          return [SKIP, index];
        }
      }
    });

    // Merge adjacent inline code elements
    visit(tree, "element", (node: Element) => {
      if (node.tagName === "pre") return; // Skip pre blocks

      const children = node.children;
      for (let i = 0; i < children.length - 1; i++) {
        const current = children[i];
        const next = children[i + 1];

        // Check if both are code elements
        if (
          current.type === "element" &&
          current.tagName === "code" &&
          next.type === "element" &&
          next.tagName === "code"
        ) {
          // Merge text content from next into current
          current.children.push(...next.children);
          // Remove next element
          children.splice(i + 1, 1);
          i--; // Re-check current position in case of multiple adjacent codes
        }
      }
    });
  };
}

/**
 * Remark plugin to infer code block language from content
 */
function remarkInferCodeLanguage() {
  return (tree: Root) => {
    visit(tree, "code", (node: Code) => {
      // Only infer if no language specified
      if (!node.lang && node.value) {
        node.lang = inferLanguageFromCode(node.value);
      }
    });
  };
}

/**
 * Infer programming language from code content
 */
function inferLanguageFromCode(code: string): string {
  // Check for JSX/React
  if (
    code.includes("import") &&
    (code.includes("React") ||
      (code.includes("<") && code.includes("/>") && code.includes(">")))
  ) {
    return "jsx";
  }

  // Check for TypeScript
  if (
    code.includes(": ") &&
    (code.includes("interface") ||
      code.includes("type ") ||
      code.includes("as ") ||
      code.includes(": string") ||
      code.includes(": number"))
  ) {
    return "typescript";
  }

  // Check for modern JavaScript
  if (
    code.includes("import ") ||
    code.includes("export ") ||
    code.includes("=>") ||
    code.includes("const ") ||
    code.includes("let ")
  ) {
    return "javascript";
  }

  // Check for JSON
  if (
    (code.trim().startsWith("{") || code.trim().startsWith("[")) &&
    (code.includes(":") || code.includes(","))
  ) {
    try {
      JSON.parse(code);
      return "json";
    } catch {}
  }

  // Check for shell/bash
  if (
    code.includes("#!/bin/") ||
    code.includes("npm ") ||
    code.includes("yarn ") ||
    code.includes("bun ") ||
    code.includes("$ ")
  ) {
    return "bash";
  }

  // Default to javascript for code with common patterns
  return "javascript";
}

/**
 * Convert HTML to Markdown using rehype-remark with security and enhancements
 */
export async function htmlToMarkdown(html: string): Promise<string> {
  if (!html || !html.trim()) {
    return "";
  }

  try {
    const processor = unified()
      .use(rehypeParse, { fragment: true }) // Parse HTML fragment
      .use(rehypeRaw) // Parse raw HTML nodes (handles malformed HTML better)
      .use(rehypeCleanCode) // Clean up code elements (remove skip, merge adjacent)
      .use(rehypeRemark) // Convert HTML (hast) to markdown (mdast)
      .use(remarkInferCodeLanguage) // Infer language for code blocks
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
    console.error("Error converting HTML to Markdown:", error);

    // Fallback: strip HTML tags while preserving code blocks
    // First, extract and preserve code blocks
    const codeBlocks: string[] = [];
    const htmlWithPlaceholders = html.replace(
      /<pre[^>]*>[\s\S]*?<\/pre>/gi,
      (match) => {
        codeBlocks.push(match);
        return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
      },
    );

    // Strip HTML tags from non-code content
    let result = htmlWithPlaceholders
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // Restore code blocks with preserved formatting
    codeBlocks.forEach((codeBlock, index) => {
      // Extract the code content, preserving newlines
      const codeMatch = codeBlock.match(
        /<pre[^>]*>(?:<code[^>]*>)?([\s\S]*?)(?:<\/code>)?<\/pre>/i,
      );
      if (codeMatch) {
        const codeContent = codeMatch[1]
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&amp;/g, "&")
          .replace(/&quot;/g, '"')
          .trim();

        result = result.replace(
          `__CODE_BLOCK_${index}__`,
          `\n\n\`\`\`\n${codeContent}\n\`\`\`\n\n`,
        );
      }
    });

    return result;
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
