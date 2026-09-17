---
id: current-status
title: Current status
description: The live parking lot: what the last session did and what to do next.
---

# CURRENT-STATUS.md — cielovista-tools

## 🅿️ PARKING LOT

**Task:** Cleared the cvt board, then moved to wb-starter.

**The one that mattered:** `npm run rebuild` could not finish. It aborted at
`test:doc-contract` and never reached `node install.js`, so **every fix on main had
been committed but never installed** — including #615. The blocker was a cvt test
judging **wb-starter's** markdown by cvt's Dewey taxonomy, plus an exclude list that
matched `'worktrees'` as a substring of the absolute path, which silently skipped
every directory inside any git worktree. That check inspected 3 files instead of 81
and reported itself green. It now runs 406 assertions. Filed and fixed as #725.

**Closed this session:**
| # | What |
|---|---|
| #615 | MCP server 0xC0000142 — launches via VS Code's own Node now. PR #724, superseded the 3-month-old #622 |
| #708 | Docs rebuild — verified against all six migration steps; five done, step 6 handed to #707 |
| #725 | The rebuild blocker above |
| #723 | The same PATH-resolved-node bug in **four** more call sites; two of them were found by the regression test, not by grep |
| #696 | `registry_promote` / `registry_set_status` MCP tools — an agent can write the registry, not just read it |

**Deployed:** `npm run rebuild` completed after #725 landed, and
`process.execPath` + `ELECTRON_RUN_AS_NODE` were confirmed present in the installed
`out/extension.js`. Committed is not deployed — check the installed bundle.

**Still open:**
- **#707** — Dewey retirement. The decision is settled (Option A, retire) and recorded
  on the issue with evidence; it is now a three-stage tracker. Stage 1 migrate 81
  `src/**/*.README.md` to the 3-field contract; stage 2 regroup the Doc Card Catalog
  by folder, which is a redesign of a shipped view (`scanner.ts:80` derives
  `categoryNum` from the docid, and REG-031 guards clickable Dewey badges); stage 3
  delete the 8 MCP tools and dead tests. **Stage 3 must be last** — deleting the tools
  first leaves the catalog reading a field nothing maintains.
- **#728** — `doc-catalog/commands.ts` spawns a demo server from a hardcoded
  `C:\dev\wb-core`, an abandoned repo, detached with `stdio:'ignore'` so failure is
  silent. Needs a product call: delete it, or point it at wb-starter via the registry.

**Next step:** work is in wb-starter. Return here for #707 stage 1, which is safe to
land on its own.

**Watch out for:**
- A Python patch script must use `newline=''` on **both** read and write, or it
  rewrites every line ending in the file. That broke REG-120, REG-124 and REG-128 in
  this session for a change that touched one `spawn()` call.
- A test that compiles `mcp-server/` replaces the shipped esbuild bundle with
  unbundled tsc output and fails the `dist/index.js > 100 KB` packaging check for the
  rest of the run. Compile into a sandbox instead. Same family as #697 / #700.
- `npm run rebuild | tail -20` reports **tail's** exit code, not npm's. Redirect to a
  file and check `$?` directly, or a failed build reads as a successful one.
