$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$repoRoot = Split-Path $PSScriptRoot -Parent
$entries = Get-Content (Join-Path $repoRoot 'art/source/generation_manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$results = @()
foreach ($entry in $entries) {
    $file = Join-Path $repoRoot "art/incoming/batch$($entry.batch)/$($entry.name).png"
    $image = [System.Drawing.Bitmap]::FromFile($file)
    try {
        if ($image.Width -ne $entry.width -or $image.Height -ne $entry.height) { throw "Wrong dimensions: $file" }
        $transparentSamples = 0
        $visibleSamples = 0
        for ($y = 0; $y -lt $image.Height; $y += [Math]::Max(1, [int]($image.Height / 32))) {
            for ($x = 0; $x -lt $image.Width; $x += [Math]::Max(1, [int]($image.Width / 32))) {
                $pixel = $image.GetPixel($x, $y)
                if ($pixel.A -eq 0) { $transparentSamples++ }
                if ($pixel.A -gt 0) { $visibleSamples++ }
                # Ignore low-alpha edge RGB, where unpremultiplication amplifies rounding.
                # Opaque neutral gray permits a 3/255 channel difference from raster quantization.
                if ($entry.name -eq 'hud_scoreboard' -and $pixel.A -gt 250 -and ([Math]::Abs([int]$pixel.R - [int]$pixel.G) -gt 3 -or [Math]::Abs([int]$pixel.G - [int]$pixel.B) -gt 3)) { throw 'Scoreboard must be neutral grayscale (opaque pixel tolerance 3/255)' }
            }
        }
        if ($visibleSamples -eq 0) { throw "Empty image: $file" }
        if ($entry.transparent -and $transparentSamples -eq 0 -and $entry.name -ne 'bar_fill') { throw "Missing transparent background: $file" }
        if ($entry.name -like 'card_frame_*' -and $image.GetPixel([int]($image.Width / 2), [int]($image.Height / 3)).A -gt 0) { throw "Card portrait aperture is not fully transparent: $file" }
        $results += [PSCustomObject]@{ name = $entry.name; batch = $entry.batch; width = $image.Width; height = $image.Height; transparent_samples = $transparentSamples; sha256 = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLower() }
    } finally { $image.Dispose() }
    if ($entry.width -eq 1920) {
        $smallFile = Join-Path $repoRoot "art/incoming/batch$($entry.batch)/$($entry.name)_1024.png"
        $small = [System.Drawing.Image]::FromFile($smallFile)
        try { if ($small.Width -ne 1024 -or $small.Height -ne 576) { throw "Wrong Roblox dimensions: $smallFile" } } finally { $small.Dispose() }
    }
}
$results | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $repoRoot 'art/source/validation.json') -Encoding UTF8
Write-Output "PASS: $($results.Count) assets; PNG dimensions, sampled alpha, nonempty content, card apertures, grayscale scoreboard and Roblox background sizes."
