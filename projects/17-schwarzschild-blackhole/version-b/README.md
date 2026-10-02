# 事件视界 · Schwarzschild 黑洞实验室

Three.js + OrbitControls + 自定义 GPU 测地线积分。没有黑洞贴图、预制光环或伪造的弯曲吸积盘网格。

## 直接打开

双击 **dist/index.html**，浏览器打开即开始渲染。此构建文件内联全部依赖、代码、着色器和样式，离线可运行，无需服务器、外部模型或 CDN。需要支持 WebGL 2 的现代浏览器，建议启用硬件加速。

## 安装与启动

需要 Node.js 20.19+ 或 22.12+。

```sh
npm install
npm run dev
```

访问终端输出的本地地址。

```sh
npm test
npm run build
npm run preview
```

源码根目录的 `index.html` 通过 Vite 启动；可直接双击的文件是构建后的 `dist/index.html`。

## 结构

```text
blackhole-lab/
  index.html
  package.json
  package-lock.json
  vite.config.js
  src/
    main.js             Three.js、OrbitControls、参数与星场
    raytrace.glsl       每像素 Schwarzschild 光线积分
    physics.js          薄盘通量、光谱与 CPU 参考公式
    style.css
  tests/
    physics.test.js     数值与物理极限检验
  dist/
    index.html          离线单文件成品
  PHYSICS.md            方程、近似和参考文献
  VERIFICATION.md       本机实际运行及物理检验结果
```

## 交互

- 拖动旋转，滚轮或双指缩放；OrbitControls 保持观测中心为黑洞。
- 三个预设：倾斜观测、近侧视、极向观测。
- 调整吸积率、盘外缘、曝光、积分精度与观测谱段。
- 可见光：普朗克光谱的 CIE 1931 近似积分与 sRGB 显示。
- 总辐射：辐射强度按 T_obs^4 显示，色相仍取热谱。
- 频移因子：红移/蓝移诊断色，不是自然色。
- 可以隐藏盘和星场、自动环绕、保存 PNG，并查看模型说明。

默认质量为 10^9 个太阳质量，吸积率为 0.2 个太阳质量/年。事件视界为 2r_g、光子球为 3r_g、最内稳定圆轨道为 6r_g，其中 r_g=GM/c²。

默认高精度：RK4角步长上限0.008弧度，每像素4条子光线。本机实际构建、离线运行和物理核对结果见 `VERIFICATION.md`；性能不代表所有设备。

## 关于“真实”

这是**理想化 Schwarzschild 黑洞的相对论光学数值模拟**，不是完整宇宙或磁流体模拟。不声称复现某个实测黑洞，不包含自旋、厚盘、散射、偏振、回返辐射或磁流体动力学。屏幕有限分辨率、积分步长、谱色近似、曝光和色调映射都会影响图像。详细推导与边界见 `PHYSICS.md`。

场景为轴对称稳态，因此静止相机下辐射图像不需要虚构“旋转纹理”。OrbitControls 改变的是有限半径处静止观测者的观测位置，而不是模拟具有速度的自由落体相机。
