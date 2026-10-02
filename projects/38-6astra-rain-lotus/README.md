# 6Astra雨中荷塘场景

![项目预览](preview.png)

*原项目测试截图（2026-10-02）。*

不规则荷塘、荷叶水珠与 GPU 雨滴涟漪，可调雨量和风。

- [下载单文件 HTML](standalone.html)：打开文件页，点击 **Download raw file**，下载后用浏览器打开。
- [完整项目包](deliverables/rain-lotus-complete.zip)：包含源码、依赖锁文件、许可与原测试记录。
- [原始提示词](PROMPT.md) · [后续请求原文](REQUEST_HISTORY.md)
- [完整使用说明](source/README.md) · [原项目测试记录](source/TESTING.md)

需要支持 WebGPU 的浏览器与显卡驱动，并开启硬件加速。原项目已验证 Edge 本地文件离线打开；若浏览器限制本地文件的 WebGPU，请通过 localhost 或 HTTPS 提供同一 HTML。可调雨量、风、画质，暂停降雨或观察单滴。

`standalone.html` 与原交付 HTML 逐字节一致，运行所需脚本和样式均已内嵌。新项目的 HTML 与预览图校验值记录在仓库索引中。

源码位于 `source/`，未包含 `node_modules`；重新构建前请按源码说明安装依赖。原聊天标题为“6Astra雨中荷塘场景”，归档日期为 2026-10-02。此处保留的是原项目测试结果，本次归档未重新执行全部场景测试。

完整项目包使用单文件打包后的最新源码重新封装，并包含原交付的 `rain-lotus.html`。
