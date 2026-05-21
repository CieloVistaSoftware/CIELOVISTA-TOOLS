# Issue Closure Gate

Use scripts/close-issue-with-evidence.ps1 to close issues with enforced checklist and test-evidence gates.

## Rules

1. Do not close if any markdown checklist item is unchecked (`- [ ]`).
2. Require explicit test evidence in closure comments.
3. Post closure comments using `gh issue comment --body-file` so markdown newlines render as real line breaks.

## Command

```powershell
.\scripts\close-issue-with-evidence.ps1 `
  -IssueNumber 346 `
  -TestCommand "npm run compile ; node tests/regression/REG-039-doc-audit-table-copy-controls.test.js" `
  -TestResult "pass" `
  -RunContext "Windows local shell"
```

## Result

When the gate passes, the script:
1. Posts a structured closure evidence comment.
2. Closes the issue.

When the gate fails, the script blocks closure and returns an error.
