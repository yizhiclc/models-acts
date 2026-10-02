$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$oldProject = Join-Path (Split-Path $root -Parent) 'altar-film'
$instance = 'E:\pcl2\.minecraft\versions\1.21.11-NeoForge_21.11.45-AltarFilm'
$run = Join-Path $root 'run'
foreach ($part in @('gradle\wrapper','run\mods','run\config','production')) {
    New-Item -ItemType Directory -Path (Join-Path $root $part) -Force | Out-Null
}
foreach ($file in @('gradlew','gradlew.bat','gradle\wrapper\gradle-wrapper.jar','gradle\wrapper\gradle-wrapper.properties')) {
    Copy-Item -LiteralPath (Join-Path $oldProject $file) -Destination (Join-Path $root $file)
}
foreach ($name in @('eventhorizon-1.21.11-1.1.0.jar','ferritecore-8.2.0-neoforge.jar','lithium-neoforge-0.21.4+mc1.21.11.jar')) {
    Copy-Item -LiteralPath (Join-Path "$instance\mods" $name) -Destination (Join-Path "$run\mods" $name)
}
$options = [ordered]@{}
foreach ($line in Get-Content -LiteralPath "$instance\options.txt") {
    $key, $value = $line -split ':', 2
    if ($key) { $options[$key] = $value }
}
@{
    renderDistance='16'; simulationDistance='5'; fullscreen='false'; overrideWidth='1920';
    overrideHeight='1080'; enableVsync='false'; maxFps='90'; bobView='false';
    pauseOnLostFocus='false'; renderClouds='false'; onboardAccessibility='false';
    tutorialStep='none'; soundCategory_music='0.0'; soundCategory_ambient='0.0';
    graphicsMode='1'; gamma='0.7'; entityShadows='true'; autoJump='false'
}.GetEnumerator() | ForEach-Object { $options[$_.Key] = $_.Value }
$options.GetEnumerator() | ForEach-Object { "$($_.Key):$($_.Value)" } |
    Set-Content -LiteralPath "$run\options.txt" -Encoding utf8
$original = Join-Path $instance 'saves\AltarFilm-Final-20260912'
$manifest = Get-ChildItem -LiteralPath $original -File -Recurse | ForEach-Object {
    [pscustomobject]@{Path=$_.FullName;Length=$_.Length;SHA256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash}
}
$manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath "$root\production\original-world-hashes.json" -Encoding utf8
Write-Output "Isolated review runtime: $run"
Write-Output 'Old save and old mods have only been read; none have been modified.'
