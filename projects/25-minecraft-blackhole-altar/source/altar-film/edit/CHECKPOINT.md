# Premiere Edit Checkpoint

The user resumed full editing after the earlier pause request.

Cleanup on 2026-09-12 removed obsolete fault backups, old autosaves, test scripts,
unused preview PNGs, the raw music intermediate, and diagnostic files.
Some filenames below document historical steps and no longer exist.
See `cleanup-20260912.csv` for the exact deletion manifest.
The final project, all five referenced media files, source recording, finished
export, linked baseline, and latest final-project autosave remain intact.

- Original OBS recording is preserved.
- Premiere is controlled through ExtendScript, without Computer Use.
- Source: `../recording/2026-09-12 10-42-01.mp4`.
- Actual source duration: approximately 623.55 seconds.
- Retained source range: 29.75 to 537.40 seconds.
- Baseline duration: 507.65 seconds, 1920 x 1080, 60 fps.
- All ten construction phases are retained at their original speed.
- The foundation phase took longer in the actual recording than in the planned timeline.
- Source-log timing is stored in `edit-plan.json`.
- The Premiere-importable timeline is `BlackHoleAltar_Baseline.xml`.
- The initial XML import could not link the recording. Its project is retained only as a backup.
- The recording was remuxed, without re-encoding, to `source_recording.mp4`.
- Native Premiere media import succeeded; `premiere-linked-status.txt` confirms the source is online.
- The clean baseline is `BlackHoleAltar_Linked.prproj`.
- The successfully saved finished edit is `BlackHoleAltar_Finished.prproj`.
- The export target is `BlackHoleAltar_1080p60.mp4`.
- Check `premiere-finished-status.txt` for actual save and export results.
- `saveAs` required native Windows paths from `File.fsName`; forward-slash paths caused a later save to block.

## Edit Layout

- V1: intact source range, with short opening/closing fades.
- V2: ten chapter graphics clips with Chinese titles, short explanations, and time progress.
- V3: a six-second opening title.
- A1: preserved source audio, effectively silent.
- A2: locally synthesized atmospheric score with opening/closing fades.
- Alternative editable caption text: `assets/components_zh.srt`, imported into the project bin.

The graphics use transparent QuickTime Animation video. Text itself is pre-rendered,
not native Premiere text. `assets/component-copy.json` and the asset script contain
the editable copy, and the SRT can be used for a native-caption alternative.

## Completed

Premiere returned `No Error`, saved the final project, and completed the export.
Verified output: 1,543,060,722 bytes, 507.65 seconds, 1920x1080, 60 fps, AAC audio.
Four decoded frames were inspected at 3, 98, 347, and 501 seconds.
Graphics and chapter labels render correctly in the sampled output.
The work is ready for the user's review. Do not repeat a full visual audit.
