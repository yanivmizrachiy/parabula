$ErrorActionPreference="Stop"

# Forbidden legacy refs
$bad = Select-String -Path "pages\**\index.html" -Pattern "worksheet-a4\.css" -ErrorAction SilentlyContinue
if($bad){ throw "Found forbidden worksheet-a4.css reference" }

# Basic head/body sanity
$heads = Select-String -Path "pages\**\index.html" -Pattern "<head>" -ErrorAction SilentlyContinue
$headEnds = Select-String -Path "pages\**\index.html" -Pattern "</head>" -ErrorAction SilentlyContinue
$bodies = Select-String -Path "pages\**\index.html" -Pattern "<body>" -ErrorAction SilentlyContinue
if(($heads.Count -ne $headEnds.Count) -or ($heads.Count -ne $bodies.Count)){
  throw "Head/Body tag count mismatch in pages"
}

"OK: checks passed"
