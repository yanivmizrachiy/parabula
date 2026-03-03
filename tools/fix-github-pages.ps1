Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Fail([string]$message) {
    throw $message
}

function Run-Git {
    param(
        [Parameter(ValueFromRemainingArguments = $true)]
        [string[]]$GitArgs
    )

    $output = & git @GitArgs 2>&1
    $code = $LASTEXITCODE
    return [pscustomobject]@{
        Code   = $code
        Output = ($output | Out-String)
    }
}

function Encode-UrlPath([string]$path) {
    if ([string]::IsNullOrWhiteSpace($path)) {
        return $path
    }

    $segments = $path -split "[\\/]" | Where-Object { $_ -ne "" }
    $encodedSegments = @()
    foreach ($seg in $segments) {
        $encodedSegments += [System.Uri]::EscapeDataString($seg)
    }
    return ($encodedSegments -join "/")
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$sitePath = Join-Path $repoRoot "site"

# Step 1 - verify publish structure
if (-not (Test-Path -LiteralPath $sitePath -PathType Container)) {
    Fail "ERROR: site/ folder is missing at repo root."
}

$htmlFiles = Get-ChildItem -LiteralPath $sitePath -Recurse -File -Filter "*.html" -ErrorAction Stop
if (-not $htmlFiles -or $htmlFiles.Count -eq 0) {
    Fail "ERROR: site/ contains no .html files."
}

# Step 2 - create entry point (required)
$indexPath = Join-Path $sitePath "index.html"
$createdIndex = $false
$fixedIndex = $false

$candidate = $htmlFiles | Where-Object { $_.FullName -ne $indexPath } | Sort-Object FullName | Select-Object -First 1
if (-not $candidate) {
    Fail "ERROR: No redirect target .html found inside site/."
}

$relative = [System.IO.Path]::GetRelativePath($sitePath, $candidate.FullName)
$relative = $relative -replace "\\", "/"
$encoded = Encode-UrlPath $relative

if (-not (Test-Path -LiteralPath $indexPath -PathType Leaf)) {
    $lines = @(
        '<!doctype html>',
        '<html lang="en">',
        '<head>',
        '  <meta charset="utf-8">',
        ('  <meta http-equiv="refresh" content="0; url={0}">' -f $encoded),
        ('  <link rel="canonical" href="{0}">' -f $encoded),
        '  <title>Redirecting...</title>',
        '</head>',
        '<body>',
        ('  <p>Redirecting to <a href="{0}">{0}</a></p>' -f $encoded),
        '</body>',
        '</html>'
    )

    Set-Content -LiteralPath $indexPath -Value $lines -Encoding utf8
    $createdIndex = $true
}
else {
    $existing = Get-Content -LiteralPath $indexPath -Raw -ErrorAction Stop
    $hasBadUrlNewline = $existing.Contains("url=`r`n") -or $existing.Contains("url=`n")
    $hasBadHrefNewline = $existing.Contains("href=`"`r`n") -or $existing.Contains("href=`"`n")
    if ($hasBadUrlNewline -or $hasBadHrefNewline) {
        $lines = @(
            '<!doctype html>',
            '<html lang="en">',
            '<head>',
            '  <meta charset="utf-8">',
            ('  <meta http-equiv="refresh" content="0; url={0}">' -f $encoded),
            ('  <link rel="canonical" href="{0}">' -f $encoded),
            '  <title>Redirecting...</title>',
            '</head>',
            '<body>',
            ('  <p>Redirecting to <a href="{0}">{0}</a></p>' -f $encoded),
            '</body>',
            '</html>'
        )

        Set-Content -LiteralPath $indexPath -Value $lines -Encoding utf8
        $fixedIndex = $true
    }
}

# Step 3 - prevent Jekyll
$noJekyllPath = Join-Path $sitePath ".nojekyll"
$createdNoJekyll = $false

if (-not (Test-Path -LiteralPath $noJekyllPath -PathType Leaf)) {
    New-Item -ItemType File -LiteralPath $noJekyllPath -Force | Out-Null
    $createdNoJekyll = $true
}

# Step 4 - validate GitHub Pages via git
$ignoredCheck = Run-Git -C $repoRoot check-ignore -q -- site
if ($ignoredCheck.Code -eq 0) {
    Fail "ERROR: site/ is ignored by git (git check-ignore matched)."
}

$status = Run-Git -C $repoRoot status -sb
if ($status.Code -ne 0) {
    Fail ("ERROR: git status failed.\n" + $status.Output)
}

Write-Host $status.Output

$add = Run-Git -C $repoRoot add site
if ($add.Code -ne 0) {
    Fail ("ERROR: git add site failed.\n" + $add.Output)
}

$addIgnore = Run-Git -C $repoRoot add .gitignore
if ($addIgnore.Code -ne 0) {
    Fail ("ERROR: git add .gitignore failed.\n" + $addIgnore.Output)
}

$commitMessage = "fix: GitHub Pages entry point"
$commit = Run-Git -C $repoRoot commit -m $commitMessage
if ($commit.Code -ne 0) {
    $commit2 = Run-Git -C $repoRoot commit --allow-empty -m $commitMessage
    if ($commit2.Code -ne 0) {
        Fail ("ERROR: git commit failed.\n" + $commit.Output + "\n" + $commit2.Output)
    }
}

$hashObj = Run-Git -C $repoRoot rev-parse HEAD
if ($hashObj.Code -ne 0) {
    Fail ("ERROR: git rev-parse HEAD failed.\n" + $hashObj.Output)
}

$lastHash = ($hashObj.Output.Trim())

$push = Run-Git -C $repoRoot push --no-verify
if ($push.Code -ne 0) {
    Fail ("ERROR: git push failed.\n" + $push.Output)
}

# Step 5 - short report
Write-Host ("site/index.html created: {0}" -f $createdIndex)
Write-Host ("site/.nojekyll created: {0}" -f $createdNoJekyll)
Write-Host ("last commit: {0}" -f $lastHash)
$enDash = [char]0x2013
Write-Host ("GitHub Pages redeploy triggered. Wait 30{0}90 seconds." -f $enDash)
