# Contributing

Thanks for your interest in HTML-PPT Editor.

## Development Rules

- Keep changes scoped to the current task.
- Do not add AI editing, cloud sync, accounts, PPTX export, image replacement, or multi-select unless the product docs are updated first.
- Preserve the original HTML presentation behavior as much as possible.
- Prefer small, reviewable patches.

## Local Checks

Run both checks before submitting a pull request:

```powershell
powershell -ExecutionPolicy Bypass -File tests\run-static-tests.ps1
powershell -ExecutionPolicy Bypass -File tests\run-browser-tests.ps1
```

## Manual Validation

For UI or export changes, test at least:

- Local `.html` file opened from the popup.
- Current page editing.
- Multi-page sample.
- Long-page sample.
- HTML export.
- PDF export.

## Reporting Issues

Please include:

- Browser and operating system.
- Whether the file is local or remote.
- A minimal HTML sample when possible.
- Screenshots of the editor view and exported result.
- Exported diagnostics if available.
