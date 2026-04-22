// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Utility to check if a TCP port is open (used for MCP health indicator)
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
// FILE REMOVED BY REQUEST
