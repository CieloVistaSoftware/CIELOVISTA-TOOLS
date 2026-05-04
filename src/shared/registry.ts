// Copyright (c) Cielo Vista Software. All rights reserved.
// src/shared/registry.ts — Project registry path and loader
//
// Exports the canonical REGISTRY_PATH and loadRegistry() utility for all features.
// Ensures single source of truth for project registry location and loading logic.
import * as fs from 'fs';
import * as vscode from 'vscode';

// Path to the canonical project registry JSON file
export const REGISTRY_PATH = 'C:\\Users\\jwpmi\\Downloads\\CieloVistaStandards\\project-registry.json';

export interface ProjectEntry {
    name:        string;
    path:        string;
    type:        string;
    description: string;
    /** Lifecycle status. Missing entries default to "product" for backward compatibility. */
    status?:     'product' | 'workbench' | 'generated' | 'archived';
}

export interface ProjectRegistry {
    globalDocsPath: string;
    projects:       ProjectEntry[];
}

/**
 * Loads the project registry from REGISTRY_PATH.
 * Returns the parsed registry object, or undefined if not found or invalid.
 * Backfills status="product" for any entry missing a status field.
 */
export function loadRegistry(): ProjectRegistry | undefined {
    if (!fs.existsSync(REGISTRY_PATH)) {
        vscode.window.showErrorMessage(`Project registry not found: ${REGISTRY_PATH}`);
        return undefined;
    }
    try {
        const raw = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8')) as ProjectRegistry;
        for (const p of raw.projects) {
            if (!p.status) { p.status = 'product'; }
        }
        return raw;
    } catch (err) {
        vscode.window.showErrorMessage(`Failed to parse project registry: ${err}`);
        return undefined;
    }
}

/**
 * Saves the project registry back to REGISTRY_PATH.
 * Pretty-printed with 2-space indent to match the hand-maintained style.
 * Throws on write failure — callers should wrap in try/catch if they want UI feedback.
 */
export function saveRegistry(registry: ProjectRegistry): void {
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf8');
}
