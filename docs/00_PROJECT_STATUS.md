# Project Status

## Current Stage

Testing and acceptance. The project is ready for public GitHub source sharing as an early prototype, not as a stable production release.

## Current Scope

- Chrome extension for visually editing existing single-file HTML PPT files.
- Main path: open local `.html` / `.htm` from the popup.
- Secondary path: edit the current Chrome page when permissions allow it.
- Export modified HTML and full-deck image-based PDF.
- Local-only draft storage; no account, cloud sync, AI editing, PPTX export, or team collaboration.

## Latest Completed Task

- `T-923`: Thumbnail rail collapse, thumbnail page deletion UX, header logo, and bottom page selector sync.

## Confirmed Open Source Files

- `README.md`
- `LICENSE`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `INSTALL_DEV.md`
- `manifest.json`
- `assets/icons/*`
- `vendor/html2canvas.min.js`
- `vendor/jspdf.umd.min.js`

## Last Verification

- Static contract tests: PASS.
- Browser behavior tests: PASS.
- Developer-mode package rebuilt at `dist/html-ppt-editor-dev-v0.1.0.zip`.

## Release Caveat

Before marking the product as stable, validate 15/15 real AI-generated HTML PPT samples. Current public release wording should say "early prototype".

Some early internal Chinese workflow notes are legacy artifacts and may require encoding cleanup before they are presented as official external documentation. Public entry points should be `README.md`, `INSTALL_DEV.md`, `CONTRIBUTING.md`, `SECURITY.md`, and `LICENSE`.

## Next Action

Initialize a GitHub repository, commit source files, and push to a public repo after confirming repository name and visibility.
