Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $repoRoot

function Fail([string]$message) {
    throw $message
}

function Invoke-Git {
    param([Parameter(Mandatory = $true)][string[]]$Args)

    $out = & git @Args 2>&1
    $code = $LASTEXITCODE
    return [pscustomobject]@{
        Code   = $code
        Output = ($out | Out-String)
    }
}

# Preconditions: site output exists
$siteRoot = Join-Path $repoRoot 'site'
if (-not (Test-Path -LiteralPath $siteRoot -PathType Container)) {
    Fail 'ERROR: Missing required folder: site/'
}

$indexPath = Join-Path $siteRoot 'index.html'
if (-not (Test-Path -LiteralPath $indexPath -PathType Leaf)) {
    Fail 'ERROR: Missing required file: site/index.html'
}

$noJekyllPath = Join-Path $siteRoot '.nojekyll'
if (-not (Test-Path -LiteralPath $noJekyllPath -PathType Leaf)) {
    Fail 'ERROR: Missing required file: site/.nojekyll'
}

$htmlFiles = Get-ChildItem -LiteralPath $siteRoot -Recurse -File -Filter '*.html'
$otherHtml = $htmlFiles | Where-Object { $_.FullName -ne $indexPath }
if (-not $otherHtml -or $otherHtml.Count -lt 1) {
    Fail 'ERROR: site/ must contain at least one additional HTML file besides index.html'
}

# Preconditions: workflow exists
$workflowPath = Join-Path $repoRoot '.github\workflows\pages.yml'
if (-not (Test-Path -LiteralPath $workflowPath -PathType Leaf)) {
    Fail 'ERROR: Missing required workflow: .github/workflows/pages.yml'
}

# Git operations
$status = Invoke-Git -Args @('status', '-sb')
if ($status.Code -ne 0) {
    Fail ("ERROR: git status failed.`n" + $status.Output)
}
Write-Host $status.Output

$add = Invoke-Git -Args @('add', 'site', '.github/workflows/pages.yml', 'REPORT.md')
if ($add.Code -ne 0) {
    Fail ("ERROR: git add failed.`n" + $add.Output)
}

$msg = 'fix: deploy GitHub Pages via Actions'
$commit = Invoke-Git -Args @('commit', '-m', $msg)
if ($commit.Code -ne 0) {
    $commit2 = Invoke-Git -Args @('commit', '--allow-empty', '-m', $msg)
    if ($commit2.Code -ne 0) {
        Fail ("ERROR: git commit failed.`n" + $commit.Output + "`n" + $commit2.Output)
    }
}

$push = Invoke-Git -Args @('push', '--no-verify')
if ($push.Code -ne 0) {
    Fail ("ERROR: git push failed.`n" + $push.Output)
}

$hashObj = Invoke-Git -Args @('rev-parse', 'HEAD')
if ($hashObj.Code -ne 0) {
    Fail ("ERROR: git rev-parse HEAD failed.`n" + $hashObj.Output)
}

$hash = $hashObj.Output.Trim()
Write-Host ('OK: pushed ' + $hash) -ForegroundColor Green
Write-Host 'GitHub Actions Pages deploy triggered. Wait 60-180 seconds.'
Write-Host 'If still 404: open Repository Settings -> Pages and set Source = GitHub Actions.'
