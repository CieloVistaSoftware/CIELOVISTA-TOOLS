# Feature: NPM Command Launcher

## Commands

| Command ID | Title |
|---|---|
_No commands registered — utility/shared module._

## What it does

Adds a `NPM Cmds` button to the VS Code status bar. When clicked, it discovers every npm script across all workspace `package.json` files and lets you pick one to run immediately in the terminal. Supports custom per-script descriptions so the picker is self-documenting.

---
| [`cvs.npm.showAndRunScripts`](command: cvs.npm.showAndRunScripts) | NPM Scripts: Show and Run |
| [`cvs.npm.addScriptDescription`](command: cvs.npm.addScriptDescription) | NPM Scripts: Add/Edit Description |
- Use [`cvs.npm.addScriptDescription`](command: cvs.npm.addScriptDescription) to add or edit a description from the UI.
└── createStatusBarItem('NPM Cmds') → command: cvs.npm.showAndRunScripts
└── forEach file: readFileSync → JSON.parse → extract scripts{}
label: script name
description: Adds a NPM Cmds button to the VS Code status bar. When clicked, it discovers every npm script across all workspace package.json files and lets you …
detail: package path + raw npm command
3. Run [`cvs.npm.addScriptDescription`](command: cvs.npm.addScriptDescription), pick a script, type a description. Open the picker again — the description should now appear under the script name.
docid: 150.1.npm-command-launcher-readme
id: feature-npm-command-launcher
title: Feature: NPM Command Launcher
project: cielovista-tools
status: active
tags: [command, cvs.npm.addScriptDescription, cvs.npm.showAndRunScripts, launcher, npm]
category: 150.1 — Components / Features
created: 2026-04-22
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
relativepath: src/features/npm-command-launcher.README.md
---