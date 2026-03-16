param(
	[string]$File = '',
	[ValidateSet('all', 'book')]
	[string]$Mode = 'all',
	[int]$Port = 5500,
	[switch]$Lan,
	[string]$LanIp = ''
)

$ErrorActionPreference = 'Stop'

function Get-PrimaryLanIPv4 {
	try {
		$ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
			Where-Object {
				$_.IPAddress -and
				$_.IPAddress -notlike '127.*' -and
				$_.IPAddress -notlike '169.254.*'
			} |
			Select-Object -ExpandProperty IPAddress

		if ($ips -and $ips.Count -gt 0) { return $ips[0] }
	}
	catch {
		# ignore
	}
	return ''
}

$localBase = "http://127.0.0.1:$Port"
$lanBase = ''
if ($Lan) {
	$ip = $LanIp
	if (-not $ip) { $ip = Get-PrimaryLanIPv4 }
	if ($ip) {
		$lanBase = "http://${ip}:$Port"
	}
}

function Get-PreviewUrl {
	param([string]$Base, [string]$Mode, [string]$File)

	$url = "$Base/preview?mode=$Mode"
	if ($File) {
		$url = "$url&file=$([Uri]::EscapeDataString($File))"
	}
	return $url
}

$targetUrl = Get-PreviewUrl -Base $localBase -Mode $Mode -File $File

Write-Host "Starting preview reader on $localBase" -ForegroundColor Cyan
Write-Host "Opening: $targetUrl" -ForegroundColor DarkGray
if ($Lan) {
	if ($lanBase) {
		$lanUrl = Get-PreviewUrl -Base $lanBase -Mode $Mode -File $File
		Write-Host "LAN link (shareable on your Wi-Fi): $lanUrl" -ForegroundColor Cyan
	}
	else {
		Write-Host "LAN link: could not detect LAN IP. Pass -LanIp <ip>" -ForegroundColor Yellow
	}
}
Write-Host "Press Ctrl+C to stop." -ForegroundColor DarkGray
Write-Host "" 

# Open the browser only after the server responds (avoids ERR_CONNECTION_REFUSED).
$openJob = Start-Job -ArgumentList $localBase, $targetUrl -ScriptBlock {
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
	if ($Lan) {
		$env:HOST = '0.0.0.0'
	}
	else {
		$env:HOST = '127.0.0.1'
	}
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
