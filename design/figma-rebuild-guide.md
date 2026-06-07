# Figma Rebuild Guide

本文件用于后续将效果图重建为正式 Figma 设计文件。

## 1. 不建议直接使用截图作为设计稿

截图只能作为视觉参考。正式交付需要将界面拆成可编辑图层和组件，否则开发侧无法准确读取间距、尺寸、颜色和状态。

## 2. 建议 Frame

在 Figma 中创建以下 Frame：

1. `01 Plugin Popup`
2. `02 Editor - Selected State`
3. `03 Editor - Text Editing State`
4. `04 Preview - Export Confirm`

## 3. 建议组件

### 基础组件

- Button / Primary
- Button / Secondary
- IconButton / Default
- IconButton / Active
- IconButton / Danger
- Input / Number
- Select
- ColorSwatch
- Tabs
- CollapseSection
- Modal
- StatusItem

### 业务组件

- AppTopBar
- BrowserFrame
- CanvasViewport
- SlideMock
- ToolRail
- PropertyPanel
- SideWorkspace
- SelectionBox
- EditingBox
- ExportModal
- PluginPopup

## 4. Auto Layout 建议

- TopBar：水平 Auto Layout。
- SideWorkspace：水平 Auto Layout，内部 ToolRail + PropertyPanel。
- ToolRail：垂直 Auto Layout。
- PropertyPanel：垂直 Auto Layout，分组使用 CollapseSection。
- ExportModal：垂直 Auto Layout。
- PluginPopup：垂直 Auto Layout。

## 5. Tokens 映射

从 `design-tokens.json` 导入以下类型：

- colors
- font
- spacing
- radius
- shadow
- layout

## 6. 命名规范

建议命名：

```txt
Product / HTML-PPT Editor
Screen / 01 Plugin Popup
Screen / 02 Editor Selected
Screen / 03 Editor Text Editing
Screen / 04 Preview Export

Component / Button / Primary
Component / ToolRail / IconButton
Component / Panel / PropertySection
Component / Overlay / SelectionBox
Component / Overlay / EditingBox
```

## 7. 设计交付注意事项

- 所有中文文案保持可编辑文本，不要栅格化。
- Icon 尽量使用统一图标库。
- 截图中的 HTML PPT 内容仅用于视觉示例，开发实现中应承载真实页面。
- 保持侧边工作区与画布并列，不做浮层覆盖。
- 明确选中态和编辑态的颜色区别。
