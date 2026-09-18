---
id: current-status
title: Current status
description: The live parking lot: what the last session did and what to do next.
---

# CURRENT-STATUS.md — cielovista-tools

## 🅿️ PARKING LOT

**Task:** #707 stage 3, the last stage: delete what was left of the Dewey docid system.
Branch `feat/707-stage3-delete-dewey`, PR closes #707.

**Deleted:**
- 8 MCP tools: lookup_dewey, migrate_dewey, list_old_dewey, refresh_doc_ledger,
  validate_doc, list_doc_violations, normalize_doc, get_doc_by_identity, with their
  schemas and every helper only they used (catalog-helpers.ts 1567 to ~660 lines).
- The MCP Endpoint Viewer's six matching tabs, their HTTP/JSON-RPC handlers, and
  active_markdown / list_markdown_paths (only the validate/normalize forms used them).
- CatalogCard.dewey and the scanner code that filled it; help-utils now returns help
  markdown only.
- Doc Intelligence's subject/category mismatch check (it compared the Dewey subject
  number with the category number; nothing else).
- tests/unit/doc-contract.test.ts (+ its rebuild step), REG-138, REG-027 (docid
  collisions), REG-111 (bottom frontmatter), tests/dewey-lookup-mcp.test.js,
  scripts/backfill-doc-contract.mjs, fix-docid-collisions.js, migrate-docid.js,
  build-frontmatter-viewer.js.
- The 13-field trailer on CLAUDE.md, copilot-rules.md and
  scripts/audit-test-coverage.README.md (now the three-field top block) and on
  CHANGELOG.md (no frontmatter: the marketplace renders any block as an H2).

**Guard:** REG-159 starts the real MCP server in a sandbox and checks tools/list, and
fails on any dewey/docid in src/ or mcp-server/src outside the command launcher.

**Open question, filed:** #787, whether the command launcher's per-command Dewey
numbers go too. They are display-only; REG-159 caps the files that show them.

**Next step:** confirm the PR merged and `npm run rebuild` ran. Then #787.

**Watch out for:**
- A Python patch script must use `newline=''` on **both** read and write, or it
  rewrites every line ending in the file.
- A test that compiles `mcp-server/` replaces the shipped esbuild bundle with
  unbundled tsc output and fails the `dist/index.js > 100 KB` packaging check for the
  rest of the run. Compile into a sandbox instead. Same family as #697 / #700.
- `npm run rebuild | tail -20` reports **tail's** exit code, not npm's. Redirect to a
  file and check `$?` directly, or a failed build reads as a successful one.
- `tsc -p .` reports TS6059 rootDir errors for `mcp-server/src/shared`; that is the
  wrong config, not a defect. The real typecheck is `tsc --noEmit -p tsconfig.typecheck.json`.
