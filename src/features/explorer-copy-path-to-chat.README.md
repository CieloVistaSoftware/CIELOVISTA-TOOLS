---
title: Explorer Copy Path to Copilot Chat
description: Add an Explorer context-menu command for files that sends the selected file's absolute path into the GitHub Copilot Chat input.
project: cielovista-tools
category: 700 — Project Docs
relativePath: src/features/explorer-copy-path-to-chat.README.md
created: 2026-04-22
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
status: active
tags: [explorer, copy, path]
---

# Explorer Copy Path to Copilot Chat

## Purpose

Add an Explorer context-menu command for files that sends the selected file's absolute path into the GitHub Copilot Chat input.

## Command

- `cvs.explorer.copyPathToCopilotChat`

## Menu Contribution

- `explorer/context` (shown only for files)

## Test Steps

1. Reload the extension host.
2. In Explorer, right-click any file.
3. Click **Explorer: Copy File Path to Copilot Chat**.
4. Confirm Copilot Chat opens with the absolute file path prefilled.
5. If direct insertion is unavailable in the current VS Code/Copilot build, confirm the path is copied to clipboard and paste works with `Ctrl+V`.
