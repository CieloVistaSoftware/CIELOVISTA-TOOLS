---
title: feature: css-class-hover.ts
description: Hover over a CSS class name in HTML, JSX, or TSX and instantly see the CSS rule definition in a hover popup — without switching files. Resolves imp…
project: cielovista-tools
category: 700 — Project Docs
relativePath: src/features/css-class-hover.README.md
created: 2026-04-22
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
status: active
tags: [css, class, hover]
---

# feature: css-class-hover.ts

## What it does

Hover over a CSS class name in HTML, JSX, or TSX and instantly see the CSS rule definition in a hover popup — without switching files. Resolves `import './styles.css'` imports relative to the current document to find the actual CSS.

---

## Supported languages

`html`, `javascript`, `javascriptreact`, `typescript`, `typescriptreact`

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.cssClassHover.enable`](command:cvs.cssClassHover.enable) | CSS Class Hover: Enable (informational only — always active) |

---

## Internal architecture

```
activate()
  └── registerHoverProvider([supported languages], hoverProvider)

hoverProvider.provideHover(document, position)
  └── scan current line for className="..." pattern
  └── determine which class name the cursor is over
  └── resolveCssFromImports(document)
       └── find all import './foo.css' statements
       └── read each CSS file from disk (relative to document)
       └── concatenate all content
  └── findCssRule(css, className)
       └── regex: \.className\s*{[^}]*}
  └── return Hover with formatted CSS or "not found" message
```

### CSS resolution detail

The provider scans the entire document text for CSS `import` statements matching:

```
import ['"]path/to/file.css['"]
```

Each resolved file is read synchronously and concatenated. This is fast enough for hover because hover providers are called lazily on mouse-over.

---

## Known limitations

- Only resolves imports at the top level of the current file. CSS imported in parent components or via CSS modules with `:local` is not resolved.
- Class names with dynamic values (template literals, variables) cannot be resolved.
- Only the `className=` attribute is scanned. Plain `class=` in HTML is not currently supported.
- Does not support CSS-in-JS (styled-components, emotion, etc.).

---

## Manual test

1. Open a React TSX file that imports a CSS file.
2. Hover over a class name in a `className="..."` attribute.
3. A hover popup should appear showing the matching CSS rule.
4. Hover over a class name that doesn't exist in any import — popup should say "No CSS rule found".
