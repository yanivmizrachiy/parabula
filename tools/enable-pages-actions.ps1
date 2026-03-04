Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $repoRoot

function Fail([string]$message) {
    throw $message
}

function Run([string]$Exe, [string[]]$Arguments) {
    $out = & $Exe @Arguments 2>&1
    $code = $LASTEXITCODE
    return [pscustomobject]@{ Code = $code; Output = ($out | Out-String) }
}

function Get-RepoSlug {
    $r = Run 'git' @('remote', 'get-url', 'origin')
    if ($r.Code -ne 0) { Fail ('ERROR: git remote get-url origin failed.' + "`n" + $r.Output) }

    $origin = $r.Output.Trim()
    if ([string]::IsNullOrWhiteSpace($origin)) { Fail 'ERROR: origin remote URL is empty.' }

    $owner = ''
    $repo = ''

    if ($origin.StartsWith('https://github.com/')) {
        $rest = $origin.Substring('https://github.com/'.Length)
        if ($rest.EndsWith('.git')) { $rest = $rest.Substring(0, $rest.Length - 4) }
        $parts = $rest.Split('/')
        if ($parts.Length -ge 2) { $owner = $parts[0]; $repo = $parts[1] }
    }
    elseif ($origin.StartsWith('git@github.com:')) {
        $rest = $origin.Substring('git@github.com:'.Length)
        if ($rest.EndsWith('.git')) { $rest = $rest.Substring(0, $rest.Length - 4) }
        $parts = $rest.Split('/')
        if ($parts.Length -ge 2) { $owner = $parts[0]; $repo = $parts[1] }
    }

    if ([string]::IsNullOrWhiteSpace($owner) -or [string]::IsNullOrWhiteSpace($repo)) {
        Fail ('ERROR: Cannot parse owner/repo from origin: ' + $origin)
    }

    return [pscustomobject]@{ Owner = $owner; Repo = $repo }
}

function GhApiJson([string[]]$Arguments) {
    $r = Run 'gh' ($Arguments + @('--header', 'Accept: application/vnd.github+json'))
    return $r
}

# Preconditions
$gh = Run 'gh' @('--version')
if ($gh.Code -ne 0) { Fail 'ERROR: gh is not available.' }

$auth = Run 'gh' @('auth', 'status')
if ($auth.Code -ne 0) {
    Fail ('ERROR: gh is not authenticated.' + "`n" + $auth.Output)
}

$slug = Get-RepoSlug
$owner = $slug.Owner
$repo = $slug.Repo

$pagesUrl = 'https://' + $owner + '.github.io/' + $repo + '/'
Write-Host ('repo: ' + $owner + '/' + $repo)
Write-Host ('pages_url: ' + $pagesUrl)

# 1) Check current Pages status
$get = GhApiJson @('api', ('repos/' + $owner + '/' + $repo + '/pages'))
if ($get.Code -eq 0) {
    Write-Host 'Pages already enabled.' -ForegroundColor Green
}
else {
    # 2) Enable Pages with build_type=workflow (GitHub Actions)
    Write-Host 'Enabling GitHub Pages (build_type=workflow)...' -ForegroundColor Cyan
    $create = GhApiJson @('api', '-X', 'POST', ('repos/' + $owner + '/' + $repo + '/pages'), '-f', 'build_type=workflow')
    if ($create.Code -ne 0) {
        # Some repos require PUT if Pages site exists but is misconfigured
        Write-Host 'POST failed; trying PUT...' -ForegroundColor Yellow
        $update = GhApiJson @('api', '-X', 'PUT', ('repos/' + $owner + '/' + $repo + '/pages'), '-f', 'build_type=workflow')
        if ($update.Code -ne 0) {
            Fail ('ERROR: Could not enable Pages via API.' + "`n" + $create.Output + "`n" + $update.Output)
        }
    }
}

# 3) Re-check Pages endpoint
$get2 = GhApiJson @('api', ('repos/' + $owner + '/' + $repo + '/pages'))
if ($get2.Code -ne 0) {
    Fail ('ERROR: Pages API still failing after enable attempt.' + "`n" + $get2.Output)
}

Write-Host 'OK: Pages API is available.' -ForegroundColor Green

# 4) Trigger workflow deploy
Write-Host 'Triggering workflow dispatch for pages.yml...' -ForegroundColor Cyan
$runWf = Run 'gh' @('workflow', 'run', 'pages.yml', '--ref', 'main')
if ($runWf.Code -ne 0) {
    Write-Host 'WARNING: Failed to trigger workflow via gh. You can rerun it from Actions UI.' -ForegroundColor Yellow
    Write-Host $runWf.Output
}
else {
    Write-Host 'OK: workflow dispatch requested.' -ForegroundColor Green
}

Write-Host 'Next: wait 60-180 seconds, then reload the public URL.'
Write-Host $pagesUrl
