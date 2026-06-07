# HTML-PPT Editor

[English](README.md)

HTML-PPT Editor 是一个早期原型 Chrome 插件，用于把 AI 生成的单文件 HTML PPT 变成可视化可编辑内容。用户可以打开 `.html` / `.htm` 文件，直接点选页面中实际渲染出来的内容进行轻量修改，并导出新的 HTML 文件或整份 PDF。

## 功能

- 通过插件弹窗打开本地 `.html` 和 `.htm` 文件。
- 在浏览器权限允许时编辑当前 Chrome 页面。
- 点选并编辑实际渲染出来的文字、卡片、导航文字和定位元素。
- 修改文字内容、字号、字体、颜色、加粗和对齐方式。
- 移动和缩放已有定位元素。
- 必要时可把普通文档流文本块切换为自由定位。
- 支持新增、复制、可撤销删除文本框。
- 多页 PPT 左侧显示页面缩略图，支持切页、拖动排序和删除页面。
- HTML 长页面滚动时显示临时画中画缩略导航，包含轻量页面结构预览和可拖动视口框。
- 支持有序列表条目上下移动，并在导出时保持标准序号。
- 使用 IndexedDB 保存本地草稿，并支持当前会话内撤销/重做。
- 导出 HTML 前可先预览。
- 在插件内导出整份图片型 PDF，并显示生成进度。

## 当前范围

本项目聚焦“已有 HTML PPT 的轻量可视化修改”，不试图替代完整 PowerPoint。

当前版本不包含：

- AI 辅助改写或自动排版。
- 云同步、账号体系、团队协作或远程存储。
- PPTX 导出。
- 复杂多选、组合或批量编辑。
- 外部资源的完整离线重新打包。
- 一等功能级别的图片替换。

## PDF 导出说明

PDF 导出不使用 Chrome 系统打印预览。插件会逐页捕获识别到的 slide/page，并通过本地前端库写入一份 PDF。

已知限制：

- 生成的 PDF 是图片型 PDF，PDF 内文字不可选中。
- 部分高级 CSS、滤镜、混合模式、图标字体、远程图片或跨域资源可能和浏览器预览有差异。
- 稳定版发布前仍需要完成真实样本验证。

## 开发者模式安装

1. 下载或克隆本仓库。
2. 打开 Chrome，进入 `chrome://extensions/`。
3. 开启“开发者模式”。
4. 点击“加载已解压的扩展程序”。
5. 选择本项目目录。

如果需要编辑已经通过 `file://` 打开的本地页面，请在插件详情页开启“允许访问文件网址”。

## 项目结构

```text
manifest.json          Chrome 插件清单
popup.html/js/css      插件弹窗入口
editor.html/js/css     编辑器外壳
editor-core.js         主要编辑和导出逻辑
vendor/                本地 PDF 前端依赖
assets/icons/          插件图标
tests/                 静态和浏览器行为测试
docs/                  项目状态和开源审计文档
design/                UI 规格和截图
```

## 测试

运行静态契约测试：

```powershell
powershell -ExecutionPolicy Bypass -File tests\run-static-tests.ps1
```

运行浏览器行为测试：

```powershell
powershell -ExecutionPolicy Bypass -File tests\run-browser-tests.ps1
```

## 开发包

开发者模式安装包生成位置：

```text
dist/html-ppt-editor-dev-v0.1.0.zip
```

该 zip 是本地测试产物。开源开发时，建议直接在 Chrome 中加载仓库目录。

## 开源状态

本仓库已按公开 GitHub 项目整理，但目前仍是早期原型。稳定版发布前，需要用目标 15 个真实 HTML PPT 样本完成验证。

## 许可证

MIT。详见 [LICENSE](LICENSE)。
