# parabula — דפי עבודה A4

## תצוגה מקדימה (מומלץ)

הדרך הכי יציבה לראות CSS/MathJax היא דרך שרת מקומי.

1. הרצה:
   - PowerShell: `./preview.ps1`
   - לשיתוף באותה רשת (טלפון/מחשב אחר על אותו Wi‑Fi): `./preview.ps1 -Lan`
   - או: `npm run preview`

2. פתיחה בדפדפן:
   - Reader (דפדוף): http://127.0.0.1:5179/preview
   - פתיחה על קובץ מסוים: http://127.0.0.1:5179/preview?file=%D7%A2%D7%9E%D7%95%D7%93-3.html

> הערה: במצב `-Lan` הסקריפט ידפיס קישור כמו `http://<IP>:5179/preview`.
> אם ה־Windows Firewall חוסם, צריך לאפשר כניסות ל־פורט 5179.

## הדפסה

בכל עמוד: Print → לבחור A4 → ללא margins (ה-CSS כבר מגדיר `@page margin: 0`).

## כללים

הסטנדרט והכללים נמצאים כאן:
- rules.html
- styles/a4-base.css
- styles/pages/עמוד-*.css
