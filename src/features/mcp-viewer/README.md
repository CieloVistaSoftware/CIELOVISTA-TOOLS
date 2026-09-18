---
id: feature-mcp-viewer
title: "Feature: Mcp Viewer"
description: "Mcp Viewer — 1 command(s). Auto-generated stub: fill in What it does and Manual test."
---

# Feature: Mcp Viewer

## What it does

<!-- TODO: describe what this feature does in 2–4 sentences -->
_Auto-generated stub. Replace this with a human description of the feature._

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.mcp.viewer.open`](command:cvs.mcp.viewer.open) | Mcp: Viewer: Open |

---

## Internal architecture

```text
activate(context)
  └── registers 1 command(s)
  └── Mcp: Viewer: Open → cvs.mcp.viewer.open
```

**Key internal functions:**
- `cardToDocJson()`
- `coerceStatus()`
- `handleListProjects()`
- `handleFindProject()`
- `handleSearchDocs()`
- `handleGetCatalog()`
- `parseFrontmatter()`
- `handleListDocViolations()`
- `handleValidateDoc()`
- `normalizeDewey()`
- `scoreDewey()`
- `handleLookupDewey()`
- `handleListSymbols()`
- `handleFindSymbol()`
- `handleListCvtCommands()`
- `handleNormalizeDoc()`
- `handleGetDocByIdentity()`
- `handleListOldDewey()`
- `handleGetActiveMarkdown()`
- `handleListMarkdownPaths()`
- `jsonResponse()`
- `htmlResponse()`
- `escHtml()`
- `buildMarkdownPreviewHtml()`
- `handleRequest()`
- `readRequestBody()`
- `openViewer()`
- `authorizeMcpViewerRequest()`
- `resolveViewerPath()`
- `sameServerBackUrl()`
- `viewerUrl()`

---

## Security (#780)

The viewer's local server listens on 127.0.0.1, which every web page the user has open can reach. So it answers only its own page:

- **One gate for every route.** `authorizeMcpViewerRequest()` runs before any route. A request needs this server's token (`?t=`, created when the server starts, see `src/shared/server-token.ts`) and a Host header naming the server's own loopback address (refuses DNS rebinding). Otherwise it gets 403 and nothing runs.
- **No CORS header.** The viewer page is served by the same server, so its requests are same-origin. A page on another origin cannot read a response, or the token in the page.
- **Paths stay inside registered folders.** `/api/reveal` and `/md-preview` accept only paths inside a registered project or the global docs folder, after following symlinks (`resolveAllowedPath()` in `src/shared/local-image-route.ts`). `/md-preview` serves `.md` files only, and its Back button only returns to a page of this server.
- The page the command opens (`http://127.0.0.1:<port>/?t=<token>`) and every fetch and link it makes carry the token. Regression test: `tests/regression/REG-161-mcp-viewer-server-rejects-foreign-requests.test.js`.

---

## Manual test

1. Open the Command Palette and run **Mcp: Viewer: Open** (`cvs.mcp.viewer.open`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
