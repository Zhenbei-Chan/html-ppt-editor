# HTML-PPT Editor

Language: [Chinese](README.zh-CN.md)

HTML-PPT Editor is an early prototype Chrome extension for visually editing AI-generated single-file HTML presentations. It lets users open an `.html` or `.htm` file, click rendered content, make lightweight edits, and export a new HTML file or a full-deck PDF.

## Features

- Open local `.html` and `.htm` files from the extension popup.
- Edit the current Chrome page when browser permissions allow it.
- Select and edit rendered text blocks, cards, navigation text, and positioned elements.
- Change text content, font size, font family, color, bold state, and alignment.
- Move and resize already-positioned elements.
- Enable free positioning for normal document-flow text blocks when needed.
- Add, copy, and reversibly delete text boxes.
- Show a left thumbnail rail for multi-page presentations, with page switching, drag sorting, and page deletion.
- Show a temporary long-page minimap while scrolling, with a lightweight page structure preview and draggable viewport indicator.
- Move ordered-list items up and down while preserving standard numbering on export.
- Keep a local draft in IndexedDB and support undo/redo during the current editing session.
- Preview before exporting HTML.
- Export a full-document image-based PDF inside the extension with progress feedback.

## Current Scope

This project focuses on lightweight editing of existing HTML presentations. It does not try to become a full PowerPoint replacement.

Not included in the current version:

- AI-assisted rewriting or layout generation.
- Cloud sync, accounts, team collaboration, or remote storage.
- PPTX export.
- Complex multi-select, grouping, or batch editing.
- Full offline repackaging of external assets.
- Image replacement as a first-class feature.

## PDF Export Notes

PDF export does not use Chrome's system print preview. The extension captures each detected slide/page and writes it into one PDF through local browser-side libraries.

Known limitations:

- The generated PDF is image-based; text in the PDF is not selectable.
- Some advanced CSS, filters, blend modes, icon fonts, remote images, or cross-origin resources may render differently.
- Real sample validation is still required before a stable release.

## Installation For Development

1. Download or clone this repository.
2. Open Chrome and go to `chrome://extensions/`.
3. Enable Developer mode.
4. Click "Load unpacked".
5. Select this project folder.

If you want to edit local pages already opened with `file://`, enable "Allow access to file URLs" in the extension details page.

## Project Structure

```text
manifest.json          Chrome extension manifest
popup.html/js/css      Extension popup entry
editor.html/js/css     Editor shell
editor-core.js         Main editing and export logic
vendor/                Local browser-side PDF dependencies
assets/icons/          Extension icons
tests/                 Static and browser behavior tests
docs/                  Project status and release audit docs
design/                UI specs and screenshots
```

## Tests

Run static contract tests:

```powershell
powershell -ExecutionPolicy Bypass -File tests\run-static-tests.ps1
```

Run browser behavior tests:

```powershell
powershell -ExecutionPolicy Bypass -File tests\run-browser-tests.ps1
```

## Development Package

The developer-mode zip package is generated at:

```text
dist/html-ppt-editor-dev-v0.1.0.zip
```

The zip is a local test artifact. For open source development, load the repository folder directly in Chrome.

## Open Source Status

This repository is prepared for public GitHub release, but the project is still an early prototype. Before a stable release, validate it with the target 15 real HTML PPT samples.

## License

MIT. See [LICENSE](LICENSE).
