---
title: feature: html-template-downloader.ts
description: Downloads HTML starter templates from the CieloVistaSoftware GitHub repository into your workspace. Also provides a utility to open any path curren…
project: cielovista-tools
category: 700 — Project Docs
relativePath: src/features/html-template-downloader.README.md
created: 2026-04-22
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
status: active
tags: [html, template, downloader]
---

# feature: html-template-downloader.ts

## What it does

Downloads HTML starter templates from the CieloVistaSoftware GitHub repository into your workspace. Also provides a utility to open any path currently on the clipboard in Windows Explorer (or the OS file manager).

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.htmlTemplates.download`](command:cvs.htmlTemplates.download) | HTML Template: Download |
| [`cvs.htmlTemplates.openClipboardPath`](command:cvs.htmlTemplates.openClipboardPath) | HTML Template: Open Clipboard Path |

---

## Available templates

Templates are defined in the `TEMPLATES` constant at the top of the file. To add a new template, add an entry there — no other changes needed.

| Label | File | Description |
|---|---|---|
| Starter Page | `starter.html` | Minimal HTML5 boilerplate |
| Dashboard | `dashboard.html` | Admin dashboard layout |
| Landing Page | `landing.html` | Marketing landing page |
| Component Playground | `playground.html` | WB component test page |

All files are fetched from:
```
https://raw.githubusercontent.com/CieloVistaSoftware/htmltemplates/main/{file}
```

---

## Internal architecture

```
downloadTemplate()
  └── showQuickPick(TEMPLATES)
  └── showSaveDialog() → user picks save location
  └── withProgress('Downloading…')
       └── fetchUrl(REPO_RAW_BASE + template.file)
            └── https.get() → Promise<string>
       └── fs.writeFileSync(saveUri.fsPath, content)
       └── openTextDocument(saveUri) → showTextDocument()

openClipboardPath()
  └── clipboard.readText()
  └── validate path exists on disk
  └── getActiveOrCreateTerminal()
  └── terminal.sendText('explorer "path"')  [Windows]
      terminal.sendText('open "path"')      [macOS]
      terminal.sendText('xdg-open "path"')  [Linux]
```

---

## Adding a new template

1. Add the template file to the `CieloVistaSoftware/htmltemplates` GitHub repo.
2. Add an entry to the `TEMPLATES` array in this file:

```typescript
{ label: 'My New Template', file: 'my-template.html', description: 'What it does' },
```

No other changes needed. The download URL is constructed automatically.

---

## Manual test

1. Run `HTML Template: Download`.
2. Select "Starter Page" from the quick-pick.
3. Choose a save location.
4. File should download and open in the editor.
5. Copy a valid folder path to clipboard, run `HTML Template: Open Clipboard Path` — Explorer should open to that folder.
