# 医学人文英语复习小程序

用于复习《医学人文英语》课程相关单词、词组、填词和翻译题的小程序。项目提供网页/PWA 源码，也可通过 release 分支下载 Windows 和 macOS 本地版压缩包。

本项目是非官方学习辅助工具，题目和释义整理可能存在错误，复习时请以教材、课堂讲解和任课教师要求为准。

## 分支说明

- `main`：源码分支，包含 React/Vite/Capacitor 项目代码，不提交 `node_modules`、`dist`、临时 PDF 或本地发布包。
- `release`：发布物分支，只放打包好的 Windows/macOS 本地版压缩包和发布说明。

## 本地开发

```sh
corepack pnpm install
corepack pnpm dev
```

## 构建网页版本

```sh
corepack pnpm build
```

构建产物会输出到 `dist/`，该目录不提交到 `main`。

## 移动端工程

项目包含 Capacitor 的 Android/iOS 工程：

```sh
corepack pnpm android:sync
corepack pnpm ios:sync
```

## 进度保存

练习进度保存在当前浏览器本地存储中。换电脑时可以在应用内先导出 JSON 进度文件，再在新电脑导入。

## 版权与说明

本项目为复习辅助小程序，非教材官方配套软件，仅供学习复习使用，请勿用于商业用途。
