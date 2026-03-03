Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $repoRoot

function Fail([string]$message) {
    throw $message
}

function Get-RepoSlug {
    $origin = (& git remote get-url origin 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($origin)) {
        Fail 'ERROR: Unable to read git remote origin URL.'
    }

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

function Invoke-GitHubApi([string]$url) {
    $headers = @{ 'User-Agent' = 'parabula-pages-check' }
    try {
        $data = Invoke-RestMethod -Uri $url -Headers $headers -Method Get
        return [pscustomobject]@{ Ok = $true; Status = 200; Url = $url; Data = $data }
    }
    catch {
        $resp = $_.Exception.Response
        if ($null -ne $resp) {
            $code = [int]$resp.StatusCode
            return [pscustomobject]@{ Ok = $false; Status = $code; Url = $url; Data = $null }
        }
        return [pscustomobject]@{ Ok = $false; Status = -1; Url = $url; Data = $null }
    }
}

$slug = Get-RepoSlug
$owner = $slug.Owner
$repo = $slug.Repo

$repoApi = 'https://api.github.com/repos/' + $owner + '/' + $repo
$pagesApi = $repoApi + '/pages'
$pagesUrl = 'https://' + $owner + '.github.io/' + $repo + '/'

$repoInfo = Invoke-GitHubApi $repoApi
if (-not $repoInfo.Ok) {
    Fail ('ERROR: GitHub repo API failed: ' + $repoInfo.Url + ' status=' + $repoInfo.Status)
}

$repoData = $repoInfo.Data

Write-Host ('repo: ' + $repoData.full_name)
Write-Host ('private: ' + $repoData.private)
Write-Host ('has_pages: ' + $repoData.has_pages)
Write-Host ('pages_url: ' + $pagesUrl)

$pagesInfo = Invoke-GitHubApi $pagesApi
if (-not $pagesInfo.Ok) {
    Write-Host ('pages_api_status: ' + $pagesInfo.Status)
}
else {
    Write-Host ('pages_api_status: 200')
    $pagesData = $pagesInfo.Data
    if ($pagesData.html_url) { Write-Host ('pages_html_url: ' + $pagesData.html_url) }
    if ($pagesData.status) { Write-Host ('pages_status: ' + $pagesData.status) }
    if ($pagesData.build_type) { Write-Host ('pages_build_type: ' + $pagesData.build_type) }
}

Write-Host ''
if (-not $repoData.has_pages) {
    Write-Host 'RESULT: Pages is NOT enabled for this repo.' -ForegroundColor Yellow
    Write-Host 'Fix:'
    Write-Host '  1) GitHub -> Repo -> Settings -> Pages'
    Write-Host '  2) Build and deployment -> Source = GitHub Actions'
    Write-Host '  3) Wait for the "Deploy GitHub Pages" workflow to finish'
    Write-Host '  4) Refresh the public URL'
    exit 2
}

Write-Host 'RESULT: Pages is enabled. If you still see 404, check the Actions run and the Pages settings Source.' -ForegroundColor Green
