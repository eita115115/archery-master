# Generate apple-touch-icon.png (180x180) with GDI+ (ASCII only - PS 5.1 encoding)
Add-Type -AssemblyName System.Drawing
$size = 180
$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.ColorTranslator]::FromHtml("#1a5c3a"))
$cx = 90; $cy = 90
$rings = @(
  @{ r = 72;   c = "#ffffff" },
  @{ r = 57.6; c = "#1c1e1c" },
  @{ r = 43.2; c = "#37a6e0" },
  @{ r = 28.8; c = "#f23b3b" },
  @{ r = 14.4; c = "#ffe14d" },
  @{ r = 3;    c = "#1c1e1c" }
)
foreach ($ring in $rings) {
  $brush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml($ring.c))
  $r = [float]$ring.r
  $g.FillEllipse($brush, $cx - $r, $cy - $r, 2 * $r, 2 * $r)
  $brush.Dispose()
}
$g.Dispose()
$out = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "apple-touch-icon.png"
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Output "saved: $out"
