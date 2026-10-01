# KERR / Rotating Black Hole

这是与 Schwarzschild 版本并列的独立实验版本。原来的 `BlackHole.html`、`outputs/blackhole/` 和项目压缩包没有修改。

## 直接观看

打开：

```text
outputs/Kerr-BlackHole.html
```

它是单文件离线版本，支持 WebGL 2 的现代浏览器即可运行。无需安装、无需联网。首次打开会在 GPU 上逐像素积分 Kerr–Schild Hamilton 测地线；视角拖动时临时降低积分分辨率，停止拖动后恢复。

## 操作

- OrbitControls：鼠标拖动旋转，滚轮缩放，触屏拖动旋转。
- 自旋参数 `a*`：正值为盘与黑洞同向的 prograde，负值为反向的 retrograde。
- 可见光、红移、像阶三个模式仍然保留。
- 右侧面板显示外事件视界、ISCO、盘温度、积分质量和吸积参数。
- `均衡 / 高精度 / 超采样` 会改变 GPU 积分步数和屏幕分辨率。
- “拖动时降采样”开关可以关闭交互期间的临时低分辨率；关闭后拖动也使用当前质量档位。
- 开启时，运动中的光线追踪缓存会暂时降低质量，停止交互约 220 ms 后恢复。

## 源码运行

在本目录执行：

```sh
npm ci
npm run build
npm start
```

服务默认使用 `http://127.0.0.1:4174`。端口占用时会自动递增，以终端输出为准。

物理单元测试：

```sh
npm test
```

重建 CIE 1931 / Planck 黑体光谱表：

```sh
npm run precompute
npm run build
```

## 目录

```text
Kerr-BlackHole.html       独立离线成品
kerr-blackhole/
  index.html              项目入口
  assets/app.js           构建后的浏览器包
  data/                   CIE 数据和黑体查找表
  src/physics.mjs         Kerr 度规、Hamilton 方程、ISCO、盘通量
  src/shaders.js          GPU 三维积分和成像
  src/app.js              Three.js、OrbitControls、缓存与 UI
  scripts/spectrum.mjs    光谱表构建
  scripts/build.mjs       构建单文件
  scripts/serve.mjs       可选本地服务器
  tests/physics.test.mjs  Kerr 数值测试
  PHYSICS.md              方程和近似
  VALIDATION.md           实际运行记录
```
