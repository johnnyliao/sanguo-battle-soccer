param([string]$Batch = 'batch2', [string]$Pattern = '*.png', [string]$Name = 'preview', [int]$MaxImage = 208)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$repoRoot = Split-Path $PSScriptRoot -Parent
$files = @(Get-ChildItem (Join-Path $repoRoot "art/incoming/$Batch") -Filter $Pattern | Sort-Object Name)
$columns = 6
$cell = 240
$rows = [int][Math]::Ceiling($files.Count / $columns)
$canvas = New-Object System.Drawing.Bitmap(($columns * $cell), ($rows * $cell))
$graphics = [System.Drawing.Graphics]::FromImage($canvas)
$font = New-Object System.Drawing.Font('Arial', 10)
try {
    $graphics.Clear([System.Drawing.Color]::LightGray)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    for ($i = 0; $i -lt $files.Count; $i++) {
        $sourceImage = [System.Drawing.Image]::FromFile($files[$i].FullName)
        try {
            $x = ($i % $columns) * $cell
            $y = [int][Math]::Floor($i / $columns) * $cell
            $scale = [Math]::Min($MaxImage / $sourceImage.Width, $MaxImage / $sourceImage.Height)
            $width = [int]($sourceImage.Width * $scale)
            $height = [int]($sourceImage.Height * $scale)
            $graphics.DrawImage($sourceImage, ($x + [int](($cell - $width) / 2)), ($y + [int]((212 - $height) / 2)), $width, $height)
            $graphics.DrawString($files[$i].BaseName, $font, [System.Drawing.Brushes]::Black, ($x + 4), ($y + 218))
        } finally { $sourceImage.Dispose() }
    }
    $previewDir = Join-Path $repoRoot 'art/source/previews'
    New-Item -ItemType Directory -Force $previewDir | Out-Null
    $canvas.Save((Join-Path $previewDir "$Name.jpg"), [System.Drawing.Imaging.ImageFormat]::Jpeg)
} finally { $graphics.Dispose(); $canvas.Dispose(); $font.Dispose() }
