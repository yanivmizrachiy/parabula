# Parabula / StudioMath — קונטקסט מלא ל‑Gemini (למידה עמוקה)

> מטרת המסמך: לספק ל‑Gemini תמונת־מצב מלאה ומדויקת של הפרויקט כדי שיוכל לייצר/לתקן דפי עבודה ברמת “StudioMath” *תוך עמידה קשיחה בכללי הריפו והטסטים*.

## 1) מה זה הפרויקט (במשפט)
פרויקט סטטי של דפי עבודה להדפסה A4 בעברית (RTL) עם MathJax, בעיצוב אחיד (“StudioMath”), שבו כל עמוד הוא קובץ HTML עצמאי עם CSS בסיס משותף + CSS ייעודי לעמוד.

## 2) עקרונות על (לא מתפשרים)
1. **הפרדה מוחלטת בין HTML ל‑CSS**
   - אסור `<style>` בתוך HTML.
   - אסור `style="..."` על תגיות.
   - HTML = מבנה/טקסט/MathJax/מחלקות.
   - CSS = פריסה/עיצוב בלבד.
2. **A4 קבוע**
   - אסור לשנות את מידות `.a4-page` (210mm × 297mm) ואת ה‑padding שלו בלי הוראה מפורשת.
3. **מערכת עיצוב קיימת בלבד**
   - משתמשים ב‑CSS variables והקומפוננטות שכבר קיימות.
   - לא מוסיפים צבעים/פונטים/טוקנים חדשים.
4. **מספור ותצוגה מקדימה חייבים להיות עקביים**
   - כל עמוד חייב לכלול `.preview-nav` + `.preview-nav-topics`.
   - ב‑`/preview` חייבים תמיד להופיע כפתורי נושאים (topic buttons) בכל מצב.
5. **תוכן**
   - אין “שאלה 1/2/3…” בתוך הטקסט. שאלות מתחילות בבולט.
   - סעיפי משנה לא מסומנים א/ב/ג כאשר יש בולט; אם צריך מספור פנימי משתמשים בבולט/רכיב קיים (למשל עיגול מספר קטן).

## 3) טכנולוגיות
- **HTML סטטי** (קבצי עמוד-*.html בשורש הריפו)
- **CSS**
  - בסיס: [styles/a4-base.css](styles/a4-base.css)
  - עמודים: [styles/pages](styles/pages) (קבצי עמוד-*.css)
  - נושאים: [styles/topics](styles/topics)
- **MathJax v3**
  - Inline Math חייב להיות בפורמט: `\( ... \)`
- **Preview Server (Node.js)**
  - [preview/server.mjs](preview/server.mjs) משרת HTML/CSS/SVG ומאפשר Reader ב‑`/preview`
- **בדיקות (Node test runner)**
  - `npm test` מריץ `node --test`

## 4) פקודות עבודה (Dev Workflow)
- Preview מקומי (מומלץ):
  - `npm run preview` או `./preview.ps1`
  - Reader:
    - `http://127.0.0.1:5179/preview`
    - פתיחה על קובץ מסוים: `http://127.0.0.1:5179/preview?file=...`
- בדיקות:
  - `npm test`

## 5) מבנה תיקיות (מה חשוב לדעת)
- דפים:
  - עמוד-1.html … עמוד-30.html (בשורש)
- CSS:
  - [styles/a4-base.css](styles/a4-base.css) — מערכת עיצוב בסיסית (טוקנים, קומפוננטות, A4, print)
  - [styles/pages](styles/pages) — Overrides נקודתיים לעמודים (קבצי עמוד-N.css)
  - [styles/topics](styles/topics) — כללי פריסה לנושא (למשל פיתגורס)
  - [styles/preview.css](styles/preview.css) — UI של Reader
- Preview:
  - [preview/index.html](preview/index.html) — Reader UI
  - [preview/server.mjs](preview/server.mjs) — שרת
- Assets (פיתגורס):
  - [assets/pythagoras/vector](assets/pythagoras/vector) — עמודים וקטוריים מלאים (page-XX.svg)
  - [assets/pythagoras/figures-vector](assets/pythagoras/figures-vector) — דיאגרמות/חלקי עמוד

