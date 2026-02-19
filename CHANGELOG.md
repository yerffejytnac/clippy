# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- npm package publishing as `@tremendous.dev/clippy`
- Biome linter configuration for consistent code formatting and quality
- LICENSE.md file (MIT License)
- GitHub Actions workflow for pull requests
- TypeScript strict configuration (`tsconfig.check.json`)
- Authentication support for protected sites with session storage
- Browser automation with Playwright and Rebrowser for JavaScript-heavy sites
- Sitemap discovery and robots.txt support
- Smart duplicate detection with locale and content similarity checks
- Enhanced markdown extraction using unified/rehype/remark ecosystem
- Language inference for code blocks in markdown output
- Git repository cloning and documentation extraction

### Changed
- **BREAKING**: Removed `bin/clippy.ts` (moved to package bin configuration)
- Updated all dependencies to latest versions:
  - @mozilla/readability: 0.5.0 → 0.6.0
  - cheerio: 1.1.2 → 1.2.0
  - commander: 12.1.0 → 14.0.3
  - jsdom: 24.1.3 → 28.1.0
  - marked: 17.0.1 → 17.0.3
  - p-queue: 8.1.1 → 9.1.0
  - playwright: 1.57.0 → 1.58.2
  - @types/jsdom: 21.1.7 → 27.0.0
  - @types/node: 20.19.30 → 25.3.0
  - vitest: 1.6.1 → 4.0.18
- Migrated from custom linting to Biome for faster, more consistent code quality
- Improved error handling with proper Error type guards instead of `any`
- Enhanced null safety by removing non-null assertions and adding proper checks
- Node.js built-in imports now use `node:` protocol for clarity

### Fixed
- All linting errors and TypeScript compilation issues
- Unused variable warnings across codebase
- Non-null assertion safety issues in crawler and sitemap parser
- Inline code block parsing with proper data-md attribute handling
- Code block language detection and preservation in markdown output

### Developer Experience
- Added Biome for fast linting and formatting
- Improved TypeScript strictness with additional compiler checks
- Better error messages with instanceof Error checks
- Cleaner import statements with node: protocol

## [0.0.1] - Initial Release

### Added
- Initial implementation of clippy web scraper
- Core crawling functionality with depth control
- Markdown conversion and file output
- Basic CLI interface with Commander.js
