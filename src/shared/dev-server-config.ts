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
        return {
            port: isValidPort(port) ? port : DEFAULT_PORT,
            landingPage: DEFAULT_LANDING_PAGE,
        };
    } catch {
        return { port: DEFAULT_PORT, landingPage: DEFAULT_LANDING_PAGE };
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
export function buildPreviewUrl(config: DevServerConfig, now: number = Date.now()): string {
    const landing = config.landingPage || DEFAULT_LANDING_PAGE;
    const sep = landing.includes('?') ? '&' : '?';
    return `http://127.0.0.1:${config.port}/${landing}${sep}cvtPreview=${now.toString(36)}`;
}
