# Issue: Standardize All Feature .md Docs Front Matter and Layout

## Problem
Many feature documentation files (`.md`/`.README.md`) have inconsistent or missing YAML front matter and do not follow a standard layout. This makes it harder for both humans and AI to parse, audit, and maintain feature documentation.

## Proposal
- Move all YAML front matter (the `--- ... ---` block) to the very top of each `.md`/`.README.md` file.
- Standardize the layout and required headers for all feature docs to match the structure of `doc-auditor.README.md`.
- Ensure every feature doc includes:
  - YAML front matter (with id, title, description, status, tags, etc.)
  - `# Feature: <Name>`
  - `## What it does`
  - `## Commands` (if any)
  - `## Settings` (if any)
  - `## Manual Test` (if applicable)
  - `## Internal architecture` (if applicable)
  - Any other sections present in `doc-auditor.README.md` as a template

## Acceptance Criteria
- All feature `.md`/`.README.md` files have YAML front matter at the top.
- All feature docs follow the same header structure as `doc-auditor.README.md`.
- No duplicate or missing required sections.
- Documented in `docs/features.md`.

## References
- See `src/features/doc-auditor.README.md` for the canonical layout.
- See `docs/features.md` for the list of all feature docs.

---

_Assigned to: @copilot (default)_
