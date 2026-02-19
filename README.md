 <div align="center">
  <img src="./assets/container.svg" alt="clippy" width="256" style="margin-bottom: 2rem;">
</div>

<br>

# clippy

**Crawl any site. Save as markdown.**

A fast, simple web scraper that saves crawled content as individual markdown files with frontmatter.

**Note:** Not affiliated with that helpful paperclip from your childhood. This one just grabs web pages.

## Install

```bash
npm install -g @tremendous.dev/clippy
```

## Quick Start

```bash
# Crawl a website and save as markdown files
clippy https://react.dev

# Specify output directory
clippy https://docs.python.org -o python-docs

# Crawl a GitHub repo
clippy https://github.com/user/repo -o repo-docs

# Crawl local codebase
clippy . -o my-code
```

## What It Does

- **Crawls websites** with configurable depth and concurrency
- **Extracts clean content** using Mozilla Readability
- **Converts to markdown** automatically
- **Saves individual files** — one `.md` file per page with YAML frontmatter
- **Handles JavaScript sites** — automatically falls back to browser mode when needed
- **Supports authentication** — crawl sites that require login using persistent sessions
- **Respects robots.txt** and rate limits by default
- **Works with Git repos** — can crawl GitHub repos or local directories

## Output Format

Each crawled page is saved as a separate markdown file with frontmatter:

```markdown
---
title: "Page Title"
url: "https://example.com/page"
author: "Author Name"
date: "2024-01-01"
crawled: "2024-01-15T10:30:00.000Z"
---

# Page Title

Page content in clean markdown format...
```

## Usage

### Basic Crawling

```bash
# Crawl with default settings (depth=2, max=150 pages)
clippy https://example.com

# Customize depth and page limit
clippy https://example.com --depth 3 --max-pages 500

# Multiple sources into one directory
clippy https://react.dev https://nextjs.org -o frontend-docs
```

### Output Control

```bash
# Specify output directory
clippy https://example.com -o my-docs

# Default output: ./clippy-output
clippy https://example.com
```

### Crawling Behavior

```bash
# Control concurrency and rate limiting
clippy https://example.com -c 5 -r 2

# Include/exclude patterns
clippy https://example.com --include "docs/.*" --exclude ".*\.pdf"

# Disable sitemap discovery
clippy https://example.com --no-sitemap

# Ignore robots.txt (use responsibly!)
clippy https://example.com --no-robots
```

### Browser Modes

```bash
# Force browser mode (for JS-heavy sites)
clippy https://spa-site.com --browser

# Force stealth mode (bypass anti-bot)
clippy https://protected-site.com --stealth
```

### Authentication

Crawl sites that require login using persistent browser sessions:

```bash
# Login once (opens browser for manual authentication)
clippy auth login https://example.com

# Crawl authenticated site (automatically uses saved session)
clippy https://example.com/private-docs

# Manage sessions
clippy auth list              # List all stored sessions
clippy auth logout <url>      # Remove a session
clippy auth clear             # Clear all sessions

# Disable auth for a specific crawl
clippy https://example.com --no-auth
```

### Preview Before Crawling

```bash
# See what's available via sitemap
clippy preview https://example.com
```

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `-o, --output <dir>` | Output directory for markdown files | `./clippy-output` |
| `-d, --depth <n>` | Crawl depth (0 = single page only) | `2` |
| `-m, --max-pages <n>` | Maximum pages to crawl | `150` |
| `-c, --concurrency <n>` | Concurrent requests | `10` |
| `-r, --rate-limit <n>` | Max requests per second | `10` |
| `-t, --timeout <ms>` | Request timeout | `10000` |
| `--include <regex>` | Only crawl URLs matching pattern | - |
| `--exclude <regex>` | Skip URLs matching pattern | - |
| `--label <label>` | Label for crawled documents | `web` |
| `--sitemap` | Use sitemap.xml for discovery | `true` |
| `--no-sitemap` | Disable sitemap discovery | - |
| `--no-robots` | Ignore robots.txt | - |
| `--no-auth` | Disable automatic auth detection | - |
| `--browser` | Force browser mode | - |
| `--stealth` | Force stealth mode | - |
| `-q, --quiet` | Minimal output | - |
| `-v, --verbose` | Verbose output | - |

## Examples

### Documentation Sites

