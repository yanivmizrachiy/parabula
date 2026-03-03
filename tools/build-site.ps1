Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$pagesRoot = Join-Path $repoRoot 'pages'
$outRoot = Join-Path $repoRoot 'site'

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

    $html = Get-Content -LiteralPath $indexFile.FullName -Raw -Encoding utf8
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
$linkFiles = $generatedHtml | Where-Object { $_.Name -ne 'index.html' } | Sort-Object FullName
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