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

function Encode-UrlPath([string]$path) {
    if ([string]::IsNullOrWhiteSpace($path)) {
        return $path
    }

    $segments = $path -split '[\\/]' | Where-Object { $_ -ne '' }
    $encodedSegments = @()
    foreach ($seg in $segments) {
        $encodedSegments += [System.Uri]::EscapeDataString($seg)
    }
    return ($encodedSegments -join '/')
}

function Write-IndexListing {
    param(
        [Parameter(Mandatory = $true)][string]$SiteRoot
    )

    $mathJaxLine = '<script defer src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js"></script>'

    $htmlFiles = Get-ChildItem -LiteralPath $SiteRoot -Recurse -File -Filter '*.html'
    if (-not $htmlFiles -or $htmlFiles.Count -eq 0) {
        Fail 'ERROR: site/ contains no .html files.'
    }

    $linkFiles = $htmlFiles | Where-Object { $_.Name -ne 'index.html' } | Sort-Object FullName
    if (-not $linkFiles -or $linkFiles.Count -eq 0) {
        Fail 'ERROR: site/ contains no additional .html files besides index.html.'
    }

    $indexPath = Join-Path $SiteRoot 'index.html'

    $lines = New-Object System.Collections.Generic.List[string]
    [void]$lines.Add('<!doctype html>')
    [void]$lines.Add('<html lang="en">')
    [void]$lines.Add('<head>')
    [void]$lines.Add('  <meta charset="utf-8">')
    [void]$lines.Add('  <meta name="viewport" content="width=device-width, initial-scale=1">')
    [void]$lines.Add(('  ' + $mathJaxLine))
    [void]$lines.Add('  <title>Parabula</title>')
    [void]$lines.Add('</head>')
    [void]$lines.Add('<body>')
    [void]$lines.Add('  <h1>Parabula</h1>')
    [void]$lines.Add('  <ul>')

    foreach ($f in $linkFiles) {
        $rel = [System.IO.Path]::GetRelativePath($SiteRoot, $f.FullName)
        $rel = $rel -replace '\\', '/'
        $href = Encode-UrlPath $rel
        $text = [System.Net.WebUtility]::HtmlEncode($rel)
        [void]$lines.Add(('    <li><a href="{0}">{1}</a></li>' -f $href, $text))
    }

    [void]$lines.Add('  </ul>')
    [void]$lines.Add('</body>')
    [void]$lines.Add('</html>')

    Set-Content -LiteralPath $indexPath -Value $lines.ToArray() -Encoding utf8
}

function Get-PagesUrl {
    $urlObj = Invoke-Git -Args @('remote', 'get-url', 'origin')
    if ($urlObj.Code -ne 0) {
        return 'UNKNOWN'
    }

    $u = $urlObj.Output.Trim()
    if ([string]::IsNullOrWhiteSpace($u)) {
        return 'UNKNOWN'
    }

    $owner = ''
    $repo = ''

    if ($u.StartsWith('https://github.com/')) {
        $rest = $u.Substring('https://github.com/'.Length)
        if ($rest.EndsWith('.git')) { $rest = $rest.Substring(0, $rest.Length - 4) }
        $parts = $rest.Split('/')
        if ($parts.Length -ge 2) {
            $owner = $parts[0]
            $repo = $parts[1]
        }
    }
    elseif ($u.StartsWith('git@github.com:')) {
        $rest = $u.Substring('git@github.com:'.Length)
        if ($rest.EndsWith('.git')) { $rest = $rest.Substring(0, $rest.Length - 4) }
        $parts = $rest.Split('/')
        if ($parts.Length -ge 2) {
            $owner = $parts[0]
            $repo = $parts[1]
        }
    }

    if ([string]::IsNullOrWhiteSpace($owner) -or [string]::IsNullOrWhiteSpace($repo)) {
        return 'UNKNOWN'
    }

    return ('https://' + $owner + '.github.io/' + $repo + '/')
}