```bash
# Crawl React docs
clippy https://react.dev -o react-docs

# Crawl Python docs (large site)
clippy https://docs.python.org --depth 3 --max-pages 1000 -o python-docs

# Crawl Stripe API docs
clippy https://stripe.com/docs -o stripe-docs
```

### Blogs & Articles

```bash
# Archive a blog
clippy https://paulgraham.com/articles.html -o pg-essays

# Specific article
clippy "https://example.com/article" -o articles
```

### GitHub Repositories

```bash
# Crawl a GitHub repo
clippy https://github.com/user/repo -o repo-docs

# Local codebase
clippy . -o my-project-docs
clippy /path/to/project -o project-docs
```

### Advanced Usage

```bash
# Slow and steady for rate-sensitive sites
clippy https://example.com -c 2 -r 1

# Fast crawl with high concurrency
clippy https://example.com -c 20 -r 50

# Deep crawl of specific section
clippy https://example.com/docs --depth 5 --include "docs/.*"

# JavaScript-heavy SPA
clippy https://spa.example.com --browser --max-pages 50
```

## How It Works

### Crawling Strategy

1. **URL Discovery**
   - Starts with provided URLs
   - Checks for `sitemap.xml` (unless disabled)
   - Follows links up to specified depth
   - Respects `robots.txt` by default

2. **Content Extraction**
   - Fetches pages with optimized waterfall:
     - `fetch` (fast, works for 90% of sites)
     - `playwright` (real browser, for JS sites)
     - `rebrowser` (stealth mode, bypasses anti-bot)
   - Extracts clean content using Mozilla Readability
   - Converts HTML to markdown

3. **File Output**
   - Sanitizes URL/title into safe filename
   - Adds YAML frontmatter with metadata
   - Writes individual `.md` file per page
   - Handles duplicate filenames with counters

### Deduplication

- Skips duplicate URLs automatically
- Detects locale variants (`/en/`, `/es/`, etc.)
- Identifies similar content to avoid redundancy

## Use Cases

- **Offline documentation** — Read docs without internet
- **Documentation archival** — Preserve documentation versions
- **Content backup** — Archive websites before they change
- **Research** — Collect content for analysis
- **Training data** — Gather markdown content for ML
- **Knowledge base** — Build searchable documentation collections

## Programmatic Usage

```javascript
import { clippy, preview } from 'clippy';

// Crawl a site
const result = await clippy(['https://example.com'], {
  output: './docs',
  depth: 2,
  maxPages: 100,
  quiet: false
});

console.log(`Crawled ${result.pages} pages`);
console.log(`Saved to: ${result.output}`);

// Preview available pages
const sitePreview = await preview('https://example.com');
console.log(`${sitePreview.totalPages} pages available`);
```

## Rate Limiting & Ethics

- **Default**: 10 requests/second with exponential backoff
- **Respects `robots.txt`** by default (use `--no-robots` to override)
- **Be responsible**: Don't hammer servers or bypass restrictions maliciously
- **Consider**: Reduce concurrency/rate-limit for smaller sites

## Limitations

- **No form submission** — Only GET requests
- **Basic JavaScript** — Complex SPAs may need `--browser` or `--stealth`
- **Cloudflare/reCAPTCHA** — Stealth mode helps but isn't perfect

## Troubleshooting

**Site blocks requests?**
```bash
clippy https://example.com --stealth
```

**JavaScript not rendering?**
```bash
clippy https://example.com --browser
```

**Rate limited?**
```bash
clippy https://example.com -c 2 -r 1
```

**Too many pages?**
```bash
clippy https://example.com --max-pages 50 --depth 1
```

## Development

```bash
# Clone and install
git clone https://github.com/yerffejytnac/clippy.git
cd clippy
bun install

# Build
bun run build

# Link locally (creates symlink in ~/.bun/bin)
bun link

# Use
clippy https://example.com
```

## Building with Bun

```bash
# Install with bun
bun install

# Build
bun run build

# Link globally (creates symlink in ~/.bun/bin)
bun link

# Make sure ~/.bun/bin is in your PATH

# Use
clippy https://example.com
```

## License

MIT

## Contributing

Contributions welcome! Please open an issue or PR.

## Credits

- Browser automation via [Playwright](https://playwright.dev/) and [Rebrowser](https://github.com/rebrowser/rebrowser-playwright)
- Content extraction using [Mozilla Readability](https://github.com/mozilla/readability)
- Markdown conversion with [rehype-remark](https://github.com/rehypejs/rehype-remark) and [unified](https://unifiedjs.com/)
