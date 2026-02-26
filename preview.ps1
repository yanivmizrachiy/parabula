$ErrorActionPreference = 'Stop'


$port = 5179
$base = "http://127.0.0.1:$port"

Write-Host "Starting preview reader on $base" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop." -ForegroundColor DarkGray
Write-Host "" 
Write-Host "Pages:" -ForegroundColor Cyan
Write-Host "- $base/preview"
Write-Host "- $base/preview?file=%D7%A2%D7%9E%D7%95%D7%93-3.html"
Write-Host "" 

try {
	Start-Process "$base/preview?file=%D7%A2%D7%9E%D7%95%D7%93-3.html" | Out-Null
} catch {
	# Ignore if Start-Process fails; the links above are still usable.
}

$env:PORT = "$port"
node preview/server.mjs
