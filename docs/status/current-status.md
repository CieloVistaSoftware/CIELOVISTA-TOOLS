---
id: current-status
title: Current status
description: The live parking lot: what the last session did and what to do next.
---

# CURRENT-STATUS.md — cielovista-tools

## 🅿️ PARKING LOT

**Task:** Status check at the head of `main` (f835841). Nothing in flight — the previous
parking-lot entry described issue #700, which merged 15 commits ago and is closed.

**Files touched:** none this session; working tree is clean and level with `origin/main`.

**Last action:** Ran `node scripts/run-regression-tests.js` — **151/151 green**, including the
three packaging checks (`copy:commandhelp`, pick list, mcp packaging). Clean baseline established.

**State of the board:**
- **Open issues: 4.** #708 (docs rebuild — two commits already landed, `ba32e0a` + `8a3a5ae`;
  needs a close-out check that the acceptance criteria are all met), #707 (Dewey docid system:
  82 IDs declared, 2 referenced — retire or justify; #708 supersedes its recommendation),
  #696 (MCP can read the project registry but not write it — no `registry_promote` tool),
  #615 (MCP server 0xC0000142 STATUS_DLL_INIT_FAILED retry loop on Windows).
- **Open PRs: 1.** #622 (fix for #615, launch MCP server via VS Code bundled Node). Opened
  2026-06-25, now **CONFLICTING / DIRTY** against main — it needs a rebase before it can land.
- Version: 1.0.3.
- 11 worktrees under `.claude/worktrees/` (down from 55). A pile of `origin/backup/20260624/*`
  branches remain unmerged — archival, safe to leave or prune deliberately.

**Next step:**
1. Rebase PR #622 onto current main, re-run the suite, land it — that closes #615.
2. Verify #708 against its acceptance criteria and close it if the landed docs work satisfies them.
3. Then #707 (decide Dewey's fate now that #708 defined the 3-field contract) and #696.

**Open questions:** Does #708's landed work fully satisfy the issue, or is there a remaining
slice? The issue is still open with two comments and no close-out comment naming a validating test.
