$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$core = Get-Content -Raw -Encoding UTF8 (Join-Path $root "editor-core.js")
$popup = Get-Content -Raw -Encoding UTF8 (Join-Path $root "popup.html")
$editor = Get-Content -Raw -Encoding UTF8 (Join-Path $root "editor.html")
$editorJs = Get-Content -Raw -Encoding UTF8 (Join-Path $root "editor.js")
$readme = Get-Content -Raw -Encoding UTF8 (Join-Path $root "README.md")
$manifest = Get-Content -Raw (Join-Path $root "manifest.json") | ConvertFrom-Json
$readmeContainsEnglishAndChinese = $readme.Contains("HTML-PPT Editor is a Chrome extension") -and $readme.Contains("Features /") -and $readme.Contains("Installation For Development /") -and $readme.Contains("License /")

$results = New-Object System.Collections.Generic.List[object]

function Add-Result($name, $pass, $detail = "") {
  $results.Add([pscustomobject]@{
    name = $name
    pass = [bool]$pass
    detail = $detail
  })
}

Add-Result "manifest_mv3" ($manifest.manifest_version -eq 3)
Add-Result "manifest_icons_exist" (
  $manifest.icons.'16' -eq "assets/icons/icon16.png" -and
  $manifest.icons.'32' -eq "assets/icons/icon32.png" -and
  $manifest.icons.'48' -eq "assets/icons/icon48.png" -and
  $manifest.icons.'128' -eq "assets/icons/icon128.png" -and
  (Test-Path (Join-Path $root "assets/icons/icon16.png")) -and
  (Test-Path (Join-Path $root "assets/icons/icon32.png")) -and
  (Test-Path (Join-Path $root "assets/icons/icon48.png")) -and
  (Test-Path (Join-Path $root "assets/icons/icon128.png"))
)
Add-Result "no_broad_host_permissions" (-not ($manifest.PSObject.Properties.Name -contains "host_permissions"))
Add-Result "uses_active_tab" ($manifest.permissions -contains "activeTab")
Add-Result "exports_editor_factory" ($core -match "window\.createHtmlPptEditor\s*=\s*createHtmlPptEditor")
Add-Result "side_workspace_default_exists" ($core -match "--hpe-side-width:\s*352px" -and $core -match "--hpe-panel-width:\s*288px" -and $core -match "--hpe-rail-width:\s*64px" -and $core -match "hpe-shell-layout")
Add-Result "toolbar_uses_css_mask_icons" ($core -match 'mask: var\(--hpe-icon\)' -and $core -match 'button\[data-action="preview"\]')
Add-Result "toolbar_uses_icon_text_labels" (($core -match 'data-action="edit" type="button" title=') -and ($core -match 'data-action="exportPreview" class="primary"') -and $core -match "font-size:\s*10px")
Add-Result "editor_shell_bars_exist" ($core -match "hpe-appbar" -and $core -match "hpe-statusbar" -and $core -match "hpe-previewbar")
Add-Result "export_modal_chinese_exists" ($core -match "hpe-export-modal" -and $core -match "&#23548;&#20986;&#30830;&#35748;" -and $core -match "&#23548;&#20986; HTML")
Add-Result "later_ui_controls_use_icon_treatment" ($core -match 'data-action="fullscreen" class="hpe-icon-button hpe-icon-only"' -and $core -match 'data-action="exportPdf" class="hpe-icon-button"' -and $core -match 'data-action="zoomOut" class="hpe-icon-button hpe-icon-only"')
Add-Result "top_title_removes_duplicate_export_actions" (-not ($core -match 'hpe-appbar-actions"[\s\S]{0,500}data-action="exportPdf"') -and -not ($core -match 'hpe-appbar-actions"[\s\S]{0,500}data-action="exportPreview"'))
Add-Result "export_modal_has_no_emoji_icons" (-not ($core -match "&#128424;|&#128190;") -and $core -match "hpe-modal-icon")
Add-Result "statusbar_page_selector_exists" ($core -match 'data-field="statusSlide"' -and $core -match "ui\.fields\.statusSlide\.addEventListener")
Add-Result "editor_top_nav_removed" (-not ($editor -match "appbar|openFile|fileInput|sampleSlides|sampleLong") -and $editor -match "previewFrame")
Add-Result "popup_direct_file_picker_exists" ($popup -match "popupFileInput" -and $editorJs -match "hpe:pendingFile")
Add-Result "panel_side_tab_exists" ($core -match "hpe-panel-tab")
Add-Result "panel_draggable_exists" ($core -match "function startPanelDrag" -and $core -match "function onPanelDrag")
Add-Result "contenteditable_outline_removed" ($core -match "outline:\s*none\s*!important")
Add-Result "arrow_keys_stop_page_handlers" ($core -match "stopImmediatePropagation\(\);\s*\r?\n\s*nudge")
Add-Result "draft_save_preserves_editing" ($core -match "getCleanHtml\(\{\s*preserveEditing:\s*true\s*\}\)" -and $core -match "if \(!options\.preserveEditing\) endTextEdit")
Add-Result "export_removes_ui_marker" ($core.Contains('querySelectorAll(`[${UI}], #hpe-editor-style`)'))
Add-Result "export_removes_internal_id" ($core.Contains('querySelectorAll(`[${ID}]`)'))
Add-Result "export_removes_free_position_marker" ($core.Contains('querySelectorAll(`[${FREE}]`)'))
Add-Result "export_stabilizes_editor_absolute_positions" ($core -match "stabilizeExportedPositionStyles" -and $core -match "shouldCleanExportedPosition" -and $core -match "POSITION_ORIGIN")
Add-Result "floating_layers_adapt_to_editor_viewport" ($core.Contains("adaptFloatingElements") -and $core.Contains('["fixed", "sticky"].includes(styles.position)') -and $core.Contains("sideWorkspaceWidth") -and $core.Contains("restoreFloatingElements"))
Add-Result "export_removes_floating_marker" ($core -match "data-hpe-floating-adapted" -and $core.Contains('querySelectorAll(`[${FLOATING}]`)'))
Add-Result "pdf_vendor_scripts_are_local" ($editor -match "vendor/html2canvas\.min\.js" -and $editor -match "vendor/jspdf\.umd\.min\.js" -and (Test-Path (Join-Path $root "vendor/html2canvas.min.js")) -and (Test-Path (Join-Path $root "vendor/jspdf.umd.min.js")))
Add-Result "pdf_export_direct_exists" ($core -match "async function exportPdf" -and $core -match "getPdfLibraries" -and $core -match "html2canvas" -and $core -match "new libs\.jsPDF" -and $core -match "pdf\.save")
Add-Result "pdf_export_avoids_browser_print" (-not $core.Contains("printWindow.print()") -and -not $core.Contains('win.open("", "_blank")'))
Add-Result "pdf_export_has_progress_ui" ($core -match "hpe-progress-backdrop" -and $core -match "pdfProgressBar" -and $core -match "showPdfProgress" -and $core -match "updatePdfProgress")
Add-Result "pdf_export_full_deck_default" ($core.Contains("exportPdf: () => exportPdf({ currentOnly: false })") -and $core.Contains("getPdfSources(currentOnly)"))
Add-Result "pdf_export_preserves_page_size" ($core -match "getPdfPageSize" -and $core.Contains("format: [pageSize.width, pageSize.height]") -and $core.Contains("windowWidth: pageSize.width"))
Add-Result "pdf_progress_copy_is_stable" (-not $core.Contains("\u5df2\u5b8c\u6210") -and $core.Contains("\u6b63\u5728\u5904\u7406\u7b2c"))
Add-Result "opensource_docs_exist" ((Test-Path (Join-Path $root "LICENSE")) -and (Test-Path (Join-Path $root "CONTRIBUTING.md")) -and (Test-Path (Join-Path $root "SECURITY.md")) -and $readmeContainsEnglishAndChinese)
Add-Result "slide_thumbnail_navigation_exists" ($core -match "hpe-thumb-rail" -and $core -match "renderSlideThumbnails" -and $core -match "onThumbnailClick" -and $core -match "reorderSlides" -and $core -match "deleteSlide")
Add-Result "long_page_minimap_exists" ($core -match "hpe-minimap" -and $core -match "onEditorScroll" -and $core -match "onMinimapClick" -and $core -match "getScrollMetrics" -and $core -match "scheduleMinimapHide")
Add-Result "long_page_minimap_renders_page_structure" ($core -match "hpe-minimap-content" -and $core -match "collectMinimapNodes" -and $core -match "minimapNodeType" -and $core -match "hpe-minimap-node")
Add-Result "long_page_minimap_viewport_is_draggable" ($core -match "onMinimapPointerDown" -and $core -match "onMinimapPointerMove" -and $core -match "moveMinimapTo" -and $core -match "cursor: grab")
Add-Result "thumbnail_workspace_reserves_canvas_area" ($core -match "--hpe-thumb-width" -and $core -match "hpe-has-slide-thumbs" -and $core -match "margin-left: var\(--hpe-thumb-width\)")
Add-Result "thumbnail_collapse_and_context_delete_exists" ($core -match "toggleThumbnails" -and $core -match "hpe-thumbs-collapsed" -and $core -match "onThumbnailContextMenu" -and $core -match "deleteThumbPage" -and -not ($core -match "hpe-thumb-delete"))
Add-Result "header_logo_uses_extension_icon" ($core -match "logoUrl" -and $editorJs -match "assets/icons/icon32.png" -and $core -match "hpe-logo img")
Add-Result "page_selector_sync_lock_exists" ($core -match "syncSlideSelectors" -and $core -match "slideScrollLockUntil" -and $core -match "slideScrollTarget")
Add-Result "save_button_has_feedback" ($core -match 'saveDraft: \(\) => saveDraftNow\(\{ feedback: true \}\)' -and $core -match 'setSaveFeedback' -and $core -match 'data-field="saveFeedback"' -and $core -match 'draft_failed')
Add-Result "add_action_records_parent" ($core -match "type:\s*`"add`"[\s\S]*?parentId:\s*container\.getAttribute")
Add-Result "copy_action_records_parent" ($core -match "label:\s*`"[^`"]*`"[\s\S]*?parentId:\s*parent\.getAttribute")
Add-Result "redo_add_uses_parent" ($core -match "const parent = findById\(action\.parentId\) \|\| doc\.body")
Add-Result "popup_tool_entry_exists" ($popup -match "openEditor" -and $popup -match "editCurrent")
Add-Result "indexeddb_draft_store_exists" ($core -match "HtmlPptDraftStore" -and $core -match "indexedDB")

$results | ForEach-Object {
  $prefix = if ($_.pass) { "PASS" } else { "FAIL" }
  Write-Output "$prefix`t$($_.name)`t$($_.detail)"
}

$failed = @($results | Where-Object { -not $_.pass })
if ($failed.Count -gt 0) {
  throw "$($failed.Count) static contract test(s) failed."
}
