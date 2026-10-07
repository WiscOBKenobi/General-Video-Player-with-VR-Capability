# 来源与第三方许可

## 播放器运行文件

`index.html`、`style.css`、`app.js`、`i18n.js`、`icon.svg` 在本项目开发过程中由 AI 辅助编写，按根目录 [MIT License](LICENSE) 提供。本说明依据本次开发过程和文件检查，不表示做过全互联网逐行查重，也不保证所有生成内容具有排他的著作权。

- 功能需求参考 [Online VR Player](https://onlinevrplayer.com/) 的本地文件、双眼选取和拖动观看功能；没有下载或引入该站的播放器脚本、图片、标识或字体。本项目不代表该网站，不暗示其授权或关联。
- 图标为项目内简单 SVG 几何图形；界面使用系统字体与文本符号，没有捆绑第三方字体、图片素材、音乐、视频或远程资源。README 的两张演示截图来自实际页面，合成全景由 scripts/demo-screenshots.cjs 绘制；均为本项目素材，按 MIT 许可提供。
- 文件读取、解码、音频与 WebGL 来自用户浏览器提供的平台 API。项目没有分发浏览器、专有解码器或现成播放器库。支持某种编码不表示本项目授予该编码相关专利权。
- 球面方向、经纬度和双眼区域映射属于通用数学实现；不能由“使用了通用数学”推导出全部知识产权风险已被排除。

## 仅开发／测试依赖

版本和完整性固定在 `package-lock.json`。这些依赖不被打包到离线播放器，也不随运行文件分发；`npm ci` 安装的包仍带有其原始许可证和 notices。

| 依赖 | 版本 | 许可 | 用途与来源 |
| --- | --- | --- | --- |
| playwright | 1.62.1 | Apache-2.0 | 浏览器自动化，[Microsoft Playwright](https://github.com/microsoft/playwright) |
| playwright-core | 1.62.1 | Apache-2.0 | playwright 的传递依赖，同上 |
| pngjs | 7.0.0 | MIT | 读取测试截图像素，[pngjs](https://github.com/pngjs/pngjs) |
| fsevents | 2.3.2 | MIT | Playwright 声明的 macOS 可选依赖；本次 Windows 安装未安装，[fsevents](https://github.com/fsevents/fsevents) |

Playwright 包含来源于 Puppeteer 的代码，其包内 NOTICE 保留了对应声明；包中其他第三方部分以其随附声明为准。pngjs 包内保留 Luke Page、Original Contributors 与 Kuba Niegowski 的授权声明。

如果未来决定随发行包携带这些依赖、浏览器二进制、示例视频或其他素材，应重新核对并随包保留相应许可文本；当前发布脚本明确排除它们。

## 法律范围

本项目许可证只在许可人拥有可许可权利的范围内生效，不替代第三方授权，也不裁定 AI 生成内容在各司法辖区的权利归属。实现功能与复制受保护的代码表达不是同一问题，可参考《[计算机软件保护条例](https://ipc.court.gov.cn/zh-cn/news/view-407.html)》第六条。开源、商标、专利和视频内容本身的权利需要分别判断；本次检查不是法律意见或完整的专利／商标检索。
