Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $repoRoot

$changes = git status --porcelain
if (-not $changes -or $changes.Count -eq 0) {
	Write-Host 'STOP: no changes to publish.' -ForegroundColor Yellow
	exit 0
}

$rulesChanged = $false
foreach ($line in $changes) {
	if ($line -like '*rules.md*') {
		$rulesChanged = $true
		break
	}
}

if (-not $rulesChanged) {
	Write-Host 'STOP: rules.md must be updated before publishing.' -ForegroundColor Red
	exit 1
}

git add -A

$ts = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$msg = "publish: $ts"
git commit -m $msg
git push

Write-Host 'OK: published' -ForegroundColor Green
