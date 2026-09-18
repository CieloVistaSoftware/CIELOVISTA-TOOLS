---
id: current-status
title: Current status
description: The live parking lot: what the last session did and what to do next.
---

# CURRENT-STATUS.md — cielovista-tools

## 🅿️ PARKING LOT

**Task:** #728 (delete the wb-core demo server) and #707 stage 1 (src/ onto the
three-field doc contract). Stage 1 turned up #731, real data loss, fixed first.

**The one that mattered — #731:** commit `bf72645` (2026-06-24, "land great-hopper")
deleted **2,246 lines of prose from 42 feature READMEs**. It treated every body line
containing `": "` as a frontmatter field, dropped the sections around them and moved
311 fragments into the trailer. Nothing checked what a trailer held, so it went
unseen for three months. Restored with a three-way reverse-apply (`git merge-file`,
base `bf72645`, theirs `bf72645^`) so later edits survived; zero conflicts.

**This session, on branch `fix/728-731-707-src-doc-contract`:**
| # | What |
|---|---|
| #728 | Demo button, `wb-demo` handler and `C:\dev\wb-core` spawn deleted. REG-046 (tested the deleted handler) replaced by REG-141 |
| #731 | The 42 READMEs restored, as above |
| #707 stage 1 | All 74 `src/**/*.md` on id/title/description at the top. `docs-sync.js` enforces it on src/ (150 violations on the old tree, 0 now); the rebuild-time generator writes the new block; REG-111 and REG-138 updated |

**Filed, open:**
- **#730** — `cvs.headers.moveToBottom` / `fixAll` / `fixFile` and `cvs.tags.enrichAuto`
  still write the 13-field trailer. Running one undoes the migration (REG-134 would
  now fail on it). Fold into #707 stage 3 or rewrite to the new contract.
- **#732** — `docs:check` is red on every Windows checkout: `docs-site.js --check`
  compares its LF output with the CRLF checkout of `docs/index.html`. No content diff.

**Still open on #707:** stage 2 regroup the Doc Card Catalog by folder
(`scanner.ts` derives `categoryNum` from a docid; REG-031 guards the Dewey badges),
then stage 3 delete the 8 Dewey MCP tools, `tests/unit/doc-contract.test.ts`, and
REG-138. **Stage 3 last.** The catalog never read src/ trailer docids (it only parses a
top block), so stage 1 changed nothing it shows.

**Next step:** confirm the PR merged and `npm run rebuild` ran, then #707 stage 2. 69
of the 74 src/ descriptions are still "Auto-generated stub" or truncated text carried
over from the old trailers. That is refurbishment work, not part of the migration.

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
