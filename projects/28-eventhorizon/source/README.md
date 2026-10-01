# Event Horizon：Minecraft 自旋黑洞

面向 **Minecraft 1.21.11 + NeoForge 21.11.45 + Java 21** 的独立模组。

通过命令手动生成黑洞，以 Kerr 度规的零测地线计算光线弯曲，再采样游戏画面与深度。1.1.0 在保留原有无盘黑洞的基础上，新增可单独召唤的湍流吸积盘版本。不破坏方块，不伤害或强制吸引玩家。原有 HTML 版本与此项目独立。

光线路径有物理方程依据，但不是整个 Minecraft 世界的完整广义相对论渲染器。吸积盘采用程序化密度场，不是磁流体仿真；屏幕外、物体背面和透明物体处存在近似，详见 `PHYSICS.md`。

## 直接游玩

当前版本 `eventhorizon-1.21.11-1.1.0.jar` 安装位置：

```text
E:\pcl2\.minecraft\versions\1.21.11-NeoForge_21.11.45\mods
```

1. 退出正在运行的游戏，再从 PCL 启动这个实例。无需额外安装前置模组。
2. 进入允许作弊的世界，或使用有管理员命令权限的账号。
3. 建议先在创造模式飞到空中，面朝建筑或山体，输入：

```mcfunction
/blackhole spawn
```

默认在视线前方 24 格生成，质量尺度为 1.5 格，自旋为 0.94。
贴近地面生成时，黑洞可能部分被前景地面遮住，这是深度遮挡的结果。

## 新增吸积盘

```mcfunction
/blackhole disk 1.5 0.94
```

默认在视线前方 48 格生成带盘黑洞。建议在空中俯视约 10 至 20 度召唤，以便看到盘面；飞到与中心同一高度，可检查侧面厚度。

- 原来的 `/blackhole spawn 1.5 0.94` 仍生成无盘版本，已有黑洞不会自动加盘。
- 盘体靠近内圈较厚，向外缘平滑变薄；湍流改变局部密度，不会把外缘厚度鼓起。
- 外边界有不规则缺口、云团和螺旋明暗带，内圈比外圈旋转更快。
- 盘面发光和遮挡沿 Kerr 光线路径累积，包括近似的红移与多普勒亮度变化。
- 两种黑洞可同时存在，共用当前维度最多 4 个已加载实体的限制。
- 黑洞吸积盘标志会随实体保存；旧存档缺少该标志时默认关闭。

## 备份与恢复

升级前的 1.0.1 JAR、完整源码压缩包和截图保存在本交付目录旁的：

```text
EventHorizon-backup-20260912-091425
```

需要恢复时，完全退出游戏，移出 `mods` 内的 `eventhorizon-1.21.11-1.1.0.jar`，再将备份中的 1.0.1 JAR 放回。不要同时加载两个版本。旧版不会渲染吸积盘。
本次安装不打开或修改用户已有世界；修改含模组实体的存档前仍建议自行备份世界。

## 命令

| 命令 | 作用 |
| --- | --- |
| `/blackhole spawn [size] [spin]` | 沿视线生成；参数可省略 |
| `/blackhole spawn 1.5 0.94` | 默认自旋黑洞 |
| `/blackhole spawn 1.5 0` | 无自旋情形 |
| `/blackhole at <x> <y> <z> [size] [spin]` | 在指定位置生成，支持 `~` 相对坐标 |
| `/blackhole disk [size] [spin]` | 沿视线生成带吸积盘版本，默认 1.5、0.94 |
| `/blackhole disk at <x> <y> <z> [size] [spin]` | 在指定位置生成带盘版本 |
| `/blackhole remove` | 移除当前维度中最近的已加载黑洞 |
| `/blackhole clear` | 移除当前维度全部已加载黑洞 |
| `/blackhole list` | 列出当前维度已加载黑洞的位置及参数 |
| `/blackholeview` | 查看本机渲染状态 |
| `/blackholeview off` | 关闭本机光线扭曲，不删除实体 |
| `/blackholeview on` | 打开效果；渲染失败后也可用此命令重试 |
| `/blackholeview quality balanced` | 减少积分计算量，保持屏幕分辨率 |
| `/blackholeview quality high` | 更细的积分步长，默认值 |

`size` 为 `rg = GM/c²` 对应的格数，不是黑洞阴影半径，范围 0.25 至 12。
`spin` 是无量纲自旋，范围 -0.998 至 0.998，正负改变自旋方向；自旋轴固定为世界竖直方向。
较大的黑洞会生成得更远。命令最多允许当前维度同时加载 4 个黑洞。

