// Copyright (c) 2025 CieloVista Software. All rights reserved.
import * as vscode from 'vscode';
import { logError } from '../../shared/output-channel';
import { REGISTRY_PATH, loadRegistry as loadRegistryFromShared, type ProjectRegistry } from '../../shared/registry';

export function loadRegistry(): ProjectRegistry | undefined {
    try {
        const registry = loadRegistryFromShared();
        if (!registry) { vscode.window.showErrorMessage(`Registry not found: ${REGISTRY_PATH}`); return undefined; }
        return registry;
    } catch (err) { logError('Failed to load registry', err instanceof Error ? err.stack || String(err) : String(err), 'marketplace-compliance'); return undefined; }
}
