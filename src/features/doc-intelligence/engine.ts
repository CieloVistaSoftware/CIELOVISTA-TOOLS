// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * engine.ts — In-memory findings store for Doc Intelligence.
 *
 * Provides addFinding / getFindings / clearFindings for testability
 * (no vscode dependency), plus executeAcceptedFindings() that operates
 * on the in-memory store.
 */

import * as fs from 'fs';
import type { Finding } from './types';

// ─── In-memory store ──────────────────────────────────────────────────────────

let _findings: Finding[] = [];

export function addFinding(f: Finding): void {
    _findings.push(f);
}

export function getFindings(): Finding[] {
    return _findings;
}

export function clearFindings(): void {
    _findings = [];
}

// ─── Execute accepted findings ────────────────────────────────────────────────

/**
 * Runs all findings in the store whose decision === 'accepted'.
 * Returns the count of findings executed.
 */
export async function executeAcceptedFindings(): Promise<number> {
    let done = 0;
    for (const f of _findings) {
        if (f.decision !== 'accepted') { continue; }
        try {
            await executeSingle(f);
            f.decision = 'done' as Finding['decision'];
        } catch {
            // leave as accepted on error
        }
        done++;
    }
    return done;
}

async function executeSingle(f: Finding): Promise<void> {
    if (f.action === 'create') {
        for (const p of f.paths ?? []) {
            if (!fs.existsSync(p)) {
                fs.mkdirSync(require('path').dirname(p), { recursive: true });
                fs.writeFileSync(p, '', 'utf8');
            }
        }
    }
}
