// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Reads a workspace's own .claude/launch.json to find its dev-server port,
// so the home page's Start button and status pill work for whichever
// project is currently open, not a hardcoded port.
import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_PORT = 4000;
const DEFAULT_LANDING_PAGE = 'index.html';

export interface DevServerConfig {
    port: number;
    landingPage: string;
    /**
     * Where `port` came from. #680: the fallback used to be indistinguishable
     * from a real read, so a project with no .claude/launch.json got port 4000
     * forever and the Start button failed silently against the wrong port.
     * Callers need to know the port is a guess so they can say so.
     */
    source: 'launch.json' | 'default';
}

/**
 * Reads {wsPath}/.claude/launch.json's first configuration for a `port`.
 * Falls back to DEFAULT_PORT/DEFAULT_LANDING_PAGE if the file, the
 * configurations array, or the port field is missing or invalid.
 */
/** True for an integer in the valid TCP port range net.createConnection can actually use (1-65535 -- 0 means "let the OS assign one," not a fixed port to connect to). */
function isValidPort(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 65535;
}

export function getDevServerConfig(wsPath: string): DevServerConfig {
    try {
        const launchJsonPath = path.join(wsPath, '.claude', 'launch.json');
        const raw = fs.readFileSync(launchJsonPath, 'utf8');
        const parsed = JSON.parse(raw);
        const port = parsed?.configurations?.[0]?.port;
        const valid = isValidPort(port);
        return {
            port: valid ? port : DEFAULT_PORT,
            landingPage: DEFAULT_LANDING_PAGE,
            source: valid ? 'launch.json' : 'default',
        };
    } catch {
        return { port: DEFAULT_PORT, landingPage: DEFAULT_LANDING_PAGE, source: 'default' };
    }
}

/**
 * Builds the URL the home page's "Start"/Preview button opens.
 *
 * Fix for #642 ("Preview never refreshes with the latest code -- serves
 * stale cached CSS/JS"): every call appends a fresh cache-busting query
 * param, so re-clicking Start/Preview against an ALREADY-RUNNING dev server
 * always opens a URL the browser has never seen before. That forces a real
 * top-level navigation/fetch instead of the browser reusing whatever it has
 * disk-cached for the previous identical URL -- the same trick the
 * wb-starter shell's own "Clear cache & hard reload" stopgap relies on,
 * applied on cvt's side of the handoff (cvt only ever opens the dev
 * server's URL in the OS browser via vscode.env.openExternal -- it does not
 * own a webview/iframe it could otherwise force-refresh here).
 *
 * `now` is injectable (defaults to Date.now()) so callers/tests get a
 * deterministic, pure function.
 */
/**
 * Waits for a freshly-launched dev server to start accepting connections.
 *
 * #680: the Start button checked the port ONCE, immediately. A server that had
 * not booted yet always read as "down", so the handler spawned a terminal and
 * returned without ever opening a browser — the click looked like a no-op, and
 * every repeat click spawned another `npm start` against a port that was by
 * then in use.
 *
 * `probe` and `delay` are injectable so tests stay deterministic and instant.
 */
export async function waitForPort(
    port: number,
    probe: (port: number) => Promise<boolean>,
    opts: { attempts?: number; intervalMs?: number; delay?: (ms: number) => Promise<void> } = {},
): Promise<boolean> {
    const attempts   = opts.attempts   ?? 20;
    const intervalMs = opts.intervalMs ?? 500;
    const delay      = opts.delay      ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));

    for (let i = 0; i < attempts; i++) {
        if (await probe(port)) { return true; }
        if (i < attempts - 1) { await delay(intervalMs); }
    }
    return false;
}

export function buildPreviewUrl(config: DevServerConfig, now: number = Date.now()): string {
    const landing = config.landingPage || DEFAULT_LANDING_PAGE;
    const sep = landing.includes('?') ? '&' : '?';
    return `http://127.0.0.1:${config.port}/${landing}${sep}cvtPreview=${now.toString(36)}`;
}
