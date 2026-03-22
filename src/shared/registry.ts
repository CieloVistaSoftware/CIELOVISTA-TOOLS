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
}

export interface ProjectRegistry {
    globalDocsPath: string;
    projects:       ProjectEntry[];
}

/**
 * Loads the project registry from REGISTRY_PATH.
 * Returns the parsed registry object, or undefined if not found or invalid.
 */
export function loadRegistry(): ProjectRegistry | undefined {
    if (!fs.existsSync(REGISTRY_PATH)) {
        vscode.window.showErrorMessage(`Project registry not found: ${REGISTRY_PATH}`);
        return undefined;
    }
    try {
        return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8')) as ProjectRegistry;
    } catch (err) {
        vscode.window.showErrorMessage(`Failed to parse project registry: ${err}`);
        return undefined;
    }
}
