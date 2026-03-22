// Copyright (c) 2025 CieloVista Software. All rights reserved.
import * as vscode from 'vscode';
import * as fs from 'fs';
import { logError } from '../../shared/output-channel';
import type { ProjectRegistry } from './types';

const REGISTRY_PATH = 'C:\\Users\\jwpmi\\Downloads\\CieloVistaStandards\\project-registry.json';

export function loadRegistry(): ProjectRegistry | undefined {
    try {
        if (!fs.existsSync(REGISTRY_PATH)) { vscode.window.showErrorMessage(`Registry not found: ${REGISTRY_PATH}`); return undefined; }
        return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8')) as ProjectRegistry;
    } catch (err) { logError('marketplace-compliance', 'Failed to load registry', err); return undefined; }
}
