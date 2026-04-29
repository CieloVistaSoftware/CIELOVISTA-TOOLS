---
title: feature: shared/error-log-utils.ts
description: Persistent error tracking to a JSON file in the workspace. Errors are stored with a unique ID derived from their message. When the same error recur…
project: cielovista-tools
category: 700 — Project Docs
relativePath: src/shared/error-log-utils.README.md
created: 2026-04-22
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
status: active
tags: [error, log, utils]
---

# feature: shared/error-log-utils.ts

## Purpose

Persistent error tracking to a JSON file in the workspace. Errors are stored with a unique ID derived from their message. When the same error recurs its count increments. A solution string can be attached once a fix is known — on the next occurrence the solution is returned to the caller so it can act on it.

This consolidates the error-tracking code that was previously duplicated inside the `suggestions` extension.

 

## How it works

1. A feature catches an error and calls `logError(err, 'feature-name')`.
2. The utility hashes the error message to produce a stable ID.
3. If this ID already exists in the log, the count is incremented.
4. If the entry has `solved: true`, the solution string is returned.
5. New errors are appended to the log file.

The log file lives at `{workspace}/.vscode/logs/cielovista-errors.json`.

 

## API

### `logError(error: unknown, context: string): string | undefined`

Log an error. Returns a solution string if one has been recorded for this error, otherwise returns `undefined`.

```typescript
import { logError } from '../shared/error-log-utils';

try {
    doRiskyThing();
} catch (err) {
    const solution = logError(err, 'my-feature');
    if (solution) {
        vscode.window.showInformationMessage(`Known fix: ${solution}`);
    } else {
        vscode.window.showErrorMessage(`Error: ${err}`);
    }
}
```

### `markErrorSolved(messageSubstring: string, solution: string): boolean`

Mark all logged errors whose message contains `messageSubstring` as solved and record the solution. Returns `true` if at least one error was updated.

```typescript
import { markErrorSolved } from '../shared/error-log-utils';
markErrorSolved('ENOENT', 'Ensure the workspace has a .vscode folder before running.');
```


### `getAllErrors(): ErrorEntry[]`

Returns all logged error entries. Useful for building a diagnostics panel or generating a status report.

 

### `createErrorId(message: string): string`

Generates a deterministic short hex ID from an error message string. Same message always produces the same ID. Exported for testing purposes — most callers do not need to call this directly.

 

## `ErrorEntry` interface

```typescript
interface ErrorEntry {
    id:           string;   // 'err_' + 8 hex chars
    timestamp:    string;   // ISO — first occurrence
    lastOccurred: string;   // ISO — most recent occurrence
    count:        number;   // total times seen
    message:      string;   // error message text
    stack?:       string;   // stack trace on first occurrence
    context:      string;   // feature/function name
    solved:       boolean;  // whether a fix is recorded
    solution?:    string;   // short description of the fix
}
```
 

## Log file location

`{workspaceRoot}/.vscode/logs/cielovista-errors.json`

The `.vscode/logs` directory is created automatically. The file is standard JSON — you can open and edit it directly in VS Code to add solutions or clear old entries.

If no workspace is open, `logError` does nothing and returns `undefined`.

 

## What it does

_TODO: one paragraph describing the single responsibility of this file._

 

## Internal architecture

```
activate()
  └── TODO: describe call flow
```
 

## Manual test

1. TODO: step one
2. TODO: step two
3. TODO: expected result
