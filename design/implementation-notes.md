# Implementation Notes

## 推荐实现顺序

1. 先实现 AppShell 布局：
   - TopBar
   - CanvasViewport
   - SideWorkspace
   - StatusBar

2. 再实现 SideWorkspace：
   - ToolRail
   - PropertyPanel
   - 分组折叠

3. 再实现编辑辅助层：
   - SelectionBox
   - EditingBox
   - ResizeHandles

4. 再实现模式切换：
   - select
   - edit text
   - insert text box
   - preview

5. 最后实现导出确认：
   - PreviewHeader
   - ExportModal
   - 清理编辑器注入内容

## 建议 CSS 架构

可以用 CSS 变量承接 `design-tokens.json`：

```css
:root {
  --he-primary: #1677ff;
  --he-text-primary: #0a1a33;
  --he-border: #e5eaf0;
  --he-canvas-bg: #f6f8fb;
  --he-edit-state: #ff8a00;
  --he-danger: #e5484d;
  --he-side-workspace-width: 392px;
  --he-tool-rail-width: 72px;
}
```

## 关键 CSS 类名建议

```txt
.he-app-shell
.he-top-bar
.he-canvas-viewport
.he-side-workspace
.he-tool-rail
.he-tool-button
.he-tool-button--active
.he-tool-button--danger
.he-tool-button--primary
.he-property-panel
.he-property-tabs
.he-property-section
.he-status-bar
.he-selection-box
.he-editing-box
.he-resize-handle
.he-preview-header
.he-export-modal
.he-plugin-popup
```

## 风险提醒

- 不要让属性面板变成 fixed 浮层压住画布。
- 不要在导出 HTML 时带上 `.he-*` 编辑器 DOM。
- 不要让编辑态快捷键误触原页面翻页。
- 不要因为拖拽普通文档流元素导致页面布局大面积错乱。
