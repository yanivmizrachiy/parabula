Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $repoRoot

function Invoke-Git {
    param([Parameter(Mandatory = $true)][string[]]$Args)
    & git @Args
    if ($LASTEXITCODE -ne 0) {
        throw ("git failed: " + ($Args -join ' '))
    }
}

$changes = & git status --porcelain
if ($LASTEXITCODE -ne 0) { throw 'git failed: status --porcelain' }

$aheadCountRaw = & git rev-list --count origin/main..HEAD
if ($LASTEXITCODE -ne 0) { throw 'git failed: rev-list --count origin/main..HEAD' }
$aheadCount = 0
[void][int]::TryParse(($aheadCountRaw | Out-String).Trim(), [ref]$aheadCount)

if (-not $changes -or $changes.Count -eq 0) {
    if ($aheadCount -gt 0) {
        Write-Host ('Pushing existing commits (ahead by ' + $aheadCount + ')...') -ForegroundColor Cyan
        Invoke-Git -Args @('push', '--no-verify')
        Write-Host 'OK: published' -ForegroundColor Green
        exit 0
    }

    Write-Host 'STOP: no changes to publish.' -ForegroundColor Yellow
    exit 0
}

$rulesChanged = $false
foreach ($line in $changes) {
    if ($line -like '*rules.md*') {
        $rulesChanged = $true
        break
    }
}

if (-not $rulesChanged) {
    Write-Host 'STOP: rules.md must be updated before publishing.' -ForegroundColor Red
    exit 1
}

Invoke-Git -Args @('add', '-A')

$ts = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$msg = "publish: $ts"
Invoke-Git -Args @('commit', '-m', $msg)
Invoke-Git -Args @('push', '--no-verify')

Write-Host 'OK: published' -ForegroundColor Green
