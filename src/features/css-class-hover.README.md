# feature: css-class-hover.ts

## Commands

| Command ID | Title | Keybinding |
|---|---|---|
| `cvs.cssClassHover.enable` | CSS Class Hover: Enable | — |

## What it does

Hover over a CSS class name in HTML, JSX, or TSX and instantly see the CSS rule definition in a hover popup — without switching files. Resolves `import './styles.css'` imports relative to the current document to find the actual CSS.

---
| [`cvs.cssClassHover.enable`](command: cvs.cssClassHover.enable) | CSS Class Hover: Enable (informational only — always active) |
└── regex: \.className\s*{[^}]*}
- Only resolves imports at the top level of the current file. CSS imported in parent components or via CSS modules with `: local` is not resolved.
docid: 150.1.css-class-hover-readme
id: feature-css-class-hoverts
title: feature: css-class-hover.ts
project: cielovista-tools
description: Hover over a CSS class name in HTML, JSX, or TSX and instantly see the CSS rule definition in a hover popup — without switching files. Resolves imp…
status: active
tags: [class, css, cvs.cssClassHover.enable, hover]
category: 150.1 — Components / Features
created: 2026-04-22
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
relativepath: src/features/css-class-hover.README.md
---