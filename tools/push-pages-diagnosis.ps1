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

function Require-Path([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) {
        Fail ('ERROR: Missing required path: ' + $Path)
    }
}

function Update-ReportLastCommit([string]$ReportPath, [string]$Hash) {
    $lines = Get-Content -LiteralPath $ReportPath -Encoding utf8
    $out = New-Object System.Collections.Generic.List[string]

    $seenHeader = $false
    $replaced = $false

    foreach ($line in $lines) {
        if (-not $seenHeader) {
            [void]$out.Add($line)
            if ($line.Trim() -eq '## Last Commit') {
                $seenHeader = $true
            }
            continue
        }

        if (-not $replaced) {
            if ([string]::IsNullOrWhiteSpace($line)) {
                [void]$out.Add($line)
                continue
            }

            if ($line.Trim().StartsWith('## ')) {
                [void]$out.Add($line)
                $seenHeader = $false
                continue
            }

            [void]$out.Add($Hash)
            $replaced = $true
            continue
        }

        [void]$out.Add($line)
    }

    if (-not $replaced) {
        Fail 'ERROR: Could not update REPORT.md Last Commit section.'
    }

    Set-Content -LiteralPath $ReportPath -Value $out.ToArray() -Encoding utf8
}

Require-Path (Join-Path $repoRoot 'REPORT.md')
Require-Path (Join-Path $repoRoot 'tools\check-github-pages.ps1')
Require-Path (Join-Path $repoRoot 'tools\deploy-pages-actions.ps1')

# Commit 1: add docs/scripts
$add1 = Invoke-Git -Args @('add', 'REPORT.md', 'tools/check-github-pages.ps1', 'tools/deploy-pages-actions.ps1')
if ($add1.Code -ne 0) { Fail ("ERROR: git add failed.`n" + $add1.Output) }

$c1 = Invoke-Git -Args @('commit', '-m', 'docs: diagnose GitHub Pages 404')
if ($c1.Code -ne 0) {
    $c1b = Invoke-Git -Args @('commit', '--allow-empty', '-m', 'docs: diagnose GitHub Pages 404')
    if ($c1b.Code -ne 0) { Fail ("ERROR: git commit failed.`n" + $c1.Output + "`n" + $c1b.Output) }
}

$p1 = Invoke-Git -Args @('push', '--no-verify')
if ($p1.Code -ne 0) { Fail ("ERROR: git push failed.`n" + $p1.Output) }

# Commit 2: update report hash to the actual latest HEAD
$hashObj = Invoke-Git -Args @('rev-parse', 'HEAD')
if ($hashObj.Code -ne 0) { Fail ("ERROR: git rev-parse HEAD failed.`n" + $hashObj.Output) }
$hash = $hashObj.Output.Trim()

Update-ReportLastCommit -ReportPath (Join-Path $repoRoot 'REPORT.md') -Hash $hash

$add2 = Invoke-Git -Args @('add', 'REPORT.md')
if ($add2.Code -ne 0) { Fail ("ERROR: git add REPORT.md failed.`n" + $add2.Output) }

$c2 = Invoke-Git -Args @('commit', '-m', 'docs: update report last commit')
if ($c2.Code -ne 0) {
    $c2b = Invoke-Git -Args @('commit', '--allow-empty', '-m', 'docs: update report last commit')
    if ($c2b.Code -ne 0) { Fail ("ERROR: git commit failed.`n" + $c2.Output + "`n" + $c2b.Output) }
}

$p2 = Invoke-Git -Args @('push', '--no-verify')
if ($p2.Code -ne 0) { Fail ("ERROR: git push failed.`n" + $p2.Output) }

Write-Host ('OK: pushed. last commit: ' + $hash) -ForegroundColor Green
Write-Host 'Next required step: GitHub -> Settings -> Pages -> Source = GitHub Actions.'
