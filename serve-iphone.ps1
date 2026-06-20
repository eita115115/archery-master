# LAN server: open http://<PC-IP>:8742/ from iPhone on the same Wi-Fi
# (ASCII only in this file: PowerShell 5.1 misreads UTF-8 .ps1 without BOM)
$Port = 8742
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$mime = @{ ".html"="text/html; charset=utf-8"; ".js"="text/javascript; charset=utf-8"; ".json"="application/json"; ".svg"="image/svg+xml"; ".png"="image/png"; ".css"="text/css" }
$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Any, $Port)
$listener.Start()
Write-Output "Serving $root on port $Port (all interfaces)"
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -ne "127.0.0.1" -and $_.IPAddress -notlike "169.254*" } |
  ForEach-Object { Write-Output ("  Open from iPhone (same Wi-Fi): http://" + $_.IPAddress + ":" + $Port + "/") }
while ($true) {
  $client = $listener.AcceptTcpClient()
  try {
    $stream = $client.GetStream()
    $stream.ReadTimeout = 3000
    $reader = New-Object System.IO.StreamReader($stream)
    $requestLine = $reader.ReadLine()
    while ($true) { $line = $reader.ReadLine(); if ($null -eq $line -or $line -eq "") { break } }
    $status = "404 Not Found"; $body = [Text.Encoding]::UTF8.GetBytes("Not Found"); $ctype = "text/plain"
    if ($requestLine -match '^GET\s+(\S+)') {
      $path = $matches[1].Split('?')[0]
      if ($path -eq "/") { $path = "/index.html" }
      $file = Join-Path $root ($path.TrimStart("/") -replace "/", "\")
      $full = [System.IO.Path]::GetFullPath($file)
      if ($full.StartsWith($root) -and (Test-Path $full -PathType Leaf)) {
        $body = [System.IO.File]::ReadAllBytes($full)
        $ext = [System.IO.Path]::GetExtension($full).ToLower()
        $ctype = "application/octet-stream"
        if ($mime.ContainsKey($ext)) { $ctype = $mime[$ext] }
        $status = "200 OK"
      }
    }
    $header = "HTTP/1.1 $status`r`nContent-Type: $ctype`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
    $hb = [Text.Encoding]::ASCII.GetBytes($header)
    $stream.Write($hb, 0, $hb.Length)
    $stream.Write($body, 0, $body.Length)
    $stream.Flush()
  } catch {} finally { $client.Close() }
}
