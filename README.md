# HTML-PPT Editor

HTML-PPT Editor is a Chrome extension prototype for visually editing AI-generated single-file HTML presentations. It lets users open an `.html` or `.htm` file, click rendered content, make lightweight edits, and export a new HTML file or a full-deck PDF.

HTML-PPT Editor 是一个 Chrome 插件原型，用于把 AI 生成的单文件 HTML PPT 变成可视化可编辑内容。用户可以打开 `.html` / `.htm` 文件，直接点选页面中实际渲染出来的内容进行轻量修改，并导出新的 HTML 文件或整份 PDF。

## Features / 功能

- Open local `.html` and `.htm` files from the extension popup.
- Edit the current Chrome page when permissions allow it.
- Select and edit rendered text blocks, cards, navigation text, and positioned elements.
- Change text content, font size, font family, color, bold state, and alignment.
- Move and resize already-positioned elements.
- Enable free positioning for normal document-flow text blocks when needed.
- Add, copy, and reversibly delete text boxes.
- Show a left thumbnail rail for multi-page presentations, with page switching, drag sorting, and page deletion.
- Show a temporary minimap for long HTML pages while scrolling.
- Move ordered-list items up and down while preserving standard numbering on export.
- Keep a local draft in IndexedDB and support undo/redo during the current editing session.
- Preview before exporting HTML.
- Export a full-document PDF inside the plugin with progress feedback.

- 通过插件弹窗打开本地 `.html` 和 `.htm` 文件。
- 在权限允许时编辑当前 Chrome 页面。
- 点选并编辑实际渲染出来的文字、卡片、导航文字和定位元素。
- 修改文字内容、字号、字体、颜色、加粗和对齐方式。
- 移动和缩放已有定位元素。
- 必要时可把普通文档流文本块切换为自由定位。
- 支持新增、复制、可撤销删除文本框。
- 多页 PPT 左侧显示页面缩略图，支持切页、拖动排序和删除页面。
- HTML 长页面滚动时显示临时画中画缩略导航。
- 支持有序列表条目上下移动，并在导出时保持标准序号。
- 使用 IndexedDB 保存本地草稿，并支持当前会话内撤销/重做。
- 导出 HTML 前可先预览。
- 在插件内导出整份 PDF，并显示生成进度。

## Current Scope / 当前范围

This project focuses on lightweight editing of existing HTML presentations. It does not try to become a full PowerPoint replacement.

本项目聚焦“已有 HTML PPT 的轻量可视化修改”，不试图替代完整 PowerPoint。

Not included in the current version:

当前版本不包含：

- AI-assisted rewriting or layout generation.
- Cloud sync, accounts, team collaboration, or remote storage.
- PPTX export.
- Complex multi-select, grouping, or batch editing.
- Full offline repackaging of external assets.
- Image replacement as a first-class feature.

- AI 辅助改写或自动排版。
- 云同步、账号体系、团队协作或远程存储。
- PPTX 导出。
- 复杂多选、组合或批量编辑。
- 外部资源的完整离线重新打包。
- 一等功能级别的图片替换。

## PDF Export Notes / PDF 导出说明

PDF export no longer uses Chrome's system print preview. The extension captures each detected slide/page and writes it into one PDF through local browser-side libraries.

PDF 导出不再使用 Chrome 系统打印预览。插件会逐页捕获识别到的 slide/page，并通过本地前端库写入一份 PDF。

Known limitations:

已知限制：

- The generated PDF is image-based; text in the PDF is not selectable.
- Some advanced CSS, filters, blend modes, icon fonts, remote images, or cross-origin resources may render differently.
- Real sample validation is still required before release.

- 生成的 PDF 是图片型 PDF，PDF 内文字不可选中。
- 部分高级 CSS、滤镜、混合模式、图标字体、远程图片或跨域资源可能和浏览器预览有差异。
- 正式发布前仍需要完成真实样本验证。

## Installation For Development / 开发者模式安装

1. Download or clone this repository.
2. Open Chrome and go to `chrome://extensions/`.
3. Enable Developer mode.
4. Click "Load unpacked".
5. Select this project folder.

1. 下载或克隆本仓库。
2. 打开 Chrome，进入 `chrome://extensions/`。
3. 开启“开发者模式”。
4. 点击“加载已解压的扩展程序”。
5. 选择本项目目录。

If you want to edit local pages already opened with `file://`, enable "Allow access to file URLs" in the extension details page.

如果需要编辑已经通过 `file://` 打开的本地页面，请在插件详情页开启“允许访问文件网址”。

## Project Structure / 项目结构

```text
manifest.json          Chrome extension manifest
popup.html/js/css      Extension popup entry
editor.html/js/css     Editor shell
editor-core.js         Main editing and export logic
vendor/                Local browser-side PDF dependencies
assets/icons/          Extension icons
tests/                 Static and browser behavior tests
docs/                  Product, UX, technical, task, and test documents
design/                UI specs and screenshots
```

## Tests / 测试

Run static contract tests:

```powershell
powershell -ExecutionPolicy Bypass -File tests\run-static-tests.ps1
```

Run browser behavior tests:

```powershell
powershell -ExecutionPolicy Bypass -File tests\run-browser-tests.ps1
```

## Development Package / 开发包

The developer-mode zip package is generated at:

开发者模式安装包生成位置：

```text
dist/html-ppt-editor-dev-v0.1.0.zip
```

The zip is a local test artifact. For open source development, load the repository folder directly in Chrome.

该 zip 是本地测试产物。开源开发时，建议直接在 Chrome 中加载仓库目录。

## Open Source Status / 开源状态

This repository is prepared for public GitHub release, but the project is still an early prototype. Before a formal release, validate it with the target 15 real HTML PPT samples.

本仓库已按公开 GitHub 项目整理，但目前仍是早期原型。正式发布前，需要用目标 15 个真实 HTML PPT 样本完成验证。

## License / 许可证

MIT. See [LICENSE](LICENSE).
