Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path $PSScriptRoot).Path
Set-Location -LiteralPath $repoRoot

function Require-Path {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Label
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Missing required path: $Label ($Path)"
    }
}

Require-Path -Path (Join-Path $repoRoot 'tools\build-site.ps1') -Label 'tools/build-site.ps1'
Require-Path -Path (Join-Path $repoRoot 'tools\publish.ps1') -Label 'tools/publish.ps1'
Require-Path -Path (Join-Path $repoRoot 'pages') -Label 'pages/'
Require-Path -Path (Join-Path $repoRoot 'rules.md') -Label 'rules.md'
Require-Path -Path (Join-Path $repoRoot '.git') -Label '.git'

Write-Host 'Running build-site...' -ForegroundColor Cyan
pwsh -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot 'tools\build-site.ps1')

$siteRoot = Join-Path $repoRoot 'site'
if (-not (Test-Path -LiteralPath $siteRoot)) {
    throw 'site/ was not created.'
}

$htmlFiles = Get-ChildItem -LiteralPath $siteRoot -Recurse -File -Filter '*.html'
if (-not $htmlFiles -or $htmlFiles.Count -eq 0) {
    throw 'No site/**/*.html files found.'
}

$missing = New-Object System.Collections.Generic.List[string]
foreach ($f in $htmlFiles) {
    $has = Select-String -LiteralPath $f.FullName -SimpleMatch -Quiet 'tex-chtml.js'
    if (-not $has) {
        [void]$missing.Add($f.FullName)
    }
}

if ($missing.Count -gt 0) {
    Write-Host ('Missing tex-chtml.js in ' + $missing.Count + ' file(s):') -ForegroundColor Red
    foreach ($p in $missing) { Write-Host $p }
    exit 1
}

Write-Host ('OK: tex-chtml.js present in ' + $htmlFiles.Count + ' file(s)') -ForegroundColor Green

Write-Host 'Fetching origin...' -ForegroundColor Cyan
git fetch origin

$head = (git rev-parse HEAD).Trim()
$originMain = (git rev-parse origin/main).Trim()
if ($head -ne $originMain) {
    Write-Host 'STOP: HEAD differs from origin/main.' -ForegroundColor Yellow
    Write-Host ('HEAD:        ' + $head)
    Write-Host ('origin/main:  ' + $originMain)
    exit 1
}

Write-Host 'OK: HEAD matches origin/main' -ForegroundColor Green

Write-Host ''
Write-Host 'git status -sb:' -ForegroundColor Cyan
git status -sb

Write-Host ''
Write-Host 'Last 3 local commits:' -ForegroundColor Cyan
git log -3 --oneline

Write-Host ''
Write-Host 'Last 3 origin/main commits:' -ForegroundColor Cyan
git log -3 origin/main --oneline

Write-Host ''
Write-Host '=== ALL CHECKS PASSED ===' -ForegroundColor Green
