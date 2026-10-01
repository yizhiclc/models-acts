# Altar Film

Minecraft 1.21.11 / NeoForge 21.11.45 独立拍摄实例：黑金高台黑洞祭坛、逐方块施工导演、平滑跟随镜头和 OBS 录制配置。

## 已完成

- 正式世界：`AltarFilm-Final-20260912`
- 建筑范围：约 129 x 129，地面 Y=63，最高约 Y=170
- 施工事件：54,448 个
- 实际唯一方块：53,564 个
- 施工时间线：480 秒
- 最终黑洞：`/blackhole disk at 0 126 0 1.5 0.94`
- 录制：1920 x 1080，60 FPS，OBS MP4
- 原实例 `E:\pcl2\.minecraft\versions\1.21.11-NeoForge_21.11.45` 未修改

## 直接使用

1. 在 PCL2 中刷新版本列表。
2. 选择 `1.21.11-NeoForge_21.11.45-AltarFilm`。
3. 启动后进入 `AltarFilm-Final-20260912`。
4. 该世界已保存完整祭坛和黑洞，不需要重新建造。

独立实例目录：

`E:\pcl2\.minecraft\versions\1.21.11-NeoForge_21.11.45-AltarFilm`

## 重新拍摄

开发环境需要 Java 21：

```powershell
$env:JAVA_HOME='C:\Program Files\Java\jdk-21'
node .\generate-blueprint.mjs
.\gradlew.bat build
.\gradlew.bat runClient
```

导演控制目录位于独立实例的 `altarfilm-control`。在游戏进入自动创建的带 `AltarFilm-` 前缀世界后，可写入以下命令：

```text
prepare
start
pause
resume
stop
release
status
preview 315
```

正式录像建议先在新建的 `AltarFilm-...` 世界试拍；导演会拒绝覆盖已有施工进度的世界。

## 文件

- `production/timeline.json`：阶段时间线
- `production/camera.csv`：镜头采样
- `production/blocks.csv`：方块施工事件
- `production/final-blueprint.json.gz`：最终建筑蓝图
- `production/optimization-manifest.json`：优化模组兼容记录
- `recording/`：OBS 录像文件
- `src/main/java/`：导演模组源码
