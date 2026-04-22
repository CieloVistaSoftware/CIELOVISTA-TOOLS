// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Shared status indicator HTML for all panels

/**
 * Returns HTML for a status indicator (running, stopped, etc.)
 * @param status 'running' | 'stopped' | 'healthy' | 'error'
 */
export function getStatusIndicator(status: 'running' | 'stopped' | 'healthy' | 'error'): string {
    if (status === 'running') {
        return `<span class="status-dot running"></span><span>Running</span>`;
    }
    if (status === 'stopped') { 
        return `<span class="status-dot stopped"></span><span>Stopped</span>`;
    }
    if (status === 'healthy') {
        return `<span class="status-dot healthy"></span><span>Healthy</span>`;
    }
    if (status === 'error') {
        return `<span class="status-dot error"></span><span>Error</span>`;
    }
    return `<span class="status-dot"></span><span>Unknown</span>`;
}

/**
 * Returns CSS for the status indicator. Inject this into your webview or panel.
 */
export const STATUS_INDICATOR_CSS = `
 .status-dot { display:inline-block; width:10px; height:10px; border-radius:50%; margin-right:6px; vertical-align:middle; }
 .status-dot.running { background:#3fb950; box-shadow:0 0 6px #3fb950; }
 .status-dot.healthy { background:#3fb950; box-shadow:0 0 6px #3fb950; }
 .status-dot.stopped { background:#e5a000; box-shadow:0 0 6px #e5a000; }
 .status-dot.error { background:#f85149; box-shadow:0 0 6px #f85149; }
`;
// FILE REMOVED BY REQUEST
