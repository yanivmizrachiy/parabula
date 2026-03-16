# PROJECT_RULES — Parabula (Single Source of Truth)

This repository is a **self-validating, RTL-first A4 digital textbook**. This document is the **ground truth** for future edits and code generation.

---

## 0) Ground Truth (non-negotiable)

### A4 page contract

- Every textbook page lives in repo root as `עמוד-N.html`.
- Every page MUST contain exactly one main wrapper: `main.a4-page.page-N`.
- `.a4-page` is **exactly** `210mm × 297mm`.
- DO NOT use `overflow: auto` anywhere to “fix” height.

### A4 content coverage (required)

- Pages must be laid out to **use the full A4 page area** (no large unintended empty regions), while still respecting the A4 contract above.
- **Pythagoras — topic page 1** (`עמוד-9.html`) MUST be composed to **span the entire A4 page** and utilize the available height according to the design rules of this repo.

### Topic pages must not overflow (required)

- Topic pages under `pages/**` that represent printable A4 content must also be composed so that interactive/writing elements (e.g., answer boxes) **never spill outside the A4 bounds**.
- Avoid fixed widths that can overflow in narrow columns; prefer responsive layout primitives (`min-width: 0`, flexible grid tracks, and `flex: 1` where appropriate).

### CSS rules (critical)

- **ZERO inline styles**: no `<style>` tags and no `style="..."` attributes in any `עמוד-N.html`.
- **All page-specific CSS** goes ONLY in `styles/pages/עמוד-N.css`.
- `styles/a4-base.css` is **immutable foundation** (do not edit).

### Project-wide HTML/CSS separation (required)

- The repository enforces **full separation between HTML and CSS**.
- **No inline CSS anywhere**:
  - No `<style>` blocks
  - No `style="..."` attributes
- Styling must live in dedicated CSS files (A4 pages under `styles/`, topic pages under their topic `style.css`).

### RTL rules

- RTL (`dir="rtl"`) must be preserved across layout and navigation.
- If you must use LTR for math/answers, do it via CSS (`direction: ltr; unicode-bidi: isolate;`) in the page CSS.

### Math rendering

- Use MathJax delimiters:
  - Inline: `\( ... \)`
  - Display: `$$ ... $$`
- **Do not use `$...$`** or any `$` math delimiter in pages.

### Math notation (answers)

- When a problem has **two solutions** (e.g., quadratic roots), label them as **subscripts** using MathJax: `\(x_1\)` and `\(x_2\)` (not `x1/x2` text).

### Hebrew math writing (required)

- In Hebrew text, write negative numbers in a **mathematically correct order**: “מינוס 4” (or `\(-4\)`), not “4 מינוס”.

### Subquestion formatting (required)

- Subquestions inside a page (e.g., `.q-sub`) are separated by the **black bullet** only.
- Do **not** add manual numbering markers inside the text (no `א./ב./ג.` and no `1/2/3`) unless the user explicitly requested numbered subquestions for that page.

### Solution / writing space (required)

- Pages that include free-writing areas (e.g., `.solution-space`) must be laid out so those areas **expand to use the available A4 height**, avoiding large unintended blank regions.

### Exercise blocks must be separated (required)

- In exercise grids/lists (e.g., `.pyt-tri-grid` with `.problem-block`), each block must be visually separated with **white space between blocks**.
- Blocks must not touch each other; do not set vertical gaps to zero in a way that merges adjacent blocks.

### Solutions footer (layout + notation)

- When a page includes a compact solutions footer (e.g., `.eq-solutions`, `.pyt-solutions`), the answers must be **distributed across the full line width** (e.g., via CSS grid), not clumped to one side.
- For exercises whose answers are a **pair** (e.g., two roots), present the pair with **correct parentheses**: `\((x_1,\,x_2)\)` or `\((a,\,b)\)` as appropriate.

### SVG rules

- Every SVG stroke must be **non-scaling**:
  - Use `vector-effect: non-scaling-stroke` (in SVG attributes or via page CSS selectors).

### Geometry diagrams — parallelism notation (required)

- **Placement:** Parallel markers MUST be placed at the **exact midpoint** of the segment they annotate.
- **Style:** Markers must be **clean, sharp chevrons** centered on the segment (avoid cluttered marks that can read as right-angle/angle notation).
- **Distinct pairs:** Use a **single chevron** (`>`) for the first parallel pair and a **double chevron** (`>>`) for the second parallel pair.
- **Alignment:** The chevrons must be rotated to match the **segment direction/slope**.
- **Labels:** Vertex labels (A, B, C, D) must sit **outside** the polygon with a consistent padding (~5pt) and must not touch/overlap any stroke.
- **Print clarity:** Use consistent, high-contrast strokes suitable for A4 printing (no faint gray lines for primary geometry edges).

### Geometry / coordinate systems

- Coordinate system container size: **440px × 440px**.
- Grid increment: **22px** (20 units per axis).
- Labels use `.axis-label` with **absolute positioning** relative to `.coordinate-system`.

---

## 1) Live Preview (permanent)

### The canonical preview server

- Run: `npm run preview`
- URL: http://127.0.0.1:5500
- Reader UI: `/preview` (also served at `/`)

Reader URL parameters (supported):

- `mode=all` (default) or `mode=book`
- `file=<relative html path>` (must exist in the Preview TOC; otherwise the reader falls back to the first valid page)

Notes:

- Default host/port are controlled by env vars `HOST` and `PORT` (see `preview/server.mjs`).
- Windows helper: `./preview.ps1` (can also run with `-Lan` to bind `0.0.0.0`).

### Zero‑Touch VS Code (required)

