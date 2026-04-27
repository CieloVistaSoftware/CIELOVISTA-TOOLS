# FileList — Sortable Alternative File Browser

Issue [#68](https://github.com/CieloVistaSoftware/CIELOVISTA-TOOLS/issues/68).

A details-view file browser surfaced as a Quick Launch button on the CieloVista Home page. Solves three things the Explorer tree handles poorly:

- **Find the most recently modified file** — sort by Date modified
- **Identify the largest files** — sort by Size
- **Filter by extension at a glance** — sort by Type

## Usage

Open the Home page (`cvs.tools.home`) and click **FileList**, or run **CieloVista: Tools: FileList** from the command palette (`cvs.tools.fileList`).

The webview opens at the current workspace root. Click any column header to sort — click again to flip direction. The sort indicator (▲ / ▼) shows the active column and direction.

Click a file row to open it in the editor beside the FileList tab. Click a folder row to navigate into it. The **↑ Up** button climbs to the parent (disabled at the workspace root).

Two header toggles:

- **.hidden** — show / hide dotfiles (default: shown, de-emphasized)
- **excludes** — show / hide normally-excluded folders: `node_modules`, `.git`, `out`, `dist`, `.vscode-test` (default: hidden)

## Sort behavior

Folders always sort above files within the active column / direction (Windows Explorer convention). Tie-breaks within the same primary value use ascending name order so the table is stable across repeated sorts.

Comparators live in `src/shared/file-list-sort.ts` and are unit-tested in `tests/unit/file-list-sort.test.js` (18 assertions).

## Feature toggle

Disable via setting `cielovistaTools.features.fileListViewer = false` and reload the window.

## Phase 2 (separate issues, future work)

Multi-root workspace support, filter / search input, right-click context menu (Reveal in Explorer, Open in Terminal here, Copy path, Delete), custom column visibility, persist last directory + sort across sessions.
