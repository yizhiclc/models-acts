# 实际验证记录

验证日期：2026-09-25。环境为 Windows、Node.js 24.16.0、npm 11.13.0、Microsoft Edge 153.0.4234.48。浏览器验证使用 Playwright 驱动无界面 Edge，实际加载本地页面并执行 WebGL 渲染和交互；不是仅检查源码。

## 已完成

`npm test` 在高塔完成 90° 旋转后执行，5 项全部通过：

1. 1 米对应每边 5 个 0.2 米体素。
2. 长方体表面三角形朝外。
3. 城市实体使用整数格点，城区范围与界石坪高塔位置符合布局约束。
4. 高塔实际双立柱几何沿南北排列，开放正面朝东侧天师桩阵列。
5. 程序生成随机序列可重复。

`tests/browser-smoke.mjs` 在高塔移至界石坪后执行了完整巡检：

- 1600 × 1000 页面加载与连续 WebGL 渲染。
- 五处观景点、清昼 / 暮色 / 灯夜、俯瞰地图。
- 入城、自由飞行及 W 键引起的实际镜头位移、退出飞行。
- 隐藏 / 恢复界面、帮助与参考资料弹窗、三档画质。
- 声景开关及 AudioContext 状态。
- 自动巡游实际等待约 10.5 秒后切换观景点。
- 390 × 844 视口布局与屏幕飞行按钮。
- 未记录到脚本 / 控制台错误或资源加载失败。

完整巡检之后，高塔又按用户要求原地旋转了 90°。最终版本执行了 `tests/interaction-check.mjs` 补检并通过：鼠标拖动环绕、滚轮缩放、俯瞰镜头、地图进入飞行的状态切换、全屏、触屏模拟下入城、屏幕飞行按钮引起的实际位移。未记录到控制台错误或外部网络请求。最终全景、俯瞰、移动视口和朝东高塔截图已作视觉检查。

两次浏览器验证的原始结果保存在 [完整巡检记录](tests/records/browser-result.json) 和 [最终交互补检记录](tests/records/interaction-result.json)。记录中的 FPS 是测试环境的瞬时读数，不代表其他设备性能。

## 验证边界

没有在实体手机、Firefox 或 Safari 上运行测试；移动端检查使用浏览器视口与触屏模拟。声景验证了启停和音频上下文状态，没有实际听音检查。没有验证远程网站部署。项目的飞行模式本身不提供碰撞或重力。

## 复现

单位与几何测试不需要安装依赖：

```sh
npm test
```

浏览器测试需要另行安装可选的 Playwright。先在项目目录运行：

```sh
npm install --no-save playwright
npx playwright install chromium
npm start
```

保持服务器运行，在另一个终端的同一目录执行：

```sh
node tests/browser-smoke.mjs
node tests/interaction-check.mjs
```

默认地址为 `http://127.0.0.1:4173`，输出到 `test-results/`。可以通过 `BASE_URL`、`TEST_OUTPUT`、`BROWSER_PATH` 分别指定地址、输出目录和浏览器可执行文件，也可以通过 `PLAYWRIGHT_PATH` 指向已有的 Playwright 包。交付时测试使用本机已有的 Playwright 与 Edge；上述安装 Chromium 的复现路径未另外执行。
