# Explorer Copy Path to Copilot Chat

## What It Does

Adds an Explorer context-menu command for files that sends the selected file's absolute path into the GitHub Copilot Chat input. Enhances developer productivity by streamlining the process of sharing file paths in Copilot Chat.

## Commands

| Command | Title |
|---------|-------|
| `cvs.explorer.copyPathToCopilotChat` | Explorer: Copy File Path to Copilot Chat |

## Internal Architecture

The feature is implemented as a VS Code extension command:

- **Command ID**: `cvs.explorer.copyPathToCopilotChat`
- **Activation**: Triggered via the Explorer context menu for files.
- **Behavior**:
  - If direct insertion into Copilot Chat is supported, the file path is sent directly.
  - If not, the file path is copied to the clipboard for manual pasting.

The command uses the VS Code API to interact with the Explorer context menu and the clipboard.

## Manual Test

1. Reload the extension host.
2. In Explorer, right-click any file.
3. Click **Explorer: Copy File Path to Copilot Chat**.
4. Confirm Copilot Chat opens with the absolute file path prefilled.
5. If direct insertion is unavailable in the current VS Code/Copilot build:
   - Confirm the path is copied to the clipboard.
   - Paste the path into Copilot Chat using `Ctrl+V`.

---
docid: 150.1.explorer-copy-path-to-chat-readme
id: explorer-copy-path-to-chat
title: Explorer Copy Path to Copilot Chat
project: cielovista-tools
description: Add an Explorer context-menu command for files that sends the selected file's absolute path into the GitHub Copilot Chat input.
status: active
tags: [copy, cvs.explorer.copyPathToCopilotChat, explorer, path]
category: 150.1 — Components / Features
created: 2026-04-22
updated: 2026-05-21
version: 1.0.0
author: CieloVista Software
relativepath: src/features/explorer-copy-path-to-chat.README.md
---