- Opening this repo folder in VS Code must automatically start the canonical preview server and open the Reader inside VS Code (no external browser, no manual commands).
- Port is fixed to `5500`.
- Repo must include the single setup script: `tools/zero-touch-preview.ps1`.
- `.vscode/tasks.json` must include a task with `runOptions.runOn = folderOpen`.
- VS Code must recommend/install the official extension `ms-vscode.live-server` (Live Preview) and pin `livePreview.*` settings in `.vscode/settings.json`.

### Live reload + correctness signals

- The preview must reload on changes to watched files (recursive): `*.html`, `*.css`, `*.js`, `*.mjs`, `*.svg` (excluding ignored paths like `.git/`, `node_modules/`, `.vscode/`).
- The preview must **detect A4 overflow** for `.a4-page` and report a terminal line:
  - Prefix: `[CRITICAL ERROR]`
  - Format: `A4 overflow: <file> (...)` including measured scroll/client sizes.

### /preview Reader UI (navigation must stay visible)

- In `/preview`, the Reader’s top controls (mode toggle, prev/next, and topic buttons) must remain **visible while scrolling**.
- In `/preview`, the Reader must show an **accurate A4 print boundary frame** for every page at all times (in all modes), so layout decisions are made against real print bounds — including in topics like **"גרף עולה / יורד"**.

---

## 2) Navigation engine (textbook hierarchy)

### System files must never appear in the Preview TOC (required)

- System/deployment files (Redirects, 404, Rules) must never appear in the `/preview` TOC or topic buttons.

### Topic buttons must always lead to the first page (required)

- Clicking a topic button must always navigate to the **first page** in that topic sequence (topic-local page 1), not to a previously selected or cached page.

Each page MUST contain a `.preview-nav` with:

- `.nav-meta` formatted as: `{Topic} — עמוד {i} / {total}`
- `.page-number` must equal `{i}` (topic-local index, not global file number).
- Topic bar `.preview-nav-topics` must:
  - Use `.topic-link`
  - Mark the current topic link with `.is-active`
  - Include `aria-current="page"` on the active link.

Prev/Next links must match the repo’s global reading order as defined by topics and per-topic page indices.

---

## 2.1) Page numbering UI (design uniformity)

### Root A4 pages (`עמוד-N.html`)

- The page index UI is the circular badge `.page-number` in the header.
- Its **visual design must remain uniform across the entire project**.
- Do not override `.page-number` styling in page CSS (`styles/pages/עמוד-N.css`).
- Do not override `.header-container` in page CSS (`styles/pages/עמוד-N.css`) — keep header placement uniform.
- Prefer fixing layout issues by adjusting the content area, not by moving/hiding/re-styling the page number.

### Topic pages (`pages/**`)

- The topic page index UI is the circular badge `.page-badge`.
- Its **visual design must remain uniform across the entire project** (match the canonical A4 header badge look).
- The badge color must use `var(--title-blue)` (not per-topic accent colors).
- The number inside `.page-badge` MUST match the page index `X` from the path `pages/<topic>/עמוד-X/index.html`.
- The badge must be styled only in the canonical topic stylesheet `pages/<topic>/style.css`.
- Do not create or link per-page topic stylesheets like `pages/<topic>/עמוד-X/style.css`.

---

## 3) Automated testing loop

### One-command validation

- `npm test` must be green.

### Watch mode (required in development)

- Run: `npm run test:watch:page`
- This must re-run the relevant page test on every save of:
  - `עמוד-*.html`
  - `styles/pages/*.css`
  - `preview/*`

---

## 4) Failure recovery protocol

1. Read the terminal error from `npm test`.
2. Locate the matching rule section in this file.
3. Fix source HTML/CSS (do **not** modify tests to “make it pass”).
4. If preview live-reload drops, restart `npm run preview`.

---

## 5) Progress reporting (required)

When executing multi-step work (especially via Copilot/automation), **every step update** must include an explicit remaining-work percentage using this exact format:

- `נותרו X% לסיום.`

Rules:

- `X` is an integer `0`–`100`.
- `X` must decrease as progress is made.
- Use `0%` only when the task is fully complete.

Example step updates:

- `נותרו 70% לסיום.`
- `נותרו 25% לסיום.`
- `נותרו 0% לסיום.`

---

## 6) Golden Preview Standard (required)

- Preview background must be a **solid** neutral color; patterns/gradients/images are strictly forbidden outside the A4 boundary.
- Preview pages must be **top-aligned** in the reading area (no vertical centering that starts mid-page).
- In “all pages” mode, pages must appear as a **single vertical sequence** with stable spacing.

### Zero Tolerance — Non-centered preview pages

- The A4 preview must be **horizontally centered at all times** in `/preview` (all modes).
- Any drift/bias to the right (common under RTL) is a **critical regression**.
- The preview _layout container_ may be forced to `direction: ltr` to guarantee centering, but the `.a4-page` content must remain RTL.
- The `.a4-page` must never be allowed to shrink in flex layouts (`flex-shrink: 0`) and must keep a stable outer margin in the host.

---

## Preview Stability Contract (required)

- `/preview` must never show a blank main reading area when valid TOC entries exist.
- If a stored/selected file becomes invalid, the reader must clear the broken state and fall back to the first valid page.
- The reader must show a visible loading state while the preview page is being resolved.
- If primary rendering fails, the reader must display a fallback iframe for a valid page instead of leaving an empty gray area.
- A blank preview shell with a loaded sidebar is considered a critical regression.

Additional stability requirements:

- The reader must start at the **top of the selected page** (not mid-scroll).
- Book mode must not render an “empty slot” state.
