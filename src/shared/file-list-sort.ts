/**
 * file-list-sort.ts
 *
 * Pure sort comparators for the FileList viewer (issue #68). Lives in
 * shared/ so unit tests can import without spinning up VS Code, and so
 * the same logic can be embedded into the webview as a string.
 *
 * All comparators preserve the folders-first invariant: any directory
 * sorts before any file regardless of column or direction. Within each
 * group (folders, files), the requested column drives ordering.
 */

export interface FileListEntry {
    name: string;
    isDir: boolean;
    size: number;          // bytes (0 for directories)
    mtime: number;         // ms since epoch
    type: string;          // extension without dot, or '<dir>' for directories, or '<no-ext>' for files without one
}

export type SortColumn    = 'name' | 'date' | 'type' | 'size';
export type SortDirection = 'asc'  | 'desc';

/** Folders-first invariant. Returns -1/+1 if one is dir and the other is not, 0 otherwise. */
function folderFirst(a: FileListEntry, b: FileListEntry): number {
    if (a.isDir && !b.isDir) { return -1; }
    if (!a.isDir && b.isDir) { return  1; }
    return 0;
}

/** Locale-aware case-insensitive name compare. */
function byName(a: FileListEntry, b: FileListEntry): number {
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
}

/** Stable comparator factory. Pure function, no side effects. */
export function makeComparator(column: SortColumn, dir: SortDirection): (a: FileListEntry, b: FileListEntry) => number {
    const sign = dir === 'asc' ? 1 : -1;
    return (a, b) => {
        const f = folderFirst(a, b);
        if (f !== 0) { return f; }

        let primary = 0;
        switch (column) {
            case 'name': primary = byName(a, b);                break;
            case 'date': primary = (a.mtime - b.mtime);         break;
            case 'type': primary = a.type.localeCompare(b.type); break;
            case 'size': primary = (a.size - b.size);           break;
        }

        if (primary !== 0) { return primary * sign; }
        // Tie-break by name (always ascending) so the order is stable
        return byName(a, b);
    };
}

/**
 * Sort entries in place using the given column + direction.
 * Returns the same array for chaining.
 */
export function sortEntries(entries: FileListEntry[], column: SortColumn, dir: SortDirection): FileListEntry[] {
    entries.sort(makeComparator(column, dir));
    return entries;
}

/** Default folders to skip when listing a directory. */
export const DEFAULT_EXCLUDES: ReadonlySet<string> = new Set([
    'node_modules',
    '.git',
    'out',
    'dist',
    '.vscode-test',
]);
