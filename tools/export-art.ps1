param([string]$Manifest = 'art/source/generation_manifest.json')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$repoRoot = Split-Path $PSScriptRoot -Parent
$entries = Get-Content (Join-Path $repoRoot $Manifest) -Raw -Encoding UTF8 | ConvertFrom-Json
function Export-Png([System.Drawing.Image]$Image, [string]$Path, [int]$Width, [int]$Height) {
    $bitmap = New-Object System.Drawing.Bitmap($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $attributes = New-Object System.Drawing.Imaging.ImageAttributes
        try {
            $attributes.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)
            $destination = New-Object System.Drawing.Rectangle(0, 0, $Width, $Height)
            $graphics.DrawImage($Image, $destination, 0, 0, $Image.Width, $Image.Height, [System.Drawing.GraphicsUnit]::Pixel, $attributes)
        } finally { $attributes.Dispose() }
        $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $graphics.Dispose(); $bitmap.Dispose() }
}
foreach ($entry in $entries) {
    $targetDir = Join-Path $repoRoot "art/incoming/batch$($entry.batch)"
    $sourceDir = Join-Path $repoRoot 'art/source/generated'
    New-Item -ItemType Directory -Force $targetDir, $sourceDir | Out-Null
    $masterPath = Join-Path $sourceDir "$($entry.name).png"
    if (-not (Test-Path -LiteralPath $masterPath)) { Copy-Item -LiteralPath $entry.source -Destination $masterPath }
    $sourceImage = [System.Drawing.Image]::FromFile($masterPath)
    try {
        Export-Png $sourceImage (Join-Path $targetDir "$($entry.name).png") $entry.width $entry.height
        if ($entry.width -eq 1920) {
            Export-Png $sourceImage (Join-Path $targetDir "$($entry.name)_1024.png") 1024 576
        }
        Write-Output "$($entry.name): $($entry.width)x$($entry.height)"
    } finally { $sourceImage.Dispose() }
}
