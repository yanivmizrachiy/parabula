Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Fail([string]$Message) {
    Write-Error $Message
    exit 1
}

function Require-Command([string]$Name) {
    $cmd = Get-Command -Name $Name -ErrorAction SilentlyContinue
    if (-not $cmd) {
        Fail ("Required command not found: {0}" -f $Name)
    }
}

function Invoke-Git([string[]]$Args) {
    $output = & git @Args 2>&1
    $code = $LASTEXITCODE
    if ($code -ne 0) {
        Write-Host $output
        Fail ("git failed (exit {0}): git {1}" -f $code, ($Args -join ' '))
    }
    return $output
}

$repoRoot = (Get-Location).Path
$siteDir = Join-Path $repoRoot 'site'

Require-Command 'git'

# Step 1 - validate publish structure
if (-not (Test-Path -LiteralPath $siteDir -PathType Container)) {
    Fail "Missing required folder: site/"
}

$siteHtmlFiles = Get-ChildItem -LiteralPath $siteDir -Recurse -File | Where-Object {
    $_.Extension -eq '.html'
}

if (-not $siteHtmlFiles -or $siteHtmlFiles.Count -eq 0) {
    Fail "site/ contains no .html files"
}

# Step 2 - create entry point
$indexPath = Join-Path $siteDir 'index.html'
$createdIndex = $false

if (-not (Test-Path -LiteralPath $indexPath -PathType Leaf)) {
    $candidates = $siteHtmlFiles | Where-Object { $_.Name -ne 'index.html' } | Sort-Object FullName
    $first = $candidates | Select-Object -First 1
    if (-not $first) {
        Fail "site/ contains no redirect target (only index.html found)"
    }

    $targetRelative = $first.FullName.Substring($siteDir.Length + 1)
    $targetRelative = $targetRelative.Replace('\\', '/').Replace('\', '/')

    $lines = @(
        '<!doctype html>',
        '<html lang="en">',
        '<head>',
        '  <meta charset="utf-8">',
        '  <meta http-equiv="refresh" content="0; url=' + $targetRelative + '">',
        '  <meta name="viewport" content="width=device-width, initial-scale=1">',
        '  <title>Redirect</title>',
        '</head>',
        '<body>',
        '  <p>Redirecting...</p>',
        '  <p><a href="' + $targetRelative + '">Continue</a></p>',
        '</body>',
        '</html>'
    )

    Set-Content -LiteralPath $indexPath -Value $lines -Encoding utf8
    $createdIndex = $true
}

# Step 3 - prevent Jekyll
$noJekyllPath = Join-Path $siteDir '.nojekyll'
$createdNoJekyll = $false

if (-not (Test-Path -LiteralPath $noJekyllPath -PathType Leaf)) {
    New-Item -Path $noJekyllPath -ItemType File -Force | Out-Null
    $createdNoJekyll = $true
}

# Step 4 - validate GitHub Pages publish folder is tracked
Invoke-Git @('rev-parse', '--is-inside-work-tree') | Out-Null

$ignored = & git check-ignore -q site
if ($LASTEXITCODE -eq 0) {
    Fail "site/ is ignored by git. Remove ignore rule and retry."
}

Invoke-Git @('status', '-sb') | Out-Null

# Step 5 - commit and push
Invoke-Git @('add', 'site') | Out-Null

# Stage .gitignore if it changed (common root-cause for Pages 404)
$changedIgnore = & git status --porcelain .gitignore 2>$null
if ($changedIgnore) {
    Invoke-Git @('add', '.gitignore') | Out-Null
}

$hasStaged = & git diff --cached --name-only
if (-not $hasStaged) {
    Fail 'No staged changes. Nothing to commit.'
}

Invoke-Git @('commit', '-m', 'fix: GitHub Pages entry point') | Out-Null
Invoke-Git @('push', '--no-verify') | Out-Null

$head = (Invoke-Git @('rev-parse', 'HEAD')).Trim()

Write-Host ('site/index.html created: {0}' -f ($createdIndex))
Write-Host ('site/.nojekyll created: {0}' -f ($createdNoJekyll))
Write-Host ('last commit: {0}' -f $head)
Write-Host 'GitHub Pages redeploy triggered. Wait 30-90 seconds.'
