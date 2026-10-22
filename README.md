# DeepSeek 余额与峰谷时间安卓悬浮窗监控套件

本套件依据 [DeepSeek 最新官方定价规则](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/) 与 [查询余额接口 `/user/balance`](https://api-docs.deepseek.com/zh-cn/api/get-user-balance/) 制作，提供 **3 种在安卓手机上实现悬浮窗实时监控的方式**：

## 1. 方式一：单文件网页版 + 安卓系统画中画跨应用悬浮窗（零安装，即开即用）
- 打开 `deepseek_floating_monitor.html`（支持直接添加到安卓手机主屏幕作为独立 App 运行）。
- **页内灵动胶囊/卡片悬浮窗**：支持手指任意拖拽、折叠为迷你胶囊、调节透明度。
- **安卓系统级跨应用画中画 (PiP) 悬浮窗**：点击顶部 **「开启安卓跨应用悬浮窗 (PiP)」** 按钮，利用 HTML5 `<canvas>` 实时视频流将余额与倒计时弹出为安卓系统画中画小窗，切回手机桌面、微信或编程工具时依然置顶显示。

## 2. 方式二：AutoX.js / Auto.js 手机免编译原生悬浮窗（10 秒启动系统级 `WindowManager` 悬浮窗）
- 文件位置：`autojs/deepseek_floaty_autojs.js`
- 使用步骤：
  1. 在安卓手机安装开源免费的 **AutoX.js**（或 Auto.js）。
  2. 导入 `autojs/deepseek_floaty_autojs.js` 并运行，填入您的 DeepSeek `sk-...` API Key，点击「启动安卓系统置顶悬浮窗」即可。

## 3. 方式三：原生 Kotlin Android 工程（含 GitHub Actions 云端自动打包 APK）
- 目录位置：`android-kotlin-app/`
- 核心实现：`FloatingMonitorService.kt` 使用安卓原生 `ForegroundService` + `WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY` 实现跨应用置顶悬浮窗与峰谷切换/低余额通知。
- 云端免电脑打包：将本目录上传至 GitHub 仓库，`.github/workflows/build-apk.yml` 会自动在云端编译并生成 `app-debug.apk` 安装包供手机下载安装。
