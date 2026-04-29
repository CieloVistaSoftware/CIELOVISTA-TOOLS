---
title: feature: shared/output-channel.ts
description: Single shared OutputChannel for the entire CieloVista Tools extension. Every feature writes here. Nobody creates their own channel. Why one channel…
project: cielovista-tools
category: 700 — Project Docs
relativePath: src/shared/output-channel.README.md
created: 2026-04-22
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
status: active
tags: [output, channel, readme]
---

# feature: shared/output-channel.ts

## Purpose

Single shared `OutputChannel` for the entire CieloVista Tools extension. Every feature writes here. Nobody creates their own channel.

**Why one channel?** VS Code displays each `OutputChannel` as a separate entry in the Output panel dropdown. Having one keeps the UI clean and makes it easy to tail all extension activity in one place.

---

## API

### `getChannel(): vscode.OutputChannel`

Returns the shared channel, creating it on first call. The channel is named `CieloVista Tools`.

Call this if you need direct access to the channel (e.g. to call `.show()`).

```typescript
import { getChannel } from '../shared/output-channel';
getChannel().show(true);
 ```
---

### `log(feature: string, message: string): void`

Write a timestamped log line. The format is:

 ```
[HH:MM:SS.mmm] [feature-name] message
 ```
```typescript
import { log } from '../shared/output-channel';
log('my-feature', 'Starting up');
// → [14:32:01.456] [my-feature] Starting up
 ```
---

### `logError(feature: string, message: string, error?: unknown, showPanel?: boolean): void`

Write an error line. If `error` is provided, its message is appended after `—`. If `showPanel` is `true` the Output panel is brought into view.

```typescript
import { logError } from '../shared/output-channel';
try {
    doSomething();
} catch (err) {
    logError('my-feature', 'doSomething failed', err, true);
    // → [14:32:01.456] [my-feature] ERROR: doSomething failed — <err.message>
}
 ```
---

### `disposeChannel(): void`

Disposes the channel and resets the internal reference to `undefined`. Called once from the root `extension.ts` `deactivate()` — features never call this themselves.

---

## Rules

- **Features always call `log()` or `logError()`** — never `console.log()` or `console.error()` in production code.
- **Features never instantiate `OutputChannel` directly** — always use `getChannel()`.
- **Only `extension.ts` calls `disposeChannel()`** — once, at deactivation.

---

## Internal design

The channel is stored in a module-level `let _channel` variable. `getChannel()` is lazy — the channel is only created on the first call, which means no output panel appears in VS Code until something actually logs. This keeps the UI clean for users who haven't triggered any feature yet.

---

## What it does

_TODO: one paragraph describing the single responsibility of this file._

---

## Internal architecture

 ```
activate()
  └── TODO: describe call flow
 ```
---

## Manual test

1. TODO: step one
2. TODO: step two
3. TODO: expected result
