# Simple static file server for local preview
$Port = 8741
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$mime = @{ ".html"="text/html; charset=utf-8"; ".js"="text/javascript; charset=utf-8"; ".json"="application/json"; ".svg"="image/svg+xml"; ".png"="image/png"; ".css"="text/css" }
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Output "Serving $root at http://localhost:$Port/"
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $path = $ctx.Request.Url.AbsolutePath
  if ($path -eq "/") { $path = "/index.html" }
  $file = Join-Path $root ($path.TrimStart("/") -replace "/", "\")
  try {
    if ((Test-Path $file -PathType Leaf) -and ([System.IO.Path]::GetFullPath($file)).StartsWith($root)) {
      $bytes = [System.IO.File]::ReadAllBytes($file)
      $ext = [System.IO.Path]::GetExtension($file).ToLower()
      if ($mime.ContainsKey($ext)) { $ctx.Response.ContentType = $mime[$ext] }
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
    }
  } catch { $ctx.Response.StatusCode = 500 }
  $ctx.Response.Close()
}
