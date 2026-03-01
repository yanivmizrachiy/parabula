$ErrorActionPreference = 'Stop'

param(
	[string]$File = '',
	[ValidateSet('all', 'book')]
	[string]$Mode = 'all',
	[int]$Port = 5179
)

$base = "http://127.0.0.1:$Port"

function Get-PreviewUrl {
	param([string]$Base, [string]$Mode, [string]$File)

	$url = "$Base/preview?mode=$Mode"
	if ($File) {
		$url = "$url&file=$([Uri]::EscapeDataString($File))"
	}
	return $url
}

$targetUrl = Get-PreviewUrl -Base $base -Mode $Mode -File $File

Write-Host "Starting preview reader on $base" -ForegroundColor Cyan
Write-Host "Opening: $targetUrl" -ForegroundColor DarkGray
Write-Host "Press Ctrl+C to stop." -ForegroundColor DarkGray
Write-Host "" 

# Open the browser only after the server responds (avoids ERR_CONNECTION_REFUSED).
$openJob = Start-Job -ArgumentList $base, $targetUrl -ScriptBlock {
	param($baseInner, $targetInner)
	$health = "$baseInner/api/toc"
	$deadline = (Get-Date).AddSeconds(12)
	while ((Get-Date) -lt $deadline) {
		try {
			$resp = Invoke-WebRequest -Uri $health -Method Get -TimeoutSec 2
			if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 400) {
				Start-Process $targetInner | Out-Null
				return
			}
		}
		catch {
			Start-Sleep -Milliseconds 200
		}
	}
}

try {
	$env:PORT = "$Port"
	node preview/server.mjs
}
finally {
	# Cleanup the background opener job.
	try {
		Stop-Job -Job $openJob -ErrorAction SilentlyContinue | Out-Null
		Remove-Job -Job $openJob -Force -ErrorAction SilentlyContinue | Out-Null
	}
 catch {
		# ignore
	}
}
