---
id: feature-doc-header
title: "Feature: Doc Header"
description: "Gives documentation files the three-field header (id, title, description at the top) across all registered projects, keeping every body intact."
---

# Feature: Doc Header

## What it does

Gives markdown files the doc header contract: **id, title and description, at the top of the file** (#707, #708).

- **Headers: Add/Fix All Headers** opens a compliance panel for every registered project and rewrites every non-compliant header after one confirmation.
- **Headers: Fix Headers in One Project** does the same for one project.
- **Headers: Fix Header in Current File** fixes the open file.
- **Headers: View Frontmatter Standard** states the rule.

A fix keeps any existing id, title and description, derives missing ones from the file name, first heading and first paragraph, and drops every other header field. **The body is never changed.** Before #730 this feature wrote the retired 13-field block. Its parser also read a horizontal rule in the body as the start of the header, so a "fix" could delete everything below the rule. Reading and writing now go through `src/shared/doc-frontmatter.ts`, which accepts a block at the bottom only when every line in it is a field.

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.headers.fixAll`](command:cvs.headers.fixAll) | Headers: Add/Fix All Headers |
| [`cvs.headers.fixOne`](command:cvs.headers.fixOne) | Headers: Fix Headers in One Project |
| [`cvs.headers.fixFile`](command:cvs.headers.fixFile) | Headers: Fix Header in Current File |
| [`cvs.headers.viewStandard`](command:cvs.headers.viewStandard) | Headers: View Frontmatter Standard |

---

## Internal architecture

```text
activate(context)
  └── registers 0 command(s)

```

---

## Manual test

1. Open a workspace with the CieloVista Tools extension active.
2. Verify Doc Header activates without errors in the Output channel.
