# Parabula — דוח פרויקט מלא (Deep Dive)

תאריך: 2026-03-09

## מה בנינו (במשפט)

Parabula הוא **ספר/חוברת דפי עבודה A4 בעברית (RTL)**, מבוסס HTML סטטי ו‑CSS, עם MathJax, שמוגש עם **Preview Reader** מקומי שמדפדף/גולל בין העמודים, ומגובה בסט כללים וטסטים שמונעים “שבירה” של החוזה (A4, ניווט, אין Inline CSS, וכד’).

## מה יש בריפו בפועל (תכולה ותוצרים)

### 1) דפי A4 “הספר” (מקור)

הדפים המרכזיים חיים בשורש הריפו כקבצים:

- `עמוד-N.html` (HTML לכל עמוד)
- `styles/pages/עמוד-N.css` (CSS ייעודי לכל עמוד)

סטטיסטיקה (נמדד מתוך `.nav-meta` בכל עמוד):

- **32 דפי A4** בשורש
- **4 נושאים**:
  - **חוקיות** — 4 עמודים (1–4)
  - **פונקציה ריבועית** — 4 עמודים (1–4)
  - **משוואה ריבועית חסרה** — 2 עמודים (1–2)
  - **משפט פיתגורס** — 22 עמודים (1–22)

> לכל עמוד יש “מספר עמוד” לפי נושא (לא לפי מספר הקובץ), והטסטים אוכפים התאמה מלאה בין `<title>`, `.nav-meta`, ו‑`.page-number`.

### 2) דפים “טופיקליים” (pages/ → site/)

בנוסף לספר ה‑A4, קיימת מערכת עמודים נפרדת תחת `pages/` שמיועדת להשטחה לתיקיית `site/` עבור GitHub Pages. דוגמה קיימת:

- `pages/גרף-עולה-יורד-קבוע/עמוד-1/index.html` (וכן `עמוד-2`, `עמוד-3`)
- `pages/גרף-עולה-יורד-קבוע/style.css` (סטייל משותף לנושא)

הבנייה ל‑`site/` נעשית ע"י `tools/build-site.ps1`:

- מחפש כל `pages/**/index.html`
- משטח לפורמט `site/<topic>/עמוד-X.html` (שם הקובץ נקבע לפי שם תיקיית העמוד)
- מעתיק `style.css` “ליד” הפלט (topic-level או page-level לפי מה שקיים)
- מוסיף `.nojekyll` ומייצר `site/index.html` עם רשימת קישורים לכל העמודים שנבנו

### 3) Assets וגרפיקה (בעיקר פיתגורס)

`assets/pythagoras/` מכיל חומרים גרפיים ותוצרי וקטוריזציה, למשל:

- `assets/pythagoras/vector/` — עמודים שלמים כ‑SVG (לפי `page-XX.svg`)
- `assets/pythagoras/figures-vector/` — תרשימים/חלקים (SVG נקיים)

המטרה: להגיע לגרפיקה חדה ואחידה שמסתדרת עם עיצוב ה‑CSS והפונטים בפרויקט.

## “חוזה” הפרויקט (Single Source of Truth)

מסמך החוקים המרכזי: `PROJECT_RULES.md` (וגם `rules.html`/`rules.md`). החוזה כולל:

- **A4 Contract**: `main.a4-page.page-N` יחיד, גודל A4 קשיח (210×297mm), בלי “תיקוני overflow”.
- **הפרדה מוחלטת HTML/CSS**: אין `<style>` ואין `style="..."` בתוך הדפים.
- **RTL-first**: מסמך `dir="rtl"`, ול‑LTR נקודתי משתמשים ב‑CSS בלבד.
- **MathJax**: delimiters חוקיים הם `\( ... \)` ו‑`$$ ... $$`.
- **SVG**: `vector-effect: non-scaling-stroke` לשמירת עובי קו.
- **מערכת צירים**: קונטיינר 440×440, גריד 22px (20 יחידות לציר).

## מנוע Preview (החלק הכי חשוב לעבוד יום‑יום)

### שרת Preview (Node)

קובץ: `preview/server.mjs`

יכולות:

