# 21 · Minecraft 黑洞祭坛搭建与剪辑成片

![Minecraft 黑洞祭坛搭建与剪辑成片预览](preview.png)

*原项目建造完成截图。*

[原始提示词](PROMPT.md) · [后续请求](REQUEST_HISTORY.md)

包含建筑工程、存档和剪辑工程。大型成片及素材单独保存；新版未剪辑录屏超过 2 GiB，已分卷上传。

已找到的源码位于 `source/`（如有），交付文件位于 `deliverables/`。原项目中的使用与测试说明一并保留。本次仅归档，未重新运行作品。

## 大型成果下载

| 文件 | 大小 | 下载 |
|---|---|---|
| 25-construction_graphics_alpha.mov | 151.9 MiB | [下载](https://github.com/yizhiclc/models-acts/releases/download/archive-2026-10-01/25-construction_graphics_alpha.mov) |
| 25-Eventide_Altar_music.wav | 139.4 MiB | [下载](https://github.com/yizhiclc/models-acts/releases/download/archive-2026-10-01/25-Eventide_Altar_music.wav) |
| 25-source_recording.mp4 | 447.1 MiB | [下载](https://github.com/yizhiclc/models-acts/releases/download/archive-2026-10-01/25-source_recording.mp4) |
| 25-BlackHoleAltar_1080p60.mp4 | 1471.6 MiB | [下载](https://github.com/yizhiclc/models-acts/releases/download/archive-2026-10-01/25-BlackHoleAltar_1080p60.mp4) |
| 25-2026-09-25 11-15-02.mp4.part02 | 1361.5 MiB | [下载](https://github.com/yizhiclc/models-acts/releases/download/archive-2026-10-01/25-2026-09-25.11-15-02.mp4.part02) |
| 25-2026-09-25 11-15-02.mp4.part01 | 1536.0 MiB | [下载](https://github.com/yizhiclc/models-acts/releases/download/archive-2026-10-01/25-2026-09-25.11-15-02.mp4.part01) |

文件大小与 SHA-256 校验值见仓库根目录的 [large-assets.json](../../large-assets.json)。

新版录屏分成 `.part01` 和 `.part02`，下载全部分卷与 [合并脚本](restore-recording.py) 到同一文件夹，再运行 `python restore-recording.py`；脚本会校验分卷和完整文件。

Premiere 工程保留原媒体引用。换电脑打开时，在 Premiere 中重新链接下载的原始录屏、配乐及透明动画素材；Release 文件名前的 `25-` 为原归档编号（本项目现为第 21 项），可去掉以恢复原素材名。
