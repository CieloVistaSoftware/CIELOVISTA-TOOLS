// Copyright (c) 2025 CieloVista Software. All rights reserved.
// The one port check in cvt (#834): every "is something listening on this
// port?" question in src/ goes through isPortOpen(), and every badge that
// keeps asking goes through watchPort().
import * as net from 'net';

/**
 * Checks if a TCP port is open on localhost.
 * Resolves true if open, false if not.
 */
export function isPortOpen(port: number, timeout = 800): Promise<boolean> {
    return new Promise(resolve => {
        const socket = new net.Socket();
        let isOpen = false;
        socket.setTimeout(timeout);
        socket.once('connect', () => {
            isOpen = true;
            socket.destroy();
        });
        socket.once('timeout', () => {
            socket.destroy();
        });
        socket.once('error', () => {
            socket.destroy();
        });
        socket.once('close', () => {
            resolve(isOpen);
        });
        socket.connect(port, '127.0.0.1');
    });
}

export type PortStatus = 'up' | 'down';

/**
 * Polls a port with isPortOpen(): once now, then every intervalMs. Calls
 * onChange with 'up' or 'down' the first time and whenever the answer
 * changes, never twice in a row with the same status. A tick is skipped
 * while shouldCheck() returns false (a hidden panel, say). Returns a
 * function that stops the polling.
 */
export function watchPort(
    port: number,
    intervalMs: number,
    onChange: (status: PortStatus) => void,
    shouldCheck: () => boolean = () => true,
): () => void {
    let lastStatus: PortStatus | null = null;
    let stopped = false;

    const check = (): void => {
        if (stopped || !shouldCheck()) { return; }
        void isPortOpen(port).then(open => {
            const status: PortStatus = open ? 'up' : 'down';
            if (stopped || status === lastStatus) { return; }
            lastStatus = status;
            onChange(status);
        });
    };

    check(); // immediate first check
    const id = setInterval(check, intervalMs);
    return () => { stopped = true; clearInterval(id); };
}
