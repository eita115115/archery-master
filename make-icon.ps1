# Resize the generated Neon Sight master into PWA icon sizes.
param(
  [string]$Source = (Join-Path $PSScriptRoot "icon-source.png")
)

Add-Type -AssemblyName System.Drawing

function Resize-Png {
  param(
    [string]$InputPath,
    [string]$OutputPath,
    [int]$Size
  )

  $src = [System.Drawing.Image]::FromFile($InputPath)
  $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
  $bmp.SetResolution(72, 72)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.DrawImage($src, 0, 0, $Size, $Size)
  $bmp.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
  $src.Dispose()
}

if (-not (Test-Path -LiteralPath $Source)) {
  throw "Icon source not found: $Source"
}

Resize-Png -InputPath $Source -OutputPath (Join-Path $PSScriptRoot "icon-1024.png") -Size 1024
Resize-Png -InputPath $Source -OutputPath (Join-Path $PSScriptRoot "icon-512.png") -Size 512
Resize-Png -InputPath $Source -OutputPath (Join-Path $PSScriptRoot "apple-touch-icon.png") -Size 180

Write-Output "saved: icon-1024.png, icon-512.png, apple-touch-icon.png"
