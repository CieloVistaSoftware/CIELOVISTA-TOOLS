# View a Doc — Current Design

## Overview
The "View a Doc" feature provides a searchable, interactive catalog of documentation files (primarily Markdown) across all registered projects and the global standards folder. It is implemented as a VS Code webview panel, replacing the old quick pick UI.

## UI Structure
- **Toolbar**
  - Title: 📄 View a Doc
  - Search bar: Filters docs and folders in real time
  - Stats: Shows total docs and projects, or matching count when searching
- **Content Table**
  - Columns: Folder | Documents
  - Each row: One folder (global or project) and its docs as clickable links
  - Docs are grouped by folder/project, sorted by priority (Dewey number), then name
- **Responsive Design**
  - At ≤600px width, table reflows to a single column for narrow panels

## Interactivity
- **Search**
  - Typing in the search bar filters rows and highlights matching doc links in yellow
  - If no matches, a "No docs match your search" message appears
- **Selection**
  - Ctrl/Cmd+Click: Multi-select doc links
  - Ctrl/Cmd+A: Select all visible doc links
  - Ctrl/Cmd+C/X: Copy/cut selected doc paths to clipboard
  - Escape: Clears selection
- **Navigation**
  - Clicking a doc link opens it in the doc preview webview
  - Clicking a folder button opens the folder in a new VS Code window
- **State Persistence**
  - Remembers last active doc and scroll position per session

## Error Handling
- If initialization fails, a red error banner appears at the top with the error message

## Implementation Notes
- Catalog is built from a registry of global and project docs
- Uses cached catalog for performance, with rebuild on demand
- All logic and UI are in `src/features/doc-catalog/commands.ts`
- No TypeScript errors currently detected in the implementation

---
_Last updated: 2026-04-01_
