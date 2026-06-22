# 医研英语复习 iOS 使用说明

本项目提供两种在 iPhone 上使用的方式。

## 方式一：PWA 主屏应用

1. 将 `dist/` 部署到一个 HTTPS 地址，例如 GitHub Pages、学校服务器或局域网 HTTPS 服务。
2. 在 iPhone Safari 中打开该地址。
3. 点击分享按钮，选择“添加到主屏幕”。
4. 之后从主屏幕打开“医研英语”，可像普通应用一样使用。

进度保存在当前设备浏览器/主屏应用的本地存储中，可在应用右侧用“导出进度 / 导入进度”跨设备迁移。

## 方式二：Xcode 原生壳

1. 在 Mac 上安装完整 Xcode，并在 Xcode Settings > Platforms 中安装 iOS 平台。
2. 打开 `ios/App/App.xcodeproj`。
3. 选择 `App` scheme。
4. 在 Signing & Capabilities 中选择自己的 Team。
5. 连接 iPhone，选择真机作为运行目标。
6. 点击 Run 安装到手机。

如果修改了 Web 应用内容，先运行：

```bash
pnpm run ios:sync
```

这会重新构建 `dist/` 并同步到 `ios/App/App/public`。
