// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * categories.ts — single source of truth for doc category labels (#481)
 *
 * Every consumer (CATEGORY_PATTERNS, doc-catalog, doc-intelligence, etc.)
 * imports from here so that renaming a category requires only one change.
 */

export const CATEGORIES = {
    META:          '000 — Meta / Session / Status',
    ARCHITECTURE:  '100 — Architecture & Standards',
    COMPONENTS:    '200 — Component & UI Docs',
    DEV_WORKFLOW:  '300 — Dev Workflow & Process',
    TESTING:       '400 — Testing & Quality',
    API:           '500 — API & Integration',
    TOOLS:         '600 — Tools & Extensions',
    PROJECT_DOCS:  '700 — Project Docs',
    GLOBAL:        '800 — Global Standards',
    AUDIT:         '900 — Audit & Reports',
} as const;

export type CategoryLabel = typeof CATEGORIES[keyof typeof CATEGORIES];
