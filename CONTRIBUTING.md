# 开发与贡献

## 本地运行

用新版 Edge 或 Chrome 打开 `index.html`，无需 Node.js、安装依赖或启动服务。不要在页面加入 CDN、远程字体、遥测、上传或播放历史存储。

## 测试

开发测试需要 Node.js 20 或更高版本、npm，以及可用的浏览器。先运行 `node --version` 确认实际选用的版本；系统装有多套 Node 时不要假定 PATH 的第一项就是你希望使用的版本。

```text
npm ci --ignore-scripts
npm run check
npm test
npm run test:chrome
npm run screenshots
npm audit
npm run release:check
npm run package
```

- Windows 上 `npm test` 使用已安装的 Microsoft Edge；`npm run test:chrome` 使用已安装的 Google Chrome。
- 其他系统默认使用 Playwright Chromium。仅在测试需要且本机没有该浏览器时运行 `npx playwright install chromium`；Linux 可能还需要其系统依赖。也可显式运行 `node tests/player.cjs msedge` 或 `node tests/player.cjs chrome`。
- 测试从 `file://` 打开页面，在浏览器中生成四色 WebM，不需要个人视频；结果写入忽略的 `test-results/<browser>/`。
- `npm run screenshots` 以合成全景生成 `docs/images/` 中的两张 README 演示图；修改后须人工检查，不能改用个人片源。
- 测试包含截图像素断言、交互、隐私边界、故障注入及原文件哈希检查。模拟故障不等同于真实设备驱动和所有编码验收。
- `npm ci` / `npm audit` 可能联网，但正常打开播放器不联网。生产运行不依赖 npm 包。

## 提交和发布前

1. 运行适当检查，保持播放器离线可用；投影、播放或生命周期修改运行完整测试。
2. 使用合成素材复现问题；不要在 issue、日志或截图中附带个人视频、文件路径、账号信息或凭据。
3. 新增待发布文件前更新 `scripts/release-files.cjs` 的白名单，并确认其来源和许可。
4. `npm run package` 只复制白名单，生成独立的源码目录和离线播放器目录；不会提交 Git、上传或发布。
5. 发布前复核 `docs/RELEASE_REVIEW.md` 的范围与未验证事项。新依赖、字体、视频或图像须重新核对许可并更新 `THIRD_PARTY_NOTICES.md`。

项目使用 MIT 许可证，贡献代码应具有适当授权。不要直接复制来源或许可证不明的播放器代码。
