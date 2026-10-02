$ErrorActionPreference='Stop'
$source='E:\pcl2\.minecraft\versions\1.21.11-NeoForge_21.11.45-AltarFilm'
$name='1.21.11-NeoForge_21.11.45-AltarFilmV2'
$destination=Join-Path (Split-Path $source -Parent) $name
if(Test-Path -LiteralPath $destination) { throw 'V2 film instance already exists; refusing to replace it.' }
foreach($sub in @('','mods','PCL','config','altarfilm-control')) {
    New-Item -ItemType Directory -Path (Join-Path $destination $sub) -Force | Out-Null
}
$version=Get-Content -LiteralPath "$source\1.21.11-NeoForge_21.11.45-AltarFilm.json" -Raw | ConvertFrom-Json
$version.id=$name
$version | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath "$destination\$name.json" -Encoding utf8
Copy-Item -LiteralPath "$source\1.21.11-NeoForge_21.11.45-AltarFilm.jar" -Destination "$destination\$name.jar"
foreach($mod in @('eventhorizon-1.21.11-1.1.0.jar','ferritecore-8.2.0-neoforge.jar','lithium-neoforge-0.21.4+mc1.21.11.jar')) {
    Copy-Item -LiteralPath "$source\mods\$mod" -Destination "$destination\mods\$mod"
}
Copy-Item -LiteralPath "$source\options.txt" -Destination "$destination\options.txt"
Get-ChildItem -LiteralPath "$source\config" -File | Copy-Item -Destination "$destination\config"
@('State:7','VersionVanillaName:1.21.11','VersionArgumentIndieV2:True','VersionNeoForge:21.11.45',
  'Info:Altar V2 filming - approved design','VersionRamType:1','VersionRamCustom:8','VersionAdvanceAssets:False') |
  Set-Content -LiteralPath "$destination\PCL\Setup.ini" -Encoding utf8
$protected=@("$source\saves\AltarFilm-Final-20260912","$source\saves\AltarReview-V2-20260925")
$hashes=foreach($world in $protected) {
  Get-ChildItem -LiteralPath $world -File -Recurse | ForEach-Object {
    [ordered]@{Path=$_.FullName;SHA256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash}
  }
}
$hashes | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath "$PSScriptRoot\production\protected-world-hashes.json" -Encoding utf8
Write-Output "Prepared isolated filming instance: $destination"
