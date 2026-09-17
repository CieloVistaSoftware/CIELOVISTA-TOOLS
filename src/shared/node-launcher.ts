// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * node-launcher.ts
 *
 * One answer to one question: which Node binary do we spawn?
 *
 * Asking the operating system for "node" hands that choice to the system PATH.
 * On Windows the `node.exe` found there can be the wrong ABI, an
 * antivirus-wrapped shim, or a launcher whose DLL import table fails to
 * initialize. When that happens Windows kills the process during load, before
 * any application code runs — exit code 0xC0000142 (STATUS_DLL_INIT_FAILED)
 * with empty stdout and stderr. It is intermittent, because the loader failure
 * is a race in the OS/AV layer rather than a fault in the program, which is why
 * it reads as flakiness rather than as a bug.
 *
 * That is not hypothetical. It took down the MCP server repeatedly (#615): a
 * retry loop, up to ten attempts, sometimes six failures before one stuck.
 *
 * VS Code already ships a Node runtime — its own Electron host binary, at
 * process.execPath. Re-invoking that with ELECTRON_RUN_AS_NODE=1 makes it
 * behave as a plain Node interpreter, with an ABI guaranteed to match the host.
 * No PATH lookup is performed, so there is nothing left to resolve wrongly.
 *
 * Rules:
 *   - Pure function. No vscode import, no side effects, no logging.
 *   - Never mutates the caller's env object.
 *   - Falls back to 'node' outside Electron so tests and scripts still run.
 */

/** A spawnable command and the environment to spawn it with. */
export interface NodeLaunch {
    command: string;
    env: NodeJS.ProcessEnv;
}

/**
 * Resolves the Node binary to spawn, preferring VS Code's own runtime.
 *
 * @param env Base environment for the child process. Copied, never mutated.
 */
export function resolveNodeLauncher(env: NodeJS.ProcessEnv): NodeLaunch {
    const electronHost = process.execPath;
    if (electronHost) {
        return {
            command: electronHost,
            env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
        };
    }
    return { command: 'node', env };
}
