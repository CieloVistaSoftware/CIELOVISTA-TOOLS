// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * install-command.ts
 *
 * Pure command-building logic for installing a VSIX through a
 * `code` / `code-insiders` CLI binary. Extracted from corequisite-checker so
 * it can be unit-tested without a live VS Code host (#592).
 *
 * Consumed by tests/regression/REG-117 via out/shared/install-command.js.
 */

export interface InstallCommand {
    /** First argument to cp.spawnSync — a full command line when `shell`, else the bare binary. */
    command: string;
    /** Argument array — empty when `shell` (the command line carries everything). */
    args: string[];
    /** Whether spawnSync must run through a shell (cmd.exe). */
    shell: boolean;
}

/** Quote a single token for safe use inside a cmd.exe command line. */
export function shellQuote(token: string): string {
    return `"${String(token).replace(/"/g, '""')}"`;
}

/**
 * Build the cp.spawnSync inputs to run `<bin> --install-extension <vsix>`.
 *
 * On Windows a `.cmd`/`.bat` shim must run through a shell, but Node does NOT
 * auto-quote arguments when `shell:true` — so a binary path containing spaces
 * (e.g. "...\Microsoft VS Code Insiders\bin\code-insiders.cmd") is split by
 * cmd.exe at the first space, producing
 *   "'...\Microsoft' is not recognized as an internal or external command"
 * which surfaced to the user as "Failed to install Claude Chat" (#592).
 *
 * We therefore build a single, fully-quoted command line ourselves and leave
 * the `--install-extension` flag bare. Bare executables (no .cmd/.bat) and
 * non-Windows platforms keep the safer argv form (no shell, no manual quoting).
 */
export function buildInstallCommand(
    bin: string,
    vsix: string,
    platform: NodeJS.Platform = process.platform,
): InstallCommand {
    const useShell = platform === 'win32' && /\.(cmd|bat)$/i.test(bin);
    if (useShell) {
        return {
            command: `${shellQuote(bin)} --install-extension ${shellQuote(vsix)}`,
            args: [],
            shell: true,
        };
    }
    return {
        command: bin,
        args: ['--install-extension', vsix],
        shell: false,
    };
}
