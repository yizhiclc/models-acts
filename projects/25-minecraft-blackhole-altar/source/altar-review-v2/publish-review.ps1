$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$worldName = 'AltarReview-V2-20260925'
$source = Join-Path $root "run\saves\$worldName"
$saveRoot = [IO.Path]::GetFullPath('E:\pcl2\.minecraft\versions\1.21.11-NeoForge_21.11.45-AltarFilm\saves')
$destination = [IO.Path]::GetFullPath((Join-Path $saveRoot $worldName))
if (-not $destination.StartsWith($saveRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Destination outside the selected instance.' }
if (Test-Path -LiteralPath $destination) { throw 'Review world already exists; refusing to overwrite.' }
if (-not (Test-Path -LiteralPath "$root\run\review-ready.txt")) { throw 'Review client has not completed.' }
$log = Get-Content -LiteralPath "$root\run\logs\latest.log" -Raw
if ($log -notmatch 'All dimensions are saved') { throw 'Wait for clean client shutdown before publishing.' }
$status = Get-Content -LiteralPath "$source\altarreview-complete.json" -Raw | ConvertFrom-Json
if ($status.mismatches -ne 0) { throw 'Actual in-game blocks differ from the blueprint.' }
$original = Get-Content -LiteralPath "$root\production\original-world-hashes.json" -Raw | ConvertFrom-Json
$changed = foreach ($item in $original) {
    if (-not (Test-Path -LiteralPath $item.Path) -or (Get-FileHash -LiteralPath $item.Path -Algorithm SHA256).Hash -ne $item.SHA256) { $item.Path }
}
if ($changed) { throw "The original world changed during this run; review before proceeding: $changed" }
Copy-Item -LiteralPath $source -Destination $destination -Recurse -ErrorAction Stop
Copy-Item -LiteralPath "$root\run\logs\latest.log" -Destination "$root\production\in-game-review.log"
Compress-Archive -LiteralPath $destination -DestinationPath "$root\AltarReview-V2-20260925.zip" -CompressionLevel Optimal
[ordered]@{
    world=$worldName; installedSave=$destination; originalUnchanged=$true;
    originalFilesChecked=@($original).Count; blueprintBlocks=$status.blocks;
    inGameMismatches=$status.mismatches; filmingStarted=$false;
    reviewMode='in-game'; blueprintRevision=$status.revision
} | ConvertTo-Json | Set-Content -LiteralPath "$root\production\delivery-report.json" -Encoding utf8
Write-Output "Review save installed: $destination"
Write-Output 'Old save unchanged. No construction filming was started.'