## 6) תבנית חובה לכל עמוד A4
### 6.1 מבנה בסיס
כל עמוד חייב להכיל `main` עם `.a4-page` ו‑`page-N` (N הוא המספר הגלובלי של הקובץ), וכותרת עם `.page-title` ומספר עמוד בתוך `.page-number`.

דוגמת skeleton (תואם סטנדרט, לא דוגמה אסתטית מלאה):
```html
<!doctype html>
<html lang="he" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>עמוד 1 — שם נושא</title>

    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Rubik:wght@400;500&display=swap" rel="stylesheet" />

    <script>
      MathJax = { tex: { inlineMath: [["\\(", "\\)"]] } };
    </script>
    <script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>

    <!-- CSS links: BASE_CSS + PAGE_CSS (see project files list below) -->
    <link rel="stylesheet" href="BASE_CSS" />
    <link rel="stylesheet" href="PAGE_CSS" />
  </head>
  <body>
    <nav class="preview-nav" aria-label="ניווט בין עמודים">
      <div class="preview-nav-top">
        <div class="nav-side"><a class="nav-link" href="עמוד-(N-1).html">הקודם</a></div>
        <div class="nav-meta">שם נושא — עמוד X / Y</div>
        <div class="nav-side"><a class="nav-link" href="עמוד-(N+1).html">הבא</a></div>
      </div>
      <div class="preview-nav-topics" aria-label="מעבר בין נושאים">
        <a class="topic-link" href="עמוד-?.html">נושא 1</a>
        <a class="topic-link is-active" href="עמוד-N.html" aria-current="page">שם נושא</a>
      </div>
    </nav>

    <main class="a4-page page-N">
      <header class="header-container">
        <h1 class="page-title">שם נושא</h1>
        <div class="page-number">X</div>
      </header>

      <div class="question-block">
        <div class="q-main">
          <div class="bullet-container"><div class="bullet-large"></div></div>
          <div class="q-text">טקסט שאלה…</div>
        </div>
      </div>
    </main>
  </body>
</html>
```

בפרויקט הזה ה‑BASE_CSS הוא [styles/a4-base.css](styles/a4-base.css) וה‑PAGE_CSS הוא קובץ בתוך [styles/pages](styles/pages) שמתאים למספר הקובץ (למשל עמוד-9 -> קובץ CSS של עמוד-9).

### 6.2 מספור נושאים (קריטי)
- המספר בקובץ (למשל עמוד-9.html) **לא** חייב להיות המספר שמופיע בעיגול `.page-number`.
- `.page-number` וה‑`nav-meta` מציגים **מספור לפי נושא** (מתאפס בתחילת נושא).
- `<title>` חייב לכלול גם את שם הנושא וגם `עמוד X` (X הוא מספור לפי נושא).

## 7) Reader ב‑/preview (קריטי לטסטים)
- [preview/index.html](preview/index.html) מציג Reader עם:
  - מצב ברירת מחדל: **"כל הדפים"** (גלילה רציפה)
  - מצב "דפדוף"
  - **כפתורי נושאים תמיד מוצגים** (גם בכל הדפים וגם בדפדוף)
- הטסטים מגנים על זה; לא לשבור את UI/DOM IDs.

## 8) מערכת העיצוב (CSS tokens + קומפוננטות)
הבסיס נמצא ב‑[styles/a4-base.css](styles/a4-base.css).
- Variables ב‑`:root` (דוגמאות):
  - `--text-main`, `--accent-dark`, `--title-blue`, `--grid-line`, `--bg-paper`…
- רכיבי בסיס נפוצים:
  - `.a4-page` — פריסת A4
  - `.header-container`, `.page-title`, `.page-number`
  - `.question-block`, `.q-main`, `.q-sub`
  - `.bullet-large`, `.bullet-small`, `.bullet-container`
  - `.answer-box` (+ גדלים `box-sm`, `box-md`)
  - `.visual-container` — אזור לתרשימים

