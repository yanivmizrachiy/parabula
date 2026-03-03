param([string]$RepoRoot=(Get-Location).Path,[string]$PagesRoot="pages",[string]$OutRoot="site")
function EnsureDir($p){ New-Item -ItemType Directory -Force -Path $p | Out-Null }
$topicDirs = Get-ChildItem (Join-Path $RepoRoot $PagesRoot) -Directory -ErrorAction SilentlyContinue
if(-not $topicDirs){ throw "No topics found under pages/" }
EnsureDir (Join-Path $RepoRoot $OutRoot)
EnsureDir (Join-Path $RepoRoot "$OutRoot\assets")
$indexCards=@()
foreach($topic in $topicDirs){
  $topicName=$topic.Name; $topicOut=Join-Path $RepoRoot "$OutRoot\$topicName"; EnsureDir $topicOut
  $pages=Get-ChildItem $topic.FullName -Directory | Where-Object { $_.Name -match "^עמוד-\d+$" } | Sort-Object { [int]($_.Name -replace "עמוד-","") }
  if(-not $pages){ continue }
  $i=0; foreach($p in $pages){ $i++; $n=$pages.Count
    $prev=if($i -gt 1){"page-$($i-1).html"}else{""}; $next=if($i -lt $n){"page-$($i+1).html"}else{""}
    $src=Join-Path $p.FullName "index.html"; if(-not (Test-Path $src)){ continue }
    $body=Get-Content $src -Raw; $out=Join-Path $topicOut "page-$i.html"
    $html=@(
      "<!doctype html>","<html lang=""he"" dir=""rtl"">","<head>","<meta charset=""utf-8"" />","<meta name=""viewport"" content=""width=device-width,initial-scale=1"" />",
      "<title>$topicName — עמוד $i</title>","<link rel=""stylesheet"" href=""../assets/book.css"" />",
      "<script>window.MathJax={tex:{inlineMath:[[\"\\(\",\"\\)\"]],displayMath:[[\"\

\[\",\"\\]

\"]]}};</script>",
      "<script defer src=""https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js""></script>","</head>","<body>",
      "<div class=""shell""><div class=""a4""><div class=""pagepad"">",$body,"</div><div class=""pagenum"">עמוד $i מתוך $n</div></div></div>",
      "<script src=""../assets/book.js""></script>","</body>","</html>"
    ) -join "`n"
    Set-Content $out $html -Encoding UTF8
  }
  $indexCards += "<li><a href=""$topicName/page-1.html"">$topicName</a></li>"
}
$toc = @("<!doctype html>","<html lang=""he"" dir=""rtl"">","<head>","<meta charset=""utf-8"" />","<meta name=""viewport"" content=""width=device-width,initial-scale=1"" />","<title>Parabula — ספר</title>","<link rel=""stylesheet"" href=""assets/book.css"" />","</head>","<body>","<div class=""shell""><div class=""a4""><div class=""pagepad""><h1>תוכן עניינים</h1><ul>"+($indexCards -join "")+"</ul></div></div></div>","</body>","</html>") -join "`n"
Set-Content (Join-Path $RepoRoot "$OutRoot\index.html") $toc -Encoding UTF8
"OK: site generated"
