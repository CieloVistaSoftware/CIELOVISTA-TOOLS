# Feature: Doc Header Scan

## Commands

| Command ID | Title | Keybinding |
|---|---|---|
| `cvs.headers.scan` | Headers: Scan Doc Header Compliance | — |
| `cvs.headers.scanAuto` | Headers: Scan + Auto-Fix Frontmatter Position | — |

## What it does

Scans all markdown files in registered projects for YAML frontmatter compliance, checking for required fields (title, description, project, category, relativePath, created, updated, author, status, tags). Logs results to the CieloVista Tools output channel grouped by project, making it easy to spot docs missing required metadata.

---
| [`cvs.headers.scan`](command: cvs.headers.scan) | Headers: Scan |
└── Headers: Scan → cvs.headers.scan
**Key internal functions: **
1. Open the Command Palette and run **Headers: Scan** (`cvs.headers.scan`).
docid: 150.1.doc-header-scan
id: feature-doc-header-scan
title: Feature: Doc Header Scan
project: cielovista-tools
description: Doc Header Scan — 1 command(s). Auto-generated stub: fill in What it does and Manual test.
status: active
tags: [cvs.headers.scan, doc, header, scan]
category: 150.1 — Components / Features
created: 2026-05-15
updated: 2026-05-15
version: 1.0.0
author: CieloVista Software
relativepath: src/features/doc-header-scan.README.md
---