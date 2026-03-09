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
- **Pythagoras — page 3** (`עמוד-3.html`) MUST be composed to **span the entire A4 page** and utilize the available height according to the design rules of this repo.

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

### Geometry / coordinate systems

- Coordinate system container size: **440px × 440px**.
- Grid increment: **22px** (20 units per axis).
- Labels use `.axis-label` with **absolute positioning** relative to `.coordinate-system`.

---

## 1) Live Preview (permanent)

### The canonical preview server

- Run: `npm run preview`
- URL: http://127.0.0.1:5179
- Reader UI: `/preview` (same as `/`)

Notes:

- Default host/port are controlled by env vars `HOST` and `PORT` (see `preview/server.mjs`).
- Windows helper: `./preview.ps1` (can also run with `-Lan` to bind `0.0.0.0`).

### Live reload + correctness signals

- The preview must reload on changes to:
  - `styles/a4-base.css`
  - `styles/pages/*.css`
  - `עמוד-*.html`
- The preview must **detect A4 overflow** for `.a4-page` and report a terminal line:
  - Prefix: `[CRITICAL ERROR]`
  - Include file name and measured heights.

### /preview Reader UI (navigation must stay visible)

- In `/preview`, the Reader’s top controls (mode toggle, prev/next, and topic buttons) must remain **visible while scrolling**.
- In `/preview`, the Reader must show an **accurate A4 print boundary frame** for every page at all times (in all modes), so layout decisions are made against real print bounds — including in topics like **"גרף עולה / יורד"**.

---

## 2) Navigation engine (textbook hierarchy)

Each page MUST contain a `.preview-nav` with:

- `.nav-meta` formatted as: `{Topic} — עמוד {i} / {total}`
- `.page-number` must equal `{i}` (topic-local index, not global file number).
- Topic bar `.preview-nav-topics` must:
  - Use `.topic-link`
  - Mark the current topic link with `.is-active`
  - Include `aria-current="page"` on the active link.

Prev/Next links must match the repo’s global reading order as defined by topics and per-topic page indices.

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
