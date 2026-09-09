---
id: working
title: Working on cielovista-tools
description: Issues, the closure gate, the regression suite, and cutting a release.
---

# Working on it

The order is always the same: **file the issue, fix it, prove it with a test,
close it with the evidence.** Skipping the issue is the one step that is never
optional.

<!-- docs-sync:begin -->

- **[Cutting a release](release-guide.md)** — Version bump, changelog, packaging and install verification.
- **[Opening an issue](opening-issues.md)** — The required first step for every fix, and what a good issue contains.
- **[Priority sync](priority-sync.md)** — How issue priority is mirrored between GitHub and the extension.
- **[Regression log](regression-log.md)** — What each REG-NNN test guards, and the bug that caused it to exist.
- **[The issue closure gate](issue-closure-gate.md)** — What must be true before an issue is allowed to close.

<!-- docs-sync:end -->

## Before you commit

```powershell
node scripts/run-regression-tests.js
```

All green, or it does not land. A worktree builds its own `out/` on the first
run, so a red suite there is a real failure, not a setup problem.
