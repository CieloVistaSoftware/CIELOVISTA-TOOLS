// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * audit-schema.ts
 *
 * THE contract between the audit runner and its two consumers:
 *   1. VS Code launcher panel — reads this to show colored dots + summaries
 *   2. Windows service / scheduled task — reads this at 8:00am for briefing
 *
 * Rule: nothing reads or writes audit data except through these types.
 */

export type AuditStatus = 'green' | 'yellow' | 'red' | 'grey';

/**
 * One health check — e.g. "Marketplace Compliance" or "README Quality".
 * Maps 1:1 to a dot on the launcher panel.
 */
export interface AuditCheck {
    /** Stable ID — used to match launcher buttons to checks. e.g. "marketplace" */
    checkId:          string;
    /** Display category shown as section heading */
    category:         string;
    /** Short title shown on the button / dot */
    title:            string;
    /** 🔴 red=action required  🟡 yellow=needs attention  🟢 green=healthy  ⚪ grey=not run */
    status:           AuditStatus;
    /** One sentence shown directly on the card below the title.
     *  For green: confirmation e.g. "All 9 projects compliant"
     *  For yellow/red: the reason e.g. "Missing LICENSE in wb-core, DiskCleanUp" */
    summary:          string;
    /** Full explanation — shown in the detail panel when user clicks Run */
    detail:           string;
    /** Project names that have issues (empty if green) */
    affectedProjects: string[];
    /** Specific files that are missing or broken (may be empty) */
    affectedFiles:    string[];
    /** VS Code command to run when the user clicks the button */
    action:           string;
    /** Label for the action button e.g. "Scan Now", "Fix All", "Open Catalog" */
    actionLabel:      string;
    /** ISO timestamp of when this check ran */
    ranAt:            string;
    /** How long the check took in milliseconds */
    durationMs:       number;
}

/** The full daily audit report — written to disk, read by both consumers. */
export interface DailyAuditReport {
    /** ISO timestamp used as unique ID */
    auditId:     string;
    /** ISO timestamp */
    generatedAt: string;
    /** Total run time in milliseconds */
    durationMs:  number;
    /** All health checks */
    checks:      AuditCheck[];
    /** Rolled-up counts for quick scanning */
    summary: {
        red:    number;
        yellow: number;
        green:  number;
        grey:   number;
        total:  number;
    };
}

/** Path where the audit report is always written. Both consumers read from here. */
export const AUDIT_REPORT_PATH =
    'C:\\Users\\jwpmi\\Downloads\\CieloVistaStandards\\reports\\daily-audit.json';
