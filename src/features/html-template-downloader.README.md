# feature: html-template-downloader.ts

## Commands

| Command ID | Title | Keybinding |
|---|---|---|
| `cvs.htmlTemplates.download` | HTML Template: Download | — |
| `cvs.htmlTemplates.openClipboardPath` | HTML Template: Open Clipboard Path | — |

## What it does

Downloads HTML starter templates from the CieloVistaSoftware GitHub repository into your workspace. Also provides a utility to open any path currently on the clipboard in Windows Explorer (or the OS file manager).

---
| [`cvs.htmlTemplates.download`](command: cvs.htmlTemplates.download) | HTML Template: Download |
| [`cvs.htmlTemplates.openClipboardPath`](command: cvs.htmlTemplates.openClipboardPath) | HTML Template: Open Clipboard Path |
https: //raw.githubusercontent.com/CieloVistaSoftware/htmltemplates/main/{file}
{ label: My New Template', file: 'my-template.html', description: 'What it does' },
1. Run `HTML Template: Download`.
5. Copy a valid folder path to clipboard, run `HTML Template: Open Clipboard Path` — Explorer should open to that folder.
docid: 150.1.html-template-downloader-readme
id: feature-html-template-downloaderts
title: feature: html-template-downloader.ts
project: cielovista-tools
description: Downloads HTML starter templates from the CieloVistaSoftware GitHub repository into your workspace. Also provides a utility to open any path curren…
status: active
tags: [cvs.htmlTemplates.download, cvs.htmlTemplates.openClipboardPath, downloader, html, template]
category: 150.1 — Components / Features
created: 2026-04-22
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
relativepath: src/features/html-template-downloader.README.md
---