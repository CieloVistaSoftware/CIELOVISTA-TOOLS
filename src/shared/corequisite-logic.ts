// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

// component: aud

/**
 * corequisite-logic.ts
 *
 * Pure, vscode-free decision logic for the corequisite checker.
 * Lives in shared/ so it can be unit-tested with injected data — no VS Code
 * registry, no filesystem. The feature file (corequisite-checker.ts) gathers
 * the live inputs and delegates every decision to the functions here.
 *
 * Issue #602: a freshly-installed extension is present on disk but is NOT yet
 * visible in the live VS Code registry (vscode.extensions.getExtension) until
 * the window reloads. The checker used to read the registry only, so the very
 * next check after a successful install reported the extension as `missing`,
 * causing a false-positive APP_ERROR and a re-install loop. decideStatus() now
 * accepts an on-disk version too and reports `pending-reload` instead.
 */

export type Status = 'ok' | 'missing' | 'outdated' | 'unknown-version' | 'pending-reload';

export interface CorequisiteSpec {
    minVersion?: string;
    displayName?: string;
    vsixPath?: string;
}

export interface DecideInput {
    spec: CorequisiteSpec;
    /** True when vscode.extensions.getExtension(id) returned an extension. */
    registryPresent: boolean;
    /** Version reported by the live registry (undefined if absent/unreadable). */
    registryVersion?: string;
    /** Version found by scanning the extensions folder on disk (undefined if none). */
    diskVersion?: string;
}

export interface Decision {
    status: Status;
    installedVersion?: string;
}

/** Numeric compare of two semver-shaped strings (no pre-release handling). */
export function compareVersions(a: string, b: string): number {
    const pa = a.split('.').map(n => parseInt(n, 10) || 0);
    const pb = b.split('.').map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const da = pa[i] || 0;
        const db = pb[i] || 0;
        if (da !== db) { return da - db; }
    }
    return 0;
}

/**
 * Given a list of extension directory names of the form
 * `<publisher>.<name>-<version>`, return the highest installed version for `id`,
 * or undefined when none match. Used to detect an extension that is installed
 * on disk but not yet loaded into the live registry.
 */
export function installedVersionFromDirNames(id: string, dirNames: string[]): string | undefined {
    const prefix = id.toLowerCase() + '-';
    let best: string | undefined;
    for (const name of dirNames) {
        const lower = name.toLowerCase();
        if (!lower.startsWith(prefix)) { continue; }
        const ver = name.slice(prefix.length);
        // The remainder must start with a version number — guards against a
        // sibling id like "<id>-extra-1.0.0" being mistaken for a version.
        if (!/^\d+(\.\d+)*$/.test(ver)) { continue; }
        if (!best || compareVersions(ver, best) > 0) { best = ver; }
    }
    return best;
}

/**
 * Decide a corequisite's status from the live-registry and on-disk inputs.
 * The live registry is authoritative when the extension is present there.
 */
export function decideStatus(input: DecideInput): Decision {
    const { spec, registryPresent, registryVersion, diskVersion } = input;

    // The live registry is authoritative whenever the extension is loaded.
    if (registryPresent) {
        if (!registryVersion) { return { status: 'unknown-version' }; }
        if (spec.minVersion && compareVersions(registryVersion, spec.minVersion) < 0) {
            return { status: 'outdated', installedVersion: registryVersion };
        }
        return { status: 'ok', installedVersion: registryVersion };
    }

    // #602: not in the live registry, but the VSIX is unpacked on disk — it was
    // just installed and the host has not reloaded yet. That is pending-reload,
    // NOT missing. Still flag it outdated if the on-disk build is too old.
    if (diskVersion) {
        if (spec.minVersion && compareVersions(diskVersion, spec.minVersion) < 0) {
            return { status: 'outdated', installedVersion: diskVersion };
        }
        return { status: 'pending-reload', installedVersion: diskVersion };
    }

    return { status: 'missing' };
}
