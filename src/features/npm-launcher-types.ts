// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * npm-launcher-types.ts
 * Shared contract between extension host and webview.
 * TypeScript sends ToWebview messages, webview sends ToHost messages.
 */

// Data sent once on init — pure data, no HTML
export interface ScriptEntry {
    id:      string;   // unique key: dir::name
    folder:  string;   // basename of dir
    dir:     string;   // full path to package.json dir
    name:    string;   // script name
    command: string;   // script value (for display)
    dewey:   string;   // e.g. "100.001"
    doc: {
        what:  string;
        when:  string;
        where: string;
        how:   string;
        why:   string;
    };
}

// Extension → Webview
export type ToWebview =
    | { type: 'init';    entries: ScriptEntry[] }
    | { type: 'status';  id: string; state: 'running' | 'ok' | 'error' | 'killed'; exitCode?: number };

// Webview → Extension
export type ToHost =
    | { command: 'run';  id: string; dir: string; name: string; folder: string }
    | { command: 'stop'; id: string }
    | { command: 'fix';  pkg: string };
