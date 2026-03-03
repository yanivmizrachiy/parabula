
\[\",\"\\]

\"]]}};</script>",
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$pagesRoot = Join-Path $repoRoot 'pages'
$outRoot = Join-Path $repoRoot 'site'

$mathJaxTag = '<script defer src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js"></script>'

function Ensure-Directory {
  param([Parameter(Mandatory=$true)][string]$Path)
  New-Item -ItemType Directory -Force -Path $Path | Out-Null
}

function Contains-MathJax {
  param([Parameter(Mandatory=$true)][string]$Html)
  return ($Html.IndexOf('mathjax@3/es5/tex-chtml.js', [System.StringComparison]::OrdinalIgnoreCase) -ge 0)
}

function Inject-MathJax {
  param(
    [Parameter(Mandatory=$true)][string]$Html,
    [Parameter(Mandatory=$true)][string]$Tag
  )

  if (Contains-MathJax -Html $Html) {
    return $Html
  }

  $headClose = $Html.IndexOf('</head>', [System.StringComparison]::OrdinalIgnoreCase)
  if ($headClose -ge 0) {
    return $Html.Insert($headClose, ($Tag + "`n"))
  }

  $headOpen = $Html.IndexOf('<head', [System.StringComparison]::OrdinalIgnoreCase)
  if ($headOpen -ge 0) {
    $gt = $Html.IndexOf('>', $headOpen)
    if ($gt -ge 0) {
      return $Html.Insert($gt + 1, ("`n" + $Tag + "`n"))
    }
  }

  return "<head>`n$Tag`n</head>`n" + $Html
}

if (Test-Path -LiteralPath $outRoot) {
  Remove-Item -LiteralPath $outRoot -Recurse -Force
}
Ensure-Directory -Path $outRoot

if (-not (Test-Path -LiteralPath $pagesRoot)) {
  throw "Missing pages root: $pagesRoot"
}

$indexFiles = Get-ChildItem -LiteralPath $pagesRoot -Recurse -File -Filter 'index.html'
foreach ($indexFile in $indexFiles) {
  $srcDir = Split-Path -Path $indexFile.FullName -Parent
  $relDir = [System.IO.Path]::GetRelativePath($pagesRoot, $srcDir)
  if ($relDir -eq '.') { $relDir = '' }

  $leafDirName = Split-Path -Path $srcDir -Leaf
  $parentRel = [System.IO.Path]::GetDirectoryName($relDir)
  if ($null -eq $parentRel) { $parentRel = '' }

  $destDir = if ([string]::IsNullOrWhiteSpace($parentRel)) { $outRoot } else { Join-Path $outRoot $parentRel }
  Ensure-Directory -Path $destDir

  $destFile = Join-Path $destDir ($leafDirName + '.html')

  $html = Get-Content -LiteralPath $indexFile.FullName -Raw -Encoding utf8
  $html = Inject-MathJax -Html $html -Tag $mathJaxTag
  Set-Content -LiteralPath $destFile -Value $html -Encoding utf8
}

Write-Host "OK: site generated"
