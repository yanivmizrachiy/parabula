# PROJECT_RULES — Parabula (Single Source of Truth)

This repository is a **self-validating, RTL-first A4 digital textbook**. This document is the **ground truth** for future edits and code generation.

---

## 0) Ground Truth (non-negotiable)

### A4 page contract

- Every textbook page lives in repo root as `עמוד-N.html`.
- Every page MUST contain exactly one main wrapper: `main.a4-page.page-N`.
- `.a4-page` is **exactly** `210mm × 297mm`.
- DO NOT use `overflow: auto` anywhere to “fix” height.

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
- URL: http://localhost:3000
- Reader UI: `/preview` (same as `/`)

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
