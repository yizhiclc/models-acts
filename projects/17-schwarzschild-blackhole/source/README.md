# BLACKHOLE / Schwarzschild Observatory

这是一个可离线打开的真实测地线黑洞模拟，使用 Three.js、官方 OrbitControls 和 WebGL 2。它针对**无自旋 Schwarzschild 黑洞**，不是 Kerr 黑洞，也不是完整的 GRMHD 流体模拟。

## 直接观看

打开交付目录中的 `BlackHole.html` 即可。无需安装、无需服务器、无需联网、无需下载纹理或 CDN 脚本。初次打开会解压内嵌的测地线数据，通常需要等待片刻。

完整项目中的 `index.html` 也可以直接双击打开，但必须保留旁边的 `assets/app.js`。单文件版本则可以独立使用。

运行条件：支持 WebGL 2、`EXT_color_buffer_float` 的浏览器与显卡。建议开启浏览器硬件加速。未满足条件时会显示错误，不会以假动画替代物理渲染。

## 操作

- 鼠标左键拖动：OrbitControls 旋转视角。
- 滚轮或双指捏合：缩放观测距离。
- 触屏单指拖动：旋转。
- 底部按钮：暂停时间、复位视角、导出 PNG、全屏。
- 右侧面板：质量、吸积率、盘外缘、观察者倾角和距离、时间速率、曝光、扰动、辉光与采样质量。
- 顶部三个模式：可见光、红移因子 `g`、光线交盘阶次。
- 手机默认收起参数；右上角参数图标可展开。
- 停止运动后会进行多帧亚像素累积。暂停后，“超采样”最多累积 128 次。

系统开启“减少动态效果”时，初始时间暂停；可点击播放继续。背景恒星固定在天球上，光线追踪会随视角变化而重新成像。

## 安装与启动命令

**观看成品不需要这些命令。** 修改源码时，在项目文件夹内运行：

```sh
npm ci
npm run build
npm start
```

Node.js 20 或更高版本。开发依赖安装时需要网络，运行成品不需要。

服务默认监听 `http://127.0.0.1:4173`，端口被占用时自动递增，以终端打印的地址为准。按 Ctrl+C 停止。

重新生成物理查找表与黑体光谱：

```sh
npm run precompute
npm test
npm run build
```

如果只修改界面或着色器，直接 `npm run build`，无需重新计算物理数据。构建会更新 `index.html`、`assets/app.js`，并把独立单文件 `BlackHole.html` 输出到项目文件夹的上一层。

## 项目结构

```text
BlackHole.html                    独立离线成品
blackhole/
  index.html                      离线项目入口
  README.md                       本说明
  PHYSICS.md                      方程、假设和误差说明
  VALIDATION.md                   实际运行结果
  THIRD_PARTY_NOTICES.txt          库及数据来源与许可证
  package.json
  package-lock.json
  assets/
    app.js                        完整浏览器包，含所有离线资源
  data/
    CIE_xyz_1931_2deg.csv           CIE 标准观察者原始数据
    CIE_xyz_1931_2deg.csv_metadata.json
    blackbody.json                Planck 光谱的线性 RGB 查找表
    geodesics.json                压缩的 float32 测地线场
  src/
    app.js                        渲染流程、OrbitControls、界面
    physics.mjs                   物理方程与数值积分
    shaders.js                    光线重建、辐射转移、成像
    sky.js                        程序化背景星场
    style.css
    template.html
  scripts/
    precompute.mjs                RK4、转向点求积、光谱预计算
    build.mjs                     离线构建与单文件打包
    serve.mjs                     可选本地静态服务器
  tests/
    physics.test.mjs              8 项物理数值测试
```

## 物理与显示

- 以 `G = c = M = 1` 积分 Schwarzschild 零测地线 `u'' + u = 3u²`。
- `r_g = GM/c²`，视界 `2 r_g`，光子球 `3 r_g`，薄盘内缘/ISCO `6 r_g`。
- 使用有限距离静止观察者的正交标架发射光线，非平直空间的简单屏幕扭曲。
- 直接像、远侧盘的透镜像及更高阶交盘由同一条光线计算；光学厚薄盘遮挡其后方发射。
- 无自旋、零内缘力矩的 Novikov–Thorne 温度剖面。
- 引力红移、横向及纵向多普勒效应，黑体 Planck 光谱与 CIE 1931 配色。
- 移动的亮度结构使用迟滞发射时间，可关闭光行时延迟进行比较。

**边界必须明确：**预计算查表、有限分辨率和有限阶次会产生误差；没有黑洞自旋、磁流体、散射、厚盘、盘自引力、返回辐射或实测星图。亮度扰动是圆轨道平流模型，不是湍流解。辉光、曝光和色调映射属于显示处理，可关闭辉光，不应视为黑洞自身发光。

吸积率和质量的滑块是参数探索范围；全部组合不保证落在薄盘模型的自洽区间。默认值强调可见光下可辨认的热辐射，不能当作某个真实天体的拟合结果。

更详细的推导见 `PHYSICS.md`。
