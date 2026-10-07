# General Video Player with VR Capability

*也很适合播放 VR 视频。*

[English](README.md) · 简体中文

一个在浏览器里运行的本地视频播放器，支持普通视频和下载到本机的 VR 视频。直接打开 `index.html` 即可使用，无需安装、账号、服务或上传视频。

An offline, browser-based player for local videos and equirectangular VR180 / 360° videos. No server, uploads or runtime dependencies.

## 功能

- **中英文界面**：右上角切换 English／中文；默认英文，刷新恢复英文。切换不影响当前视频、播放位置或 VR 设置。

- **原文件直接播放**：读取本地视频交给浏览器解码，不转码、不降低源文件码率、不重新压缩或改写文件。
- **普通视频**：默认完整画面，保持原比例；支持进度跳转、音量和 0.25～4 倍自定义速度。
- **VR 视频**：支持等距柱状 180°／360°，可选左右分屏（SBS）、上下分屏或单幅，以及左眼、右眼或双眼。
- **拖动观看**：VR 模式下拖动画面环视、滚轮缩放，可用控制栏按钮重置视角。
- **会话播放列表**：批量添加或拖入文件，每行一个视频；点击切换、单独移除或一键清空。
- **全屏与快捷操作**：单击／空格播放暂停，双击／F 切换全屏；全屏控制栏半透明并自动隐藏。
- **离线运行**：无 CDN、遥测、后台服务或生产依赖。

“原码率播放”在这里指直接读取原文件、没有二次编码。显示仍会按窗口尺寸和 VR 视角进行采样；不表示逐像素显示、HDR 原样输出或所有高码率视频都能流畅播放。解码与音频兼容性由浏览器和操作系统决定。

## 界面演示

普通视频默认界面：

![普通视频界面，左侧观看设置、中间播放器、右侧会话列表](docs/images/player-home.png)

VR 模式与拖动观看设置：

![VR 模式播放合成全景演示画面](docs/images/player-vr.png)

截图来自本项目实际页面；VR 画面为项目脚本生成的合成全景，不包含个人影片。演示视频不随播放器分发。

## 使用

1. 在 [Releases](https://github.com/WiscOBKenobi/General-Video-Player-with-VR-Capability/releases) 下载播放器 ZIP 并完整解压；也可以通过 **Code → Download ZIP** 下载源码并解压。
2. 用桌面版 Microsoft Edge 或 Google Chrome 打开 `index.html`。
3. 点击「选择视频文件」或播放列表中的「添加视频」，也可以把文件拖进页面。

| 片源 | 选择方式 |
| --- | --- |
| 普通视频 | 默认「普通视频」 |
| 左右分屏 VR180 | 「VR 视频」→ 180° → 左右分屏 → 左眼或右眼 |
| 上下分屏 VR | 「VR 视频」→ 对应投影 → 上下分屏 → 左眼或右眼 |
| 360°全景 | 「VR 视频」→ 360° → 按片源选择单幅、左右或上下分屏 |

空格或单击播放／暂停；双击或 F 全屏；方向键前后跳转 10 秒；M 静音；R 重置视角。倍速输入框支持 1.05、1.1 等小数。

## 格式与隐私边界

- 支持的容器、视频编码和音轨取决于浏览器。扩展名不保证可播放；MKV、HEVC 等可能无法解码。
- VR 输入须为等距柱状投影；不支持鱼眼、EAC、立方体贴图、WebXR 头显或视频转码。需要浏览器图形加速。
- 暂不提供外挂字幕、多音轨切换、自动连播或断点续播。4K／8K、HDR及全部设备和编码组合未专项验收。
- 列表仅存在于当前页面内存中。终止、清空、刷新或关闭页面会释放会话，不删除原视频。
- 播放器不上传视频，也不保存播放历史；**浏览器和 Windows 自身的历史或缓存不受网页控制，不能保证系统无痕。** 详见 [会话隐私说明](docs/SESSION_PRIVACY.md)。

## 开发

日常播放无需 Node.js。开发测试需要 Node.js 20+、npm，以及 Edge／Chrome 或 Playwright Chromium。

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run test:chrome
npm run screenshots
npm run release:check
npm run package
```

Windows 默认测试使用 Edge。两款浏览器各通过 35 项回归，包含投影像素、播放交互、双击全屏、会话清理和源文件 SHA-256 一致性检查。测试使用合成视频，不代表全部实际片源兼容性。

`test-results/`、`node_modules/`、`release/` 和个人视频不纳入仓库。`docs/images/` 仅保留经检查的演示截图。打包脚本按白名单生成源码副本和离线播放器目录；测试依赖不随播放器分发。更多命令见 [贡献说明](CONTRIBUTING.md)。

## 许可与来源

采用 [MIT License](LICENSE)。界面、控制逻辑和 WebGL 投影由本项目独立实现，并使用 AI 辅助开发；文件读取和解码由浏览器提供。功能参考 Online VR Player，未引入其源码或素材。来源及第三方测试工具许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
