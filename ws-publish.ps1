# ws-publish.ps1 - StudioMath: Parabula Edition
$timestamp = Get-Date -Format "dd/MM/yyyy HH:mm"
Write-Host "--- מתחיל סנכרון פרויקט Parabula לענן ---" -ForegroundColor Cyan

# 1. מעבר לתיקייה הנכונה
cd "C:\Users\yaniv\OneDrive\Desktop\parabula"

# 2. הכנת ה-Commit
git add .
git commit -m "StudioMath Update: $timestamp" --allow-empty

# 3. דחיפה ל-GitHub
Write-Host "דוחף שינויים ל-GitHub..." -ForegroundColor Yellow
git push origin main

Write-Host "--- הסנכרון הושלם! $timestamp ---" -ForegroundColor Green
