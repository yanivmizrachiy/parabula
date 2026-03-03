Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$pagesRoot = Join-Path $repoRoot 'pages'
$outRoot = Join-Path $repoRoot 'site'

$mathJaxLine = '<script defer src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js"></script>'

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