- שרת סטטי “בטוח” מעל שורש הריפו עם `safeResolve()` שמונע יציאה מה־root.
- חסימה מפורשת של `rules.html` (מחזיר 404) כדי לא לחשוף מסמכי חוק פנימיים.
- **Live reload** באמצעות SSE:
  - `GET /events` — הלקוח נרשם, והשרת משדר `reload` על כל שינוי בקבצי `html/css/js/mjs/svg`.
- **תוכן עניינים (TOC)**:
  - `GET /api/toc` — בונה מפת נושאים לפי `.nav-meta` והסדר “מרומז” לפי `.preview-nav-topics`.
  - כולל גם עמודים שנבנו ב‑`site/**.html` (חוץ מ‑`site/index.html`).
- **Guardrail ל‑A4 overflow**:
  - `POST /api/layout-guard` — כשעמוד “חורג” מבחינת גובה, השרת מדפיס לטמינל שורה עם prefix: `[CRITICAL ERROR]`.

ברירת מחדל (כפי שממומש בקוד):

- `HOST=127.0.0.1`
- `PORT=5179`

### Reader UI

קובץ: `preview/index.html`

מה הוא נותן:

- מצב **כל הדפים** (גלילה רציפה של iframes)
- מצב **דפדוף** (book: ימין/שמאל)
- TOC צדדי ורשימת קבצים
- **פס כפתורי נושאים תמיד מוצג** (זו דרישה שמוגנת ע"י טסטים)
- דיאגנוסטיקה (preview-only) לזיהוי overflow, חסרים בסיסיים, ואלמנטים לא “על גריד” ב‑`.coordinate-system`

כתובת:

- `http://127.0.0.1:5179/preview`

## איכות: טסטים, בדיקות ואוטומציה

### טסטים (node --test)

תיקייה: `tests/`

דוגמאות למה שנבדק:

- `tests/a4-pages.rules.test.mjs`
  - אין Inline CSS בכל `*.html` בשורש
  - לכל `עמוד-N.html`: מבנה A4 תקין, לינקים ל‑`styles/a4-base.css` ול‑`styles/pages/עמוד-N.css`
  - קיום `.preview-nav` + `.preview-nav-topics` + לפחות 2 `.topic-link`
  - עקביות בין `.nav-meta`, `<title>`, ו‑`.page-number`
  - התאמת prev/next לסדר קריאה גלובלי שמחושב מהנושאים
  - Guardrails ספציפיים לפיתגורס (למשל מספר תרגילים בעמודים מסוימים ו‑inline SVG)

- `tests/preview.rules.test.mjs`
  - ב‑Reader יש `topicButtons` והפונקציות שמתחזקות את פס הנושאים
  - `styles/preview.css` לא מסתיר רכיבים קריטיים (למשל sidebar)
  - `rules.html` מזכיר במפורש את דרישת כפתורי הנושאים ב‑`/preview`
  - `preview/server.mjs` לא מגיש `rules.html`

### Preview check (Headless)

סקריפט: `scripts/preview-check.mjs` (רץ כחלק מ‑`npm run verify`)

- מרים שרת Preview על פורט אקראי
- פותח כל עמוד עם Puppeteer
- בודק: קיום A4/header/title/number, overflow X/Y, אלמנטים מחוץ לתחום, ואיסור על תמונות רסטר (png/jpg/webp/gif)

### Visual regression

סקריפט: `scripts/visual-regression.mjs`

- רץ עם Playwright
- מצלם URLs מ‑`visual-urls.txt`
- משווה מול `visual-baseline/` וכותב תוצרים ל‑`visual-out/`

## יצירת/תחזוקת תוכן (כלים ייעודיים)

- `scripts/new-page.mjs` — יוצר עמוד A4 חדש לפי topic, מעדכן ניווט/total, ובודק guardrails ב‑headless.
- `scripts/regenerate-preview-nav-topics.mjs` — בונה בלוק `.preview-nav-topics` קנוני לכל העמודים לפי “רמזי סדר” קיימים.
- `scripts/audit-html-integrity.mjs` — בודק תקינות מבנית בסיסית של HTML (למשל תוכן אחרי `</html>`).

פיתגורס (OCR/Vectorize):

- `scripts/ocr-pythagoras.mjs` — OCR לפלט טקסט (Tesseract heb+eng).
- `scripts/vectorize-pythagoras-pages.mjs` — וקטוריזציה מ‑PNG ל‑SVG עם שכבת טקסט (Imagetracer + Tesseract TSV).
- `scripts/fix-pythagoras-triangle-labels.mjs` — תיקון מיקומי labels במשולשים בתוך SVG על בסיס גיאומטריה.
- `scripts/audit-pythagoras-uniformity.mjs` — בודק אחידות בין עמודי פיתגורס מרכזיים.

## איך מריצים (ה‑Workflow הקצר)

### Preview

- `npm run preview`
- לפתוח: `http://127.0.0.1:5179/preview`

חלופה (PowerShell, מומלץ למשתמשי Windows):

- `./preview.ps1` — מריץ את השרת ופותח אוטומטית את ה‑Reader אחרי health-check
- `./preview.ps1 -Lan` — מריץ על `HOST=0.0.0.0` ומדפיס לינק לשיתוף באותה רשת
- `./preview.ps1 -File "עמוד-3.html"` — פותח ישירות עמוד ספציפי דרך ה‑Reader

### בדיקות

- `npm test`
- `npm run verify` (טסטים + preview headless check)
- `npm run verify:super` (meta + visual)

בדיקת פריסה/פרסום כוללת:

- `./verify-all.ps1` — בונה `site/`, מוודא שכל `site/**/*.html` מכיל MathJax (`tex-chtml.js`), ומוודא ש‑`HEAD` שווה ל‑`origin/main` לפני “ריצה נקייה”.

### בניית site/ ל‑GitHub Pages

- להריץ: `pwsh tools/build-site.ps1`
- התוצר: `site/` (כולל `site/index.html` ו‑`.nojekyll`)

פרסום (גייט):

- `pwsh tools/publish.ps1` — לא מאפשר לפרסם אם `rules.md` לא השתנה (מנגנון “Publish Gate”).

### Vite (Dev)

קיים גם Vite server (`npm run dev`) על `http://localhost:5173` לפי `vite.config.js`. זה שימושי בעיקר לפיתוח סביבתי, אבל ה־Preview הרשמי לדפי A4 הוא השרת ב‑`preview/server.mjs`.

## נקודות לשים לב אליהן

- `meta/pages.json` קיים אבל כרגע הוא מערך ריק (`[]`); TOC ל־Reader נבנה מתוך HTML קיים (`.nav-meta` + topic hints) ולא ממטא.

---

# Appendix — GitHub Pages Stabilization Report

## Status

Final: SUCCESS

## Site State Before Run

- site/ exists, is not ignored, and contains HTML output.

## Root Cause of the Original 404

- site/ was previously ignored by git (.gitignore), so GitHub Pages could not serve it.
- tools/build-site.ps1 deletes and regenerates site/, which can remove a manually-created entry point if it is not generated as part of the build.
- An earlier redirect-style index had an invalid URL embedding newlines, which can break navigation.

## What Fixed the 404

- GitHub Pages was enabled for this repository with build type `workflow` (GitHub Actions).
- The GitHub Actions workflow `.github/workflows/pages.yml` completed successfully and deployed the `site/` artifact.
- The public URL now serves `site/index.html` (no longer 404).

## Files Changed or Created

- tools/build-site.ps1 (generates site/index.html and site/.nojekyll)
- site/index.html (landing page, generated)
- site/.nojekyll (generated)
- rules.md (publish gate marker)
- REPORT.md (this report)

## site/index.html (Current)

- A simple landing page titled "Parabula" with a relative link list to all site/\*_/_.html (excluding index.html).

## GitHub Pages Configuration

- GitHub Actions workflow is used for Pages deployment: .github/workflows/pages.yml
- The workflow publishes the static output from site/.

Verified state:

- Pages is enabled and configured for GitHub Actions deployments.

Verification evidence:

- Workflow run: https://github.com/yanivmizrachiy/parabula/actions/runs/22683729213 (conclusion: success)

## Last Commit

3af2009a1c216a60a7f66c46aa42691d5ad47dde

## Public URL

https://yanivmizrachiy.github.io/parabula/
