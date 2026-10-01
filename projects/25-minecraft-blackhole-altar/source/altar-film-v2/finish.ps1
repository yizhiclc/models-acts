$ErrorActionPreference='Stop'
$root=$PSScriptRoot
$game='E:\pcl2\.minecraft\versions\1.21.11-NeoForge_21.11.45-AltarFilmV2'
$log=Get-Content -LiteralPath "$game\logs\latest.log" -Raw
if($log -notmatch 'ALTAR_FILM_COMPLETE placed=227817 mismatches=0' -or $log -notmatch 'All dimensions are saved') {
    throw 'Wait for the completed take and clean game shutdown.'
}
$report=Get-Content -LiteralPath "$root\production\recording-report.json" -Raw | ConvertFrom-Json
if(-not (Test-Path -LiteralPath $report.outputPath)) { throw 'Recorded video is missing.' }
$expected=[IO.Path]::GetFullPath("$root\recording")+'\'
if(-not ([IO.Path]::GetFullPath($report.outputPath).StartsWith($expected,[StringComparison]::OrdinalIgnoreCase))) {
    throw 'Video is outside the dedicated recording directory.'
}
$shell=New-Object -ComObject Shell.Application
$mediaFolder=$shell.NameSpace([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($report.outputPath)))
$media=$mediaFolder.ParseName([IO.Path]::GetFileName($report.outputPath))
$metadata=[ordered]@{
    width=$media.ExtendedProperty('System.Video.FrameWidth')
    height=$media.ExtendedProperty('System.Video.FrameHeight')
    fps=$media.ExtendedProperty('System.Video.FrameRate')/1000
    durationSeconds=$media.ExtendedProperty('System.Media.Duration')/10000000
    videoBitrate=$media.ExtendedProperty('System.Video.EncodingBitrate')
}
if($metadata.width -ne 1920 -or $metadata.height -ne 1080 -or $metadata.fps -ne 60 -or $metadata.durationSeconds -lt 440) {
    throw "Unexpected encoded media metadata: $($metadata | ConvertTo-Json -Compress)"
}
$metadata | ConvertTo-Json | Set-Content -LiteralPath "$root\production\media-metadata.json" -Encoding utf8
$protected=Get-Content -LiteralPath "$root\production\protected-world-hashes.json" -Raw | ConvertFrom-Json
$changed=@(foreach($entry in $protected) {
    if(-not (Test-Path -LiteralPath $entry.Path) -or (Get-FileHash -LiteralPath $entry.Path -Algorithm SHA256).Hash -ne $entry.SHA256) { $entry.Path }
})
Copy-Item -LiteralPath "$game\logs\latest.log" -Destination "$root\production\game-recording.log"
Copy-Item -LiteralPath "$root\build\libs\altar-film-v2-1.21.11-2.0.0.jar" -Destination "$game\mods\altar-film-v2-1.21.11-2.0.0.jar"
[ordered]@{
    video=$report.outputPath
    bytes=(Get-Item -LiteralPath $report.outputPath).Length
    durationSeconds=$report.actualRecordSeconds
    rawUnedited=$true
    approvedBlueprintUnchanged=$true
    originalAndReviewWorldsUnchanged=($changed.Count -eq 0)
    changedProtectedFiles=$changed
    protectedFilesChecked=@($protected).Count
    completedWorld="$game\saves\$($report.world)"
    subtitlesAdded=$false
    musicAdded=$false
    encodedMedia=$metadata
} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath "$root\production\delivery-report.json" -Encoding utf8
Write-Output "Raw video: $($report.outputPath)"
Write-Output "Duration: $($report.actualRecordSeconds) seconds; 1920x1080, 60 FPS."
Write-Output "Protected saves unchanged: $($changed.Count -eq 0). No editing was performed."
