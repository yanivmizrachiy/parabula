$ErrorActionPreference="Stop"
Set-Location (Split-Path $MyInvocation.MyCommand.Path -Parent) | Out-Null
Set-Location ".." | Out-Null
powershell -ExecutionPolicy Bypass -File "tools\check.ps1" | Out-Null
powershell -ExecutionPolicy Bypass -File "tools\build-site.ps1" | Out-Null
$changes = git status --porcelain
if(-not $changes){ Write-Host "STOP: אין שינויים לפרסום." -ForegroundColor Yellow; exit 0 }
$rulesChanged = $changes | Select-String -SimpleMatch "rules.md"
if(-not $rulesChanged){ Write-Host "STOP: חייבים לעדכן rules.md לפני פרסום." -ForegroundColor Red; exit 1 }
git add -A
$ts = Get-Date -Format "yyyy-MM-dd HH:mm"
git commit -m ("publish: " + $ts) | Out-Null
git push | Out-Null
Write-Host "OK: published" -ForegroundColor Green
