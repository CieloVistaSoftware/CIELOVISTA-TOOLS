# feature: openai-chat.ts

## Commands

| Command ID | Title | Keybinding |
|---|---|---|
| `cvs.openai.explain` | OpenAI: Explain Code | — |
| `cvs.openai.refactor` | OpenAI: Refactor Code | — |
| `cvs.openai.generateDocstring` | OpenAI: Generate Docstring | — |
| `cvs.openai.openChat` | OpenAI: Open Chat Panel | — |

## What it does

Adds OpenAI-powered commands to VS Code: explain selected code, suggest refactoring, generate a JSDoc docstring, and open a persistent chat panel. All four commands share a single `callOpenAI()` helper — no duplicated fetch logic anywhere.

---
| [`cvs.openai.explain`](command: cvs.openai.explain) | OpenAI: Explain Code | `Ctrl+I` (editor focused) |
| [`cvs.openai.refactor`](command: cvs.openai.refactor) | OpenAI: Refactor Code | — |
| [`cvs.openai.generateDocstring`](command: cvs.openai.generateDocstring) | OpenAI: Generate Docstring | `Ctrl+Alt+D` (editor focused) |
| [`cvs.openai.openChat`](command: cvs.openai.openChat) | OpenAI: Open Chat Panel | — |
| `cielovistaTools.openai.model` | enum | `gpt-4o` | Model: `gpt-4o`, `gpt-4-turbo`, `gpt-3.5-turbo` |
└── webview posts { command: send', text }
└── posts { command: reply', text } back to webview
The chat panel maintains a `history: OpenAIMessage[]` array in the closure of `openChatPanel()`. Each user message is appended before calling the API; each assistant reply is appended after. This gives the model full conversation context for follow-up questions.
4. Run `OpenAI: Open Chat Panel`, type a question — reply should appear in the panel.
docid: 150.1.openai-chat-readme
id: feature-openai-chatts
title: feature: openai-chat.ts
project: cielovista-tools
description: Adds OpenAI-powered commands to VS Code: explain selected code, suggest refactoring, generate a JSDoc docstring, and open a persistent chat panel. …
status: active
tags: [chat, cvs.openai.explain, cvs.openai.generateDocstring, cvs.openai.openChat, cvs.openai.refactor, openai, readme]
category: 150.1 — Components / Features
created: 2026-04-22
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
relativepath: src/features/openai-chat.README.md
---