# rules.md — כללים קצרים + צ׳קליסט פרסום (ללא כפילויות)

מטרה: לשמור “שער כניסה” קצר וברור, בלי להעתיק או לשכתב את ה-SSOT.

מקורות אמת (SSOT):

- `PROJECT_RULES.md` — החוזה המלא והמחייב.
- `rules.html` — גרסה קריאה לבני אדם (הטסטים מגנים עליה).

---

## חובה לפני כל שינוי

1. להריץ Preview דרך השרת (לא לפתוח קבצי HTML ישירות):

- `npm run preview` או `./preview.ps1`
- לפתוח: `http://127.0.0.1:5179/preview`

2. לוודא עמידה בחוזה הבסיסי:

- אין `<style>` ואין `style="..."` בשום HTML.
- לכל `עמוד-N.html` יש בדיוק `main.a4-page.page-N`.
- `.nav-meta` בפורמט: `{נושא} — עמוד {i} / {total}` ו-`.page-number` = `{i}`.
- ב-`/preview` כפתורי נושאים/ניווט חייבים להישאר זמינים (גם בגלילה וגם בדפדוף).

3. להריץ בדיקות:

- `npm test`
- אופציונלי לפני פרסום: `npm run verify`

---

## פרסום (GitHub Pages)

- GitHub Pages נפרס מ-`site/`.
- ה-CI בונה `site/` מחדש לפני דיפלוי (דרך `tools/build-site.ps1`).

צ׳קליסט פרסום:

- `pwsh tools/build-site.ps1`
- `npm test`
- `git status -sb` נקי
