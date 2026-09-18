---
id: shared-doc-frontmatter
title: doc-frontmatter (shared)
description: The one reader, judge and writer of markdown doc headers under the three-field contract.
---

# doc-frontmatter

Pure functions (no vscode, no fs) that every header tool uses (#730).

| Function | What it does |
|---|---|
| `readFrontmatter(text)` | Finds a header at the top, or at the bottom only when every line in that block is a field. A horizontal rule followed by prose is body, never header. |
| `contractViolations(text)` | Everything wrong under the contract: no header, header at the bottom, a missing field, extra fields. Empty when compliant. |
| `toContract(text, fileName)` | Rewrites the header to id, title, description at the top, keeping existing values and deriving missing ones. The body is kept byte for byte, and line endings are preserved. |

**The contract** (#707, #708): three hand-written fields at the top of the file. Anything derivable (path, dates, category, tags, docid) is not typed into a document. `scripts/docs-sync.js` enforces it on docs/ and src/.

**Used by:** doc-header (Fix All / Fix File), doc-header-scan (Scan / Scan + Auto-Fix), frontmatter-viewer.

**Tests:** `tests/unit/doc-frontmatter.test.js`, `tests/unit/doc-header.test.js`, REG-093, REG-151.