function Write-Report {
    param(
        [Parameter(Mandatory = $true)][string]$Status,
        [Parameter(Mandatory = $true)][string]$BeforeSummary,
        [Parameter(Mandatory = $true)][string]$LastCommit,
        [Parameter(Mandatory = $true)][string]$PagesUrl,
        [Parameter(Mandatory = $true)][string]$IndexSummary,
        [Parameter(Mandatory = $true)][string[]]$ChangedFiles,
        [string]$FailureDetail
    )

    $reportPath = Join-Path $repoRoot 'REPORT.md'

    $lines = New-Object System.Collections.Generic.List[string]
    [void]$lines.Add('# Parabula - GitHub Pages Stabilization Report')
    [void]$lines.Add('')
    [void]$lines.Add('## Status')
    [void]$lines.Add(('Final: ' + $Status))
    [void]$lines.Add('')
    [void]$lines.Add('## Site State Before Run')
    [void]$lines.Add($BeforeSummary)
    [void]$lines.Add('')
    [void]$lines.Add('## Root Cause of the Original 404')
    [void]$lines.Add('- site/ was previously ignored by git (.gitignore), so GitHub Pages could not serve it.')
    [void]$lines.Add('- tools/build-site.ps1 deletes and regenerates site/, which can remove a manually-created entry point if it is not generated as part of the build.')
    [void]$lines.Add('- An earlier redirect-style index had an invalid URL embedding newlines, which can break navigation.')
    [void]$lines.Add('')
    [void]$lines.Add('## Files Changed or Created')
    foreach ($f in $ChangedFiles) {
        [void]$lines.Add(('- ' + $f))
    }
    [void]$lines.Add('')
    [void]$lines.Add('## site/index.html (Current)')
    [void]$lines.Add($IndexSummary)
    [void]$lines.Add('')
    [void]$lines.Add('## GitHub Pages Configuration')
    [void]$lines.Add('- No GitHub Actions workflow was found in-repo for Pages.')
    [void]$lines.Add('- This repo produces a static publish directory at site/. GitHub Pages is expected to be configured in the repository settings to publish from that directory.')
    [void]$lines.Add('')
    [void]$lines.Add('## Last Commit')
    [void]$lines.Add($LastCommit)
    [void]$lines.Add('')
    [void]$lines.Add('## Public URL')
    [void]$lines.Add($PagesUrl)

    if (-not [string]::IsNullOrWhiteSpace($FailureDetail)) {
        [void]$lines.Add('')
        [void]$lines.Add('## Failure Detail')
        [void]$lines.Add($FailureDetail)
    }

    Set-Content -LiteralPath $reportPath -Value $lines.ToArray() -Encoding utf8
}

$beforeSummary = ''
$changedList = @()
$pagesUrl = Get-PagesUrl
$lastCommit = ''
$indexSummary = ''

