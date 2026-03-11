Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$pagesRoot = Join-Path $repoRoot 'pages'
$outRoot = Join-Path $repoRoot 'site'

$A4RootPageRe = '^עמוד-(\d+)\.html$'

$mathJaxLine = '<script defer src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js"></script>'

function Encode-UrlPath {
    param([Parameter(Mandatory = $true)][string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return $Path
    }

    $segments = $Path -split '[\\/]' | Where-Object { $_ -ne '' }
    $encodedSegments = @()
    foreach ($seg in $segments) {
        $encodedSegments += [System.Uri]::EscapeDataString($seg)
    }
    return ($encodedSegments -join '/')
}

if (Test-Path -LiteralPath $outRoot) {
    Remove-Item -LiteralPath $outRoot -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $outRoot | Out-Null

if (-not (Test-Path -LiteralPath $pagesRoot)) {
    throw "Missing pages/: $pagesRoot"
}

# 1) Copy root textbook pages (עמוד-*.html) into site/
$rootEntries = Get-ChildItem -LiteralPath $repoRoot -File | Where-Object { $_.Name -match $A4RootPageRe }
if (-not $rootEntries -or $rootEntries.Count -eq 0) {
    throw 'No root textbook pages found (expected עמוד-*.html in repo root).'
}
foreach ($f in $rootEntries) {
    Copy-Item -LiteralPath $f.FullName -Destination (Join-Path $outRoot $f.Name) -Force
}

# Copy root 404.html if present (GitHub Pages fallback)
$root404 = Join-Path $repoRoot '404.html'
if (Test-Path -LiteralPath $root404 -PathType Leaf) {
    Copy-Item -LiteralPath $root404 -Destination (Join-Path $outRoot '404.html') -Force
}

# Copy shared static directories so published pages render correctly.
foreach ($dirName in @('styles', 'assets')) {
    $src = Join-Path $repoRoot $dirName
    if (-not (Test-Path -LiteralPath $src -PathType Container)) { continue }
    $dest = Join-Path $outRoot $dirName
    Copy-Item -LiteralPath $src -Destination $dest -Recurse -Force
}

$indexFiles = Get-ChildItem -LiteralPath $pagesRoot -Recurse -File -Filter 'index.html'
foreach ($indexFile in $indexFiles) {
    $srcDir = Split-Path -Path $indexFile.FullName -Parent
    $relDir = [System.IO.Path]::GetRelativePath($pagesRoot, $srcDir)
    if ($relDir -eq '.') { $relDir = '' }

    $leaf = Split-Path -Path $srcDir -Leaf
    $parentRel = [System.IO.Path]::GetDirectoryName($relDir)
    if ($null -eq $parentRel) { $parentRel = '' }

    $destDir = if ([string]::IsNullOrWhiteSpace($parentRel)) { $outRoot } else { Join-Path $outRoot $parentRel }
    New-Item -ItemType Directory -Force -Path $destDir | Out-Null

    $destPath = Join-Path $destDir ($leaf + '.html')

    # If this page/topic ships a stylesheet, copy it next to the flattened output.
    $topicStyle = if ([string]::IsNullOrWhiteSpace($parentRel)) { $null } else { Join-Path (Join-Path $pagesRoot $parentRel) 'style.css' }
    $pageStyle = Join-Path $srcDir 'style.css'
    $styleToCopy = $null
    if ($topicStyle -and (Test-Path -LiteralPath $topicStyle -PathType Leaf)) {
        $styleToCopy = $topicStyle
    }
    elseif (Test-Path -LiteralPath $pageStyle -PathType Leaf) {
        $styleToCopy = $pageStyle
    }
    if ($styleToCopy) {
        Copy-Item -LiteralPath $styleToCopy -Destination (Join-Path $destDir 'style.css') -Force
    }

    $html = Get-Content -LiteralPath $indexFile.FullName -Raw -Encoding utf8

    # Pages live one directory deeper under pages/, but are flattened into site/<topic>/עמוד-X.html.
    # Rewrite a shared topic stylesheet href accordingly.
    $html = $html.Replace('href="../style.css"', 'href="style.css"')
    $html = $html.Replace("href='../style.css'", "href='style.css'")

    if ($html -notlike '*tex-chtml.js*') {
        $pos = $html.IndexOf('</head>', [System.StringComparison]::OrdinalIgnoreCase)
        if ($pos -lt 0) {
            throw "Missing </head> in: $($indexFile.FullName)"
        }
        $html = $html.Insert($pos, ($mathJaxLine + "`n"))
    }
    Set-Content -LiteralPath $destPath -Value $html -Encoding utf8
}

# GitHub Pages hardening
$noJekyllPath = Join-Path $outRoot '.nojekyll'
if (-not (Test-Path -LiteralPath $noJekyllPath -PathType Leaf)) {
    New-Item -ItemType File -Path $noJekyllPath -Force | Out-Null
}

$generatedHtml = Get-ChildItem -LiteralPath $outRoot -Recurse -File -Filter '*.html'
$rootPages = Get-ChildItem -LiteralPath $outRoot -File | Where-Object { $_.Name -match $A4RootPageRe } |
Sort-Object { [int]($_.Name -replace '^עמוד-(\d+)\.html$', '$1') }

$otherPages = $generatedHtml |
Where-Object { $_.Name -ne 'index.html' -and $_.Name -ne '404.html' } |
Where-Object { -not ($_.DirectoryName -eq $outRoot -and $_.Name -match $A4RootPageRe) } |
Sort-Object FullName

$linkFiles = @($rootPages) + @($otherPages)
if (-not $linkFiles -or $linkFiles.Count -eq 0) {
    throw 'site/ contains no generated .html pages to link to.'
}

$indexPath = Join-Path $outRoot 'index.html'

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
    $rel = [System.IO.Path]::GetRelativePath($outRoot, $f.FullName)
    $rel = $rel -replace '\\', '/'
    $href = Encode-UrlPath -Path $rel
    $text = [System.Net.WebUtility]::HtmlEncode($rel)
    [void]$lines.Add(('    <li><a href="{0}">{1}</a></li>' -f $href, $text))
}

[void]$lines.Add('  </ul>')
[void]$lines.Add('</body>')
[void]$lines.Add('</html>')

Set-Content -LiteralPath $indexPath -Value $lines.ToArray() -Encoding utf8