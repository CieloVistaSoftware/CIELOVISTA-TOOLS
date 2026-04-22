// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * Scope tells the user whether a command works anywhere or needs a specific project.
 *
 *  global       — works from any workspace; reads from the CieloVista registry
 *                 (e.g. Doc Catalog, Docs Manager, Sync Check, License Sync)
 *  workspace    — operates on whatever VS Code workspace is currently open
 *                 (e.g. Codebase Auditor, README scan, Test Coverage)
 *  diskcleanup  — DiskCleanUp project only (JS Error Audit, project launchers)
 *  tools        — cielovista-tools project only (internal self-audits)
 */
export type CmdScope = 'global' | 'workspace' | 'diskcleanup' | 'tools';

export interface CmdEntry {
    id:            string;
    title:         string;
    description:   string;
    tags:          string[];
    group:         string;
    groupIcon:     string;
    dewey:         string;
    scope:         CmdScope;   // REQUIRED — every command must declare its scope
    location:      string;     // NEW: relative path to implementation file
    auditCheckId?: string;
    helpDoc?:      string;
    /** When 'read': button label shows 'Open' instead of 'Run' — use for commands that only open/display content */
    action?:       'run' | 'read';
    /** ID of the command to suggest as the next logical step after this one completes */
    nextAction?:   string;
    /** Optional precomputed tooltip for the Run/Open button when generic text is misleading */
    runTooltip?:   string;
}