try {
    # Step 1 - validate current state
    $siteRoot = Join-Path $repoRoot 'site'
    if (-not (Test-Path -LiteralPath $siteRoot -PathType Container)) {
        Fail 'ERROR: Missing required folder: site/'
    }

    $ignored = Invoke-Git -Args @('check-ignore', '-q', '--', 'site')
    if ($ignored.Code -eq 0) {
        Fail 'ERROR: site/ is ignored by git.'
    }

    $indexPath = Join-Path $siteRoot 'index.html'
    if (-not (Test-Path -LiteralPath $indexPath -PathType Leaf)) {
        Fail 'ERROR: Missing required file: site/index.html'
    }

    $noJekyllPath = Join-Path $siteRoot '.nojekyll'
    if (-not (Test-Path -LiteralPath $noJekyllPath -PathType Leaf)) {
        Fail 'ERROR: Missing required file: site/.nojekyll'
    }

    $allHtml = Get-ChildItem -LiteralPath $siteRoot -Recurse -File -Filter '*.html'
    $otherHtml = $allHtml | Where-Object { $_.FullName -ne $indexPath }
    if (-not $otherHtml -or $otherHtml.Count -lt 1) {
        Fail 'ERROR: site/ must contain at least one additional HTML file besides index.html'
    }

    $trackedIndex = Invoke-Git -Args @('ls-files', '--error-unmatch', 'site/index.html')
    if ($trackedIndex.Code -ne 0) {
        Fail 'ERROR: site/index.html is not tracked by git.'
    }

    $trackedNoJekyll = Invoke-Git -Args @('ls-files', '--error-unmatch', 'site/.nojekyll')
    if ($trackedNoJekyll.Code -ne 0) {
        Fail 'ERROR: site/.nojekyll is not tracked by git.'
    }

    $beforeSummary = '- site/ exists, is not ignored, and contains HTML output.'

    # Step 2 - upgrade entry point if it is redirect-only
    $indexRaw = Get-Content -LiteralPath $indexPath -Raw -Encoding utf8
    $isRedirect = $indexRaw.Contains('http-equiv="refresh"') -and (-not $indexRaw.Contains('<ul>'))
    if ($isRedirect) {
        Write-IndexListing -SiteRoot $siteRoot
    }

    $indexSummary = '- A simple landing page titled "Parabula" with a relative link list to all site/**/*.html (excluding index.html).'

    # Step 3 - verify
    Write-Host 'Running verify-all.ps1...' -ForegroundColor Cyan
    pwsh -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot 'verify-all.ps1')

    $statusAfterVerify = & git status --porcelain
    if ($LASTEXITCODE -ne 0) {
        Fail 'ERROR: git status --porcelain failed.'
    }

    $unexpected = New-Object System.Collections.Generic.List[string]
    foreach ($line in $statusAfterVerify) {
        $p = $line
        if ($p.Length -ge 4) {
            $p = $p.Substring(3).Trim()
        }

        if ($p.StartsWith('site/')) { continue }
        if ($p -eq 'tools/build-site.ps1') { continue }
        if ($p -eq 'tools/stabilize-github-pages.ps1') { continue }
        if ($p -eq 'tools/fix-github-pages.ps1') { continue }
        if ($p -eq 'REPORT.md') { continue }

        [void]$unexpected.Add($line)
    }

    if ($unexpected.Count -gt 0) {
        $msg = 'ERROR: Unexpected changes after verify-all.ps1:'
        foreach ($u in $unexpected) {
            $msg += "`n" + $u
        }
        Fail $msg
    }

    # Step 4 - controlled publish
    $rulesPath = Join-Path $repoRoot 'rules.md'
    if (-not (Test-Path -LiteralPath $rulesPath -PathType Leaf)) {
        Fail 'ERROR: Missing required file: rules.md'
    }

    $stamp = (Get-Date -Format 'yyyy-MM-dd')
    $marker = ('stabilize github pages entry point ' + $stamp)
    $rulesRaw = Get-Content -LiteralPath $rulesPath -Raw -Encoding utf8
    if (-not $rulesRaw.ToLowerInvariant().Contains($marker)) {
        Add-Content -LiteralPath $rulesPath -Value ('' + "`n" + '- ' + $marker) -Encoding utf8
    }

    Write-Host 'Running tools/publish.ps1...' -ForegroundColor Cyan
    pwsh -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot 'tools\publish.ps1')

    $headObj = Invoke-Git -Args @('rev-parse', 'HEAD')
    if ($headObj.Code -ne 0) {
        Fail 'ERROR: git rev-parse HEAD failed.'
    }
    $lastCommit = $headObj.Output.Trim()

    # Step 5 - report
    $changedList = @(
        'tools/build-site.ps1 (generates site/index.html and site/.nojekyll)',
        'site/index.html (landing page, generated)',
        'site/.nojekyll (generated)',
        'rules.md (publish gate marker)',
        'REPORT.md (this report)'
    )

    Write-Report -Status 'OK' -BeforeSummary $beforeSummary -LastCommit $lastCommit -PagesUrl $pagesUrl -IndexSummary $indexSummary -ChangedFiles $changedList

    Write-Host 'OK: stabilization completed.' -ForegroundColor Green
}
catch {
    $err = $_.Exception.Message
    if ([string]::IsNullOrWhiteSpace($beforeSummary)) {
        $beforeSummary = '- UNKNOWN (failed before collecting state)'
    }

    if ([string]::IsNullOrWhiteSpace($lastCommit)) {
        $headObj2 = Invoke-Git -Args @('rev-parse', 'HEAD')
        if ($headObj2.Code -eq 0) {
            $lastCommit = $headObj2.Output.Trim()
        }
        else {
            $lastCommit = 'UNKNOWN'
        }
    }

    if ([string]::IsNullOrWhiteSpace($indexSummary)) {
        $indexSummary = '- UNKNOWN (failed before index validation)'
    }

    if (-not $changedList -or $changedList.Count -eq 0) {
        $changedList = @('UNKNOWN')
    }

    Write-Report -Status 'FAILED' -BeforeSummary $beforeSummary -LastCommit $lastCommit -PagesUrl $pagesUrl -IndexSummary $indexSummary -ChangedFiles $changedList -FailureDetail $err
    throw
}