כל CSS ייעודי לעמוד צריך להיות *מינימלי* ולכבד את הטוקנים.

## 9) RTL/LTR
- המסמך כולו: `dir="rtl"`.
- אלמנטים מתמטיים/מספרים/זוגות סדורים/פתרונות לפעמים צריכים `direction: ltr` + `unicode-bidi: isolate` (כמו שכבר קיים בפרויקט).

## 10) SVG וגרפיקה (איך לשמור על איכות כמו שאר הפרויקט)
### 10.1 כלל פרקטי
- אם SVG שנוצר מ‑OCR/Vectorization מכיל רעשים/טיפוגרפיה לא אחידה — עדיף **לבנות SVG נקי (אינליין)** עם stroke/text “אמיתיים”, כדי לקבל חדות וטיפוגרפיה כמו שאר הדפים.

### 10.2 קווים וטיפוגרפיה בתוך SVG
- להשתמש ב‑`stroke: currentColor` כדי להישען על צבעי הפרויקט.
- להשתמש ב‑`vector-effect: non-scaling-stroke` כדי לשמור עובי קו יציב.
- טקסט בתוך SVG:
  - להוריש font מהדף (`font-family: inherit`) או להגדיר מפורשות Rubik.
  - לשים לב ל‑`unicode-bidi` כשהטקסט לועזי/מספרי.

## 11) פיתגורס — מה מיוחד אצלנו
- נושא “משפט פיתגורס” משתרע על מספר קבצים רציפים.
- יש שני סוגי assets:
  - [assets/pythagoras/vector](assets/pythagoras/vector) — כשמציגים “עמוד מקור” שלם.
  - [assets/pythagoras/figures-vector](assets/pythagoras/figures-vector) — כשחותכים/מציגים תרשימים.
- **עמוד 1 של פיתגורס** (בריפו: [עמוד-9.html](%D7%A2%D7%9E%D7%95%D7%93-9.html)) עבר שדרוג לגרפיקה אינליין נקייה, כדי שהפונטים והחדות יהיו כמו שאר הפרויקט.

## 12) מה הטסטים בודקים (ואסור לשבור)
הטסטים ב‑[tests](tests) בודקים בין היתר:
- אין Inline CSS (`<style>`/`style=""`).
- לכל עמוד-*.html יש:
  - `<main class="a4-page page-N">`
  - קישורי CSS בסיס + CSS ייעודי (ראה [styles/a4-base.css](styles/a4-base.css) ו‑[styles/pages](styles/pages))
  - `.preview-nav` ו‑`.preview-nav-topics`
  - עקביות בין `<title>`, `.nav-meta`, `.page-number`
- קישורי `הקודם/הבא` תואמים סדר קריאה גלובלי.
- Reader `/preview` חייב לכלול כפתורי נושאים תמיד.

## 13) “הנחיות עבודה” ל‑Gemini (כמו System Prompt)
כשאתה מתבקש לשנות/ליצור עמודים בפרויקט הזה, פעל כך:
1. קרא את [rules.html](rules.html) ואת [styles/a4-base.css](styles/a4-base.css) לפני שינוי.
2. אל תוסיף CSS בתוך HTML. כל שינוי עיצובי -> קובץ מתאים בתוך [styles/pages](styles/pages).
3. אל תשנה טוקנים/צבעים/פונטים בבסיס.
4. שמור על מבנה A4, header, bullets, answer-box.
5. שמור על `.preview-nav` + `.preview-nav-topics` בכל עמוד.
6. שמור על מספור לפי נושא ב‑`nav-meta` ו‑`.page-number` + `<title>`.
7. לאחר כל שינוי, הרץ `npm test` ותקן רגרסיות.
8. בגרפיקה: העדף SVG נקי/אינליין אם יש בעיית איכות.

---

אם תרצה, אפשר להוסיף למסמך הזה גם “Checklist קצר” לפני קומיט, או טמפלט מלא ליצירת עמוד חדש + CSS חדש (בהתאם לכללי הפרויקט).
