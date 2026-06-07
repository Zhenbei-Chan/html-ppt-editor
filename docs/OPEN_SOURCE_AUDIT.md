# Open Source Audit

## Conclusion

HTML-PPT Editor is ready to be shared on GitHub as an early prototype.

It should not be described as a stable production release yet. The remaining release gate is validation against 15 real AI-generated HTML PPT samples.

## Function Coverage

Covered in the current version:

- Open local `.html` and `.htm` files from the extension popup.
- Edit the current Chrome page when browser permissions allow it.
- Select and edit rendered text.
- Change text style: font, size, color, bold, and alignment.
- Move and resize positioned elements.
- Add, copy, and reversibly delete text boxes.
- Navigate multi-page HTML PPT files through a left thumbnail rail.
- Reorder and delete detected pages from the thumbnail rail.
- Show a temporary minimap for long HTML pages while scrolling.
- Save local drafts in IndexedDB.
- Undo/redo within the current editing session.
- Preview before exporting.
- Export modified HTML.
- Export full-deck image-based PDF inside the extension.

Out of scope for the current version:

- AI rewriting or AI layout editing.
- Account system, cloud sync, or team collaboration.
- PPTX export.
- Full offline repackaging of external assets.
- Complex multi-select, grouping, or batch editing.
- First-class image replacement workflow.

## Design Coverage

Current UI follows the agreed layout:

- Top title area for product name, filename, save, undo, and redo.
- Original webpage display window as an independent editing viewport.
- Right-side compact quick toolbar and collapsible property panel.
- Bottom status bar for draft state, page selector, change count, zoom, and fullscreen.
- Left thumbnail rail only for multi-page PPT.
- Temporary minimap only for long HTML pages while scrolling or hovering.

Known design risk:

- Real-world HTML PPT files may use highly custom CSS, fixed layers, icon fonts, or dynamic scripts that require sample-specific polish.

## File Readiness

Public-facing files are present:

- `README.md`
- `INSTALL_DEV.md`
- `LICENSE`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `manifest.json`
- `assets/icons/*`
- `tests/*`
- `design/*`

Internal workflow files exist locally. Some early Chinese notes are legacy artifacts with encoding issues and should not be treated as official external documentation until cleaned.

## Verification

Last automated checks:

```powershell
powershell -ExecutionPolicy Bypass -File tests\run-static-tests.ps1
powershell -ExecutionPolicy Bypass -File tests\run-browser-tests.ps1
```

Result:

- Static contract tests: PASS.
- Browser behavior tests: PASS.

## GitHub Publishing Recommendation

Recommended repository:

```text
Zhenbei-Chan/html-ppt-editor
```

Recommended visibility:

```text
Public
```

Recommended release label:

```text
v0.1.0-alpha
```

Recommended positioning:

```text
Early prototype for visually editing AI-generated HTML PPT files.
```
