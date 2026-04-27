// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * project-card-types.ts
 *
 * Shared data types for project cards used in both:
 *   - Doc Catalog (projects section)
 *   - NPM Scripts panel
 *
 * TypeScript produces ProjectCardData[].
 * The webview shell receives it as JSON and binds it to <template> elements.
 * No HTML string concatenation anywhere in the data layer.
 */

export interface ScriptDoc {
    what:    string;
    when:    string;
    where:   string;
    how:     string;
    why:     string;
    expectedOutput: string;
    docFile: boolean;   // true = read from a .md file, false = synthesized
    sourceLabel: string;
}

export interface ScriptEntry {
    name:    string;    // e.g. "rebuild"
    command: string;    // e.g. "npm run test:catalog && ..."
    dewey:   string;    // e.g. "100.003"
    primary: boolean;   // true = blue (start / rebuild)
    doc:     ScriptDoc;
}

export interface ProjectCardData {
    dewey:         string;   // e.g. "100"
    name:          string;
    type:          string;   // e.g. "vscode-extension"
    typeIcon:      string;   // emoji
    description:   string;
    rootPath:      string;
    scripts:       ScriptEntry[];
    needsTests:    boolean;  // no real tests found
    claudeMdPath:  string | null;  // null = does not exist (show Create button)
    mcpStatusDot?: 'up' | 'down' | null;  // only set on the mcp-server card
}
