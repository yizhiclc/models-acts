# Kerr 版本运行记录

检查日期：2026-09-11。

## 构建

实际执行：

```text
npm ci
npm run build
```

Kerr 独立 HTML 构建成功。

## 浏览器烟雾检查

使用本机 Microsoft Edge + WebGL 2，在离线 `file:` 地址运行：

- 无 JavaScript 错误。
- 无 HTTP/HTTPS 资源请求。
- `OrbitControls` 成功初始化。
- WebGL 2 成功创建。
- 初始 `a*=+0.940`：`r+=1.341 r_g`，`ISCO=2.024 r_g`。
- 切换 `a*=-0.940`：`r+=1.341 r_g`，`ISCO=8.831 r_g`。
- 正自旋初始视角：约 98,219 个像素命中吸积盘，2,720 个像素被捕获。
- 负自旋检查视角：约 163,263 个像素命中吸积盘，8,175 个像素被捕获。
- 初始红移因子采样范围约 `0.146..1.410`。
- 天球光线 Hamilton null residual 抽样最大约 `2.2e-5`。
- 鼠标旋转后相机位置改变。
- 滚轮缩放后观测距离改变。
- 红移模式和物理公式对话框可打开。
- 390×844 手机视口无横向溢出。

截图：

```text
outputs/Kerr-BlackHole-preview.png
```

## 原版保护

开始制作 Kerr 版本前已对原 `outputs/blackhole/`、`BlackHole.html`、原项目 ZIP 和预览图记录 SHA-256。Kerr 版本构建期间没有写入这些路径；原版仍可从原来的文件打开。