正常保存世界时，黑洞实体及其位置、尺度、自旋会随世界保存。
`remove` 与 `clear` 不会删除未加载区块中的实体；回到相应区域后再移除。
本机效果和画质设置保存在实例的 `config/eventhorizon-client.properties`。

## 已运行结果

2026 年 9 月 11 日，在独立开发客户端与专用测试世界中实际运行：

- Minecraft 1.21.11、NeoForge 21.11.45、Java 21。
- NVIDIA GeForce RTX 4070 Ti SUPER，1280 × 720，全分辨率、高画质。
- 命令成功生成一个 `rg=1.5, spin=0.94` 的黑洞。
- GPU 着色器编译并实际输出画面，状态记录 `rendered=418, failed=false`。
- 对照截图可见格子墙被弯曲、黑洞阴影出现；前景地面保留遮挡。
- 移除命令执行后，测试世界剩余黑洞数量为 0，客户端正常退出。
- 1.0.1 额外改善了屏幕外方向的天空过渡和边界采样衰减。

这些是启动、渲染和命令的冒烟检查，不是物理误差认证、帧率基准或完整兼容性测试。没有打开或修改指定实例的现有存档。

2026 年 9 月 12 日，1.1.0 在同一独立测试环境中实际运行：

- 无盘状态 `disks=0, rendered=419, failed=false`；原无盘着色器文件的 SHA-256 与 1.0.1 一致。
- 新命令成功生成带盘实体，状态 `disks=1, rendered=1092, failed=false`。
- 拍摄俯视、间隔两秒的盘面以及侧视截图；根据反馈将厚度改成由内向外平滑递减。
- 原来的移除命令和新增盘实体的清除均成功，测试客户端正常退出。
- 未进行全面兼容性、物理收敛或长期存档往返测试。

## 已知边界

- 只验证了原版 OpenGL 渲染管线，未验证 Iris、Oculus、OptiFine、Vulkan 后端或其他修改主帧缓冲的模组。
- 高曲率区域、屏幕边缘及背景缺失时，可能出现拉伸、暗区、细条纹或视角变化时的跳变。
- 水、玻璃、粒子和云的深度不总能代表可见表面，扭曲结果可能不准确。
- 手持物品和 HUD 不参与扭曲。不会模拟玩家自由落体、潮汐力、吞噬或宇宙学质量对游戏时间的影响。
- 多个黑洞是独立透镜的叠加，不是双黑洞时空解。
- 4K 或多个近距离黑洞计算量较大，可切换 `balanced`；两档都不因转动视角临时降低分辨率。
- 联机时服务端和客户端都需要本模组；本次没有测试专用服务器。
- 盘的形状、密度云、寿命、时间倍率和显示曝光是可视化参数，不是完整流体计算结果。盘不会给附近方块提供真实光源。
- 带盘版本计算量高于无盘版本，特别是贴近盘面或同时放置多个黑洞时。

## 源码构建与启动

已安装的 JAR 不需要编译。只有修改源码时才需要以下步骤。

要求本机安装 JDK 21，首次构建需要联网下载 Gradle、NeoForge 与 Minecraft 开发依赖。
Windows PowerShell，在项目目录运行：

```powershell
$env:JAVA_HOME = 'C:\Program Files\Java\jdk-21'
.\gradlew.bat build
```

输出为：

```text
build\libs\eventhorizon-1.21.11-1.1.0.jar
```

启动独立开发客户端：

```powershell
.\gradlew.bat runClient
```

开发客户端使用项目内 `run` 目录，不使用 PCL 实例的存档或配置。若 JDK 安装在其他位置，请相应设置 `JAVA_HOME`。
本项目没有独立单元测试集，`build` 成功不等同于完整测试通过。

## 项目结构

```text
minecraft-eventhorizon/
  build.gradle
  settings.gradle
  gradle.properties
  gradlew
  gradlew.bat
  gradle/wrapper/
  README.md
  PHYSICS.md
  LICENSE
  src/main/java/dev/codex/eventhorizon/
    EventHorizon.java
    BlackHoleEntity.java
    BlackHoleCommands.java
    client/
      BlackHoleClient.java
      ClientSettings.java
      LensingRenderer.java
      AccretionDisk.java
  src/main/resources/
    META-INF/neoforge.mods.toml
    pack.mcmeta
    assets/eventhorizon/lang/
    assets/eventhorizon/shaders/
      lensing.vsh
      lensing.fsh
      lensing-disk.fsh
```

## 卸载

先在各处加载黑洞所在区块，用 `/blackhole clear` 移除本模组实体，保存并退出。
再移走实例 `mods` 中的本模组 JAR。卸载含自定义实体的模组前，建议自行备份世界。
本模组没有注册方块或物品，不会替换现有地形。
