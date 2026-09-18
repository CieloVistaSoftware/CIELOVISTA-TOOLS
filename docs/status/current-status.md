---
id: current-status
title: Current status
description: The live parking lot: what the last session did and what to do next.
---

# CURRENT-STATUS.md — cielovista-tools

## 🅿️ PARKING LOT

**Task:** #787: retire the command launcher's per-command Dewey numbers (the follow-up
to #707). Branch `feat/787-retire-command-dewey`, PR closes #787.

**Removed:**
- The `dewey` field on all 130 catalog.ts entries and on `CmdEntry`.
- Every display: the launcher card badge (.cmd-dewey) and its CSS, the card tooltip
  and tooltip-builder lines, the F1 "Catalogue number" row, the help panel badge
  (.qa-dewey) and its CSS, the `dewey` field in `list_cvt_commands` and its
  description, and the MCP Endpoint Viewer's number column and sort key.
- The checks that only enforced the numbers: required field + duplicates in
  tests/command-validation.test.js and tests/catalog-integrity.test.js,
  tests/catalog-dewey-uniqueness.test.js (deleted), check-architecture.js check 3,
  verify-symbol-index.mjs SYM-036/037 (SYM-032 keeps id/title/group).
- REG-033 (fully covered by REG-159) and the dead scripts patch-help-docs.js,
  print-npm-deweys.js and the one-shot create-github-issues.ps1.
- Nothing sorted by the numbers: the launcher shows catalog order within each group;
  the viewer column was only a click-to-sort option.

**Guard:** REG-159 has no allowances left. src/ and mcp-server/src may not mention
dewey or docid at all; tests/ and scripts/ may not mention dewey outside REG-159's
own history note.

**Next step:** confirm the PR merged and `npm run rebuild` ran.

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
