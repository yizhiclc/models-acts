# BENNELONG · 悉尼歌剧院

以 Three.js 编写的悉尼歌剧院交互场景。建筑、海面、地形、港湾大桥、船只和纹理均由代码生成，不加载现成的完整建筑模型，不使用外部 CDN、图片或网络字体。

## 直接打开单文件版本

双击交付的 `悉尼歌剧院-单文件.html`，使用新版 Chrome、Edge、Firefox 或 Safari 打开。无需安装依赖，无需启动服务器，断网也能运行；浏览器需要支持 WebGL 2。

## 开发项目

使用 Node.js 20.19+ 或 22.12+（实际构建使用 Node.js 24.16.0）。在项目目录运行：

```sh
npm ci
npm run dev
```

打开终端显示的本地地址，默认是 `http://127.0.0.1:5173/`。

```sh
npm run check    # 曲面、厚度、共享屋脊、相交裁切的几何检查
npm run build    # 生成静态站点，同时生成离线单文件 HTML
npm run preview # 预览 dist 中的生产构建
```

构建产物：

- `dist/index.html` 与 `dist/assets/`：用于静态服务器的完整前端。
- `dist/sydney-opera-house.html`：所有 JS/CSS 内嵌的离线版本，可直接双击。交付目录中的中文文件名版本与它相同。

## 操作

| 操作 | 方式 |
| --- | --- |
| 旋转观察 | 鼠标左键拖动；触屏单指拖动 |
| 缩放 | 滚轮；触屏双指捏合 |
| 平移 | 鼠标右键拖动；触屏双指拖动；聚焦画布后按方向键 |
| 默认视角 | 复位按钮、左上角标志，或 R |
| 预设机位 | 下方四个按钮，或数字 1–4 |
| 晴日 / 日暮 / 蓝调 | 右侧光照预设 |
| 环绕漫游 | 右侧开关；画布聚焦时按空格 |
| 建筑标注 | 右侧开关；被屋顶遮挡的标注会隐藏 |
| 海面与船只动画 | 海港动态开关 |
| 纯净视野 | 右下角按钮或 H；Esc 返回 |
| 保存画面 | 留影按钮，下载当前三维画面的 PNG |

网页会尊重系统的“减少动态效果”偏好，初始关闭海港动画并取消机位、光照的过渡动画。

## 建模说明

- 两组不同尺度的主厅屋顶与西南前部低矮的双壳体贝尼朗餐厅；模型最高处约 67 个米制单位。餐厅相对于音乐厅的位置还对照了 OpenStreetMap 的地点与轮廓。
- 主壳面由半径 75 的球面生成，左右半壳使用同一条中心平面小圆作为屋脊，避免两片壳面各自投影造成裂缝。
- 前后反向的主壳体共用支承点，并沿两球面的真实交线裁切、收边，消除直接穿插。
- 连续屋顶之间明确区分上壳挑檐、内退玻璃和下壳边缘。玻璃延伸到上壳尖端后方，底部沿斜向平面裁切，消除外翻尾部；四组裁口同时补齐平面玻璃收口和连接下壳的白色壳面，保留内凹过渡与下缘玻璃带。
- 两个主厅南侧入口均采用折入式玻璃幕墙：从屋檐内退至较低折点，再向外接回入口底边。分格沿折面布置，底部连续收到底座，不另加突出的矩形门廊。
- 壳体有内外表面、约 0.42 厚度、瓷砖纹理、放射状拼缝、内侧混凝土肋和圆钝屋檐。
- 收紧到建筑轮廓的石材基座、68 级独立踏步、门窗、栏杆、地面铺装、灯具、座椅、室外餐桌及人物尺度参照。前部餐厅设独立的较低平台，台阶避让它的占地。
- 海面具有实时平面反射、程序化法线及动态波纹。海港大桥包括落在岸边支座上的双钢拱、吊杆、桥面横梁、四座花岗岩塔、连续引桥和接岸路堤；远岸、城市及植物仍作背景简化。

这是一份参照实景照片制作的程序化建筑形态研究，并非测绘模型。相邻壳面过渡、内部空间和远景均包含近似建模；壳体参数数量指本模型的生成单元，不代表真实建筑的构件统计。

实际执行的验证与限制见 `VALIDATION.md`。单文件已通过本地 HTTP 预览验证；受内置浏览器策略限制，本次未直接自动测试 `file:` 双击运行。

## 源码组织

```text
src/main.js          场景、相机、灯光、交互、动画、状态
src/architecture.js  主体壳体、连接面、幕墙、基座、台阶与细部
src/geometry.js      球面参数化、交线裁切、曲面放样、几何合批
src/materials.js     本地生成的瓷砖、石材及铺装纹理
src/harbour.js       水面、天空、岸线、大桥、远景与船只
src/bridge.js        双钢拱、支座、吊杆、石塔、桥面及接岸引桥
src/style.css        自适应中文界面
scripts/standalone.mjs   生成离线单文件
scripts/check-geometry.mjs  几何回归检查
```

为降低绘制开销，静态几何按材质合批。最大像素比受限，窄屏使用较低的水面反射分辨率。没有后端、追踪脚本、外部字体或运行时网络资源依赖。“阅读歌剧院的故事”链接仅在点击时访问官网。

## 实景参考

整改参考了多张不同方位的照片，重点校对曲面轮廓、前庭三个主要拱口、白色连接壳与玻璃开口的关系。

- [西侧临港轮廓：Sydney Australia (21339175489)](https://commons.wikimedia.org/wiki/File:Sydney_Australia._(21339175489).jpg)
- [前庭与台阶：Sydney Opera House (Front 2)](https://commons.wikimedia.org/wiki/File:Sydney_Opera_House_(Front_2).jpg)
- [屋檐、瓷砖和幕墙：Sydney Opera House 2018-08-22 hires](https://commons.wikimedia.org/wiki/File:Sydney_Opera_House_2018-08-22_hires.jpg)
- [东侧轮廓：Sydney Opera House, botanic gardens 1](https://commons.wikimedia.org/wiki/File:Sydney_Opera_House,_botanic_gardens_1.jpg)
- [歌剧院官方建筑故事](https://www.sydneyoperahouse.com/our-story)
- [贝尼朗餐厅位置及平面参考：OpenStreetMap](https://www.openstreetmap.org/way/48629177)（© OpenStreetMap contributors）
- [新南威尔士州遗产名录：海港大桥及引桥照片](https://apps.environment.nsw.gov.au/dpcheritageapp/HeritageItemImage.aspx?ID=5045703)（本次通过图片搜索中的官方来源照片核对钢拱、桥面与石塔连接）

参考照片仅用于对照，没有嵌入项目或离线 HTML。

Three.js、Vite 与 esbuild 分别遵循各自的开源许可。Three.js 的许可副本见 `THIRD_PARTY_LICENSES.txt`。
