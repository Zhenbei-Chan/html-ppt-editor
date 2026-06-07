# HTML-PPT Editor Design Handoff

本目录是交给 Codex / AI 编程工具的 UI 设计交接包。目标是把已生成的界面效果图转化为可执行的开发输入。

## 使用方式

建议在 Codex 中按以下顺序阅读：

1. `screen-spec.md`
2. `components.md`
3. `interaction-spec.md`
4. `design-tokens.json`
5. `acceptance-checklist.md`
6. `codex-prompt.md`
7. `screenshots/*.png`

## 文件说明

| 文件 | 用途 |
|---|---|
| `design-tokens.json` | 颜色、字体、圆角、间距、阴影、布局尺寸 |
| `screen-spec.md` | 关键界面说明 |
| `components.md` | 组件拆分和状态说明 |
| `interaction-spec.md` | 交互规则 |
| `acceptance-checklist.md` | UI 和交互验收清单 |
| `codex-prompt.md` | 可直接复制给 Codex 的开发提示词 |
| `figma-rebuild-guide.md` | 后续转 Figma 设计稿的重建说明 |
| `screenshots/` | 当前生成的 UI 效果图参考 |

## 设计目标

HTML-PPT Editor 第一版界面服务于“直接改 HTML PPT”，不是网页管理后台，也不是复杂设计软件。

核心原则：

- 页面内容优先，不让工具遮挡主要编辑区。
- 高频操作可见，低频操作收纳。
- 编辑态、选中态、预览态必须清晰区分。
- 操作尽量图形化，减少大段文字按钮。
- 样式克制，接近演示文稿编辑器，而不是普通网页表单。

## 当前包含的界面

1. 插件弹窗
2. 编辑器选中态
3. 编辑器文字编辑态
4. 预览与导出确认态

## 开发边界

第一版不要扩展以下能力：

- AI 辅助改稿
- 账号体系
- 云同步
- 图片替换
- PDF / PPTX / 图片导出
- 多选、组合、批量对齐、批量移动
- 完整图层面板
- 复杂吸附线
- 模板库
- 团队协作
