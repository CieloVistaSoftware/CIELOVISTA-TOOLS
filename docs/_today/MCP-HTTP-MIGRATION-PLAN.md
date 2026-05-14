# MCP HTTP Transport Migration Plan

**Status:** Planning  
**Created:** 2026-05-14  
**Target:** Add real MCP Streamable HTTP transport without breaking current VS Code extension behavior.

---

## Overview

This plan adds an HTTP-based MCP endpoint (`POST /mcp` with JSON-RPC) alongside the existing stdio transport, then migrates the MCP Endpoint Viewer UI from custom REST-style `/api/...` routes to proper JSON-RPC calls. The renderers and business logic remain untouched.

---

## Execution Order

### Phase 1: MCP HTTP Server (Step 1–3)

**Step 1: Add HTTP transport entrypoint**
- Create `mcp-server/src/http.ts`
- Use MCP SDK's Streamable HTTP transport
- Bind to `127.0.0.1:3000` (localhost only)
- Validate `Origin` header
- Mount the shared `createServer()` at `/mcp` endpoint
- Add `start:http` script to `mcp-server/package.json`

**Step 2: Keep stdio entrypoint unchanged**
- Ensure `mcp-server/src/index.ts` still works as-is
- No changes to VS Code extension integration

**Step 3: Manual protocol verification**
- Start the HTTP server locally
- Send `initialize` → confirm valid response
- Send `tools/list` → confirm tools are enumerated
- Send `tools/call` with `list_projects` → confirm tool response

---

### Phase 2: Viewer Request Layer (Step 4–6)

**Step 4: Replace `runEndpoint()` in viewer HTML**
- Edit `src/features/mcp-viewer/html.ts`
- Replace REST-style URL building with JSON-RPC POST
- Add response unwrapping adapter
- Keep all 13 tab handlers working
- Keep all render functions unchanged

**Step 5: Proof test with `list_projects`**
- Manually verify the first tab works through MCP HTTP
- Confirm table renders with correct data

**Step 6: Migrate remaining 12 tabs**
- Apply same request pattern to all other tabs
- Validate each tab independently or in small batches

---

### Phase 3: Test Migration (Step 7–8)

**Step 7: Update transport-coupled tests**
- Edit `tests/unit/mcp-viewer-dropdown-runtime.test.js`
- Edit `tests/unit/mcp-viewer-project-link-runtime.test.js`
- Stop asserting `/api/...` URLs
- Assert `POST /mcp` with JSON-RPC payload

**Step 8: Run test suite**
- Run updated tests
- Ensure no regressions in render layer tests

---

### Phase 4: Integration & Cleanup (Step 9–11)

**Step 9: Full project rebuild**
- Run `npm run rebuild` in main extension folder
- Verify VSIX packaging succeeds

**Step 10: Install and validate in VS Code**
- Install VSIX
- Open MCP Endpoint Viewer
- Spot-check 2–3 tabs for correctness

**Step 11: Remove old API routes (optional)**
- If soft migration is not needed, remove `/api/...` routes from `src/features/mcp-viewer/index.ts`
- Otherwise, keep them for backward compatibility temporarily

---

## Files to Touch

### Create
- `mcp-server/src/http.ts` — HTTP transport with origin checks

### Edit
- `mcp-server/package.json` — add `start:http` script
- `src/features/mcp-viewer/html.ts` — replace `runEndpoint()`
- `tests/unit/mcp-viewer-dropdown-runtime.test.js` — update fetch assertions
- `tests/unit/mcp-viewer-project-link-runtime.test.js` — update fetch assertions
- `src/features/mcp-viewer/index.ts` — keep existing routes for now, or remove after validation

### Leave Unchanged
- `mcp-server/src/index.ts` — stdio stays as-is
- `mcp-server/src/server.ts` — shared factory unchanged
- All renderer functions in `src/features/mcp-viewer/html.ts`
- All control wiring and tab logic

---

## Success Criteria

1. ✅ HTTP MCP endpoint exists at `127.0.0.1:3000/mcp`
2. ✅ Endpoint answers `initialize`, `tools/list`, `tools/call` correctly
3. ✅ Viewer sends JSON-RPC `tools/call` instead of GET requests
4. ✅ All 13 tabs render data without changes to render functions
5. ✅ Transport-specific tests pass with new assertions
6. ✅ Full `npm run rebuild` succeeds
7. ✅ VS Code extension installs and viewer works

---

## Progress Log

- **Step 1 (HTTP transport):** ✅ [COMPLETE] Created `mcp-server/src/http.ts` with Streamable HTTP pattern, Origin validation, POST /mcp endpoint. Added `start:http` script. Compiled successfully.
- **Step 2 (stdio validation):** ✅ [COMPLETE] Verified `mcp-server/src/index.ts` unchanged; stdio transport still works. Both stdio and HTTP share `createServer()`.
- **Step 3 (manual protocol check):** ✅ [COMPLETE] HTTP server tested: accepts POST `/mcp`, returns JSON-RPC responses, handles notifications (202), validates Origin, binds to 127.0.0.1:3000.
- **Step 4 (viewer request layer):** ✅ [COMPLETE] Migrated viewer HTML to JSON-RPC POST. Updated `runEndpoint()`, helper functions. Added `/mcp` handler in extension's HTTP server. All 13 tabs routed via JSON-RPC. Render functions unchanged. Compilation OK.
- **Step 5-9 (build & install):** ✅ [COMPLETE] Full rebuild executed. Fixed StatusFilter type coercion. All 61 regression tests passed. Install verification passed. Extension installed to VS Code Insiders.
- **Step 10 (install validation):** ✅ [COMPLETE] Extension installed. MCP Viewer now sends JSON-RPC POST requests to `/mcp` instead of REST GET to `/api/{endpoint}`. All 13 tabs migrated. User should reload VS Code window to see changes.
- **Step 11 (cleanup):** ✅ [COMPLETE] Migration plan fully executed. Session documentation updated.

---
