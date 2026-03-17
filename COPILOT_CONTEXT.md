# COPILOT_CONTEXT — Parabula (Permanent AI Memory)

Purpose: keep an always-up-to-date, repo-local memory so an AI assistant (or a new dev) can be productive immediately.

## What this repo is

Parabula is a **self-validating, RTL-first A4 worksheet textbook**:

- Source-of-truth pages are **root-level**: `עמוד-N.html`.
- Styling is split into an immutable base + per-page CSS.
- A local **Preview Reader** provides navigation, TOC, live reload, and layout guardrails.
- Tests enforce the contract (no inline CSS, correct nav, correct per-topic numbering, etc.).

## Non‑negotiable contracts (SSOT)

Primary: `PROJECT_RULES.md`

Key rules:

- A4 wrapper: exactly one `main.a4-page.page-N` per `עמוד-N.html`.
- A4 size is fixed (don’t “solve” layout via overflow hacks).
- **No inline CSS in HTML**: no `<style>` tags and no `style="..."` attributes in HTML pages.
- Page CSS must be in `styles/pages/עמוד-N.css`.
- MathJax delimiters:
  - Inline: `\( ... \)`
  - Display: `$$ ... $$`
  - Do not use `$...$`.
- RTL is default; use CSS for local LTR islands when needed.
- SVG strokes must be non-scaling (`vector-effect: non-scaling-stroke`).

## The Preview system (day-to-day engine)

### Preview server

- File: `preview/server.mjs`
- File: `preview/server.mjs`
- Default: `HOST=127.0.0.1`, `PORT=5500`
- URL: `http://127.0.0.1:5500/preview`

Capabilities:

- Serves repo files safely (prevents path traversal).
- **Denies `rules.html`** (must return 404).
- Live reload via SSE:
  - `GET /events` (server emits `reload` when watched files change)
- TOC API:
  - `GET /api/toc` returns `{topics, flat}` built from `.nav-meta` and `.preview-nav-topics` hints.
- Layout guardrail:
  - `POST /api/layout-guard` logs `[CRITICAL ERROR]` for A4 overflow.

### Reader UI

- File: `preview/index.html`
- Must keep topic buttons visible while scrolling (tests enforce).

## Content organization

### A4 textbook pages (root)

- HTML: `עמוד-1.html` …
- CSS per page: `styles/pages/עמוד-1.css` …

Each page must contain:

- `.preview-nav` including:
  - `.nav-meta` formatted: `{Topic} — עמוד {i} / {total}`
  - prev/next links consistent with global reading order
  - `.preview-nav-topics` with `.topic-link` items
  - active topic uses `.is-active` + `aria-current="page"`
- `.page-number` equals `{i}` (topic-local index)
- `<title>` includes topic name and `עמוד {i}`

### Topic pages for GitHub Pages (pages/ → site/)

- Source: `pages/**/index.html` and optional `style.css`
- Build: `tools/build-site.ps1` flattens to `site/<topic>/<page>.html` and generates `site/index.html` + `site/.nojekyll`.

## Tooling and scripts

### NPM scripts (package.json)

- `npm run preview` → local Reader server (Node).
- `npm test` → Node test runner.
- `npm run verify` → tests + headless preview check.
- `npm run verify:super` → meta check + visual regression.

### Windows helpers

- `preview.ps1` → runs preview server and opens Reader; supports `-Lan`.
- `verify-all.ps1` → runs build-site checks and ensures repo is in a safe state for publishing.

### Headless guardrails

- `scripts/preview-check.mjs` uses Puppeteer to validate:
  - required A4 structure
  - overflow X/Y
  - out-of-bounds elements
  - **no raster `<img>`** (png/jpg/webp/gif)

### Visual regression

- `scripts/visual-regression.mjs` uses Playwright:
  - reads `visual-urls.txt`
  - compares screenshots vs `visual-baseline/`
  - writes current run to `visual-out/`

### Pythagoras pipeline (OCR/vector)

- `scripts/ocr-pythagoras.mjs` (Tesseract: `heb+eng`).
- `scripts/vectorize-pythagoras-pages.mjs` (PNG → SVG with Imagetracer + text layer from TSV).
- `scripts/fix-pythagoras-triangle-labels.mjs` (geometry-based label placement in SVG).
- `scripts/audit-pythagoras-uniformity.mjs` (uniformity checks for key pages).

## Tests that define the contract

- `tests/a4-pages.rules.test.mjs`
  - global: no inline CSS in root HTML
  - required structure, required stylesheet links, nav rules, numbering consistency
  - prev/next global order enforcement
  - Pythagoras-specific regressions (e.g., exact counts, inline SVG constraints)

- `tests/preview.rules.test.mjs`
  - Reader must have persistent topic buttons UI
  - preview CSS must not hide critical nav
  - preview server must not serve `rules.html`

## “If something breaks” checklist

1. Run `npm test` and read the exact failure.
2. Find the matching rule section in `PROJECT_RULES.md`.
3. Fix the source HTML/CSS (do not edit tests to make them pass).
4. Re-run `npm run preview` and verify `/preview` still shows topic buttons and correct nav.

## Notes / known quirks

- `meta/pages.json` exists but may be empty; the Reader TOC is built from actual HTML (`.nav-meta` + topic hints).
- Prefer the Node preview server (`npm run preview` / `preview.ps1`) for stable CSS/MathJax behavior.
