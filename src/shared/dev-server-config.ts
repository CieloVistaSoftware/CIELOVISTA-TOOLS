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
