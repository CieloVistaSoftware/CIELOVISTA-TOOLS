// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
// Pure HTTP helper utilities shared across features.

import * as http from 'http';

/**
 * Read the full request body from an incoming HTTP request.
 * Rejects if the body exceeds 1 MB to guard against unbounded buffering.
 *
 * @param req - The incoming HTTP request.
 * @returns A promise resolving to the request body as a string.
 */
export async function readRequestBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
            if (body.length > 1024 * 1024) {
                reject(new Error('Request body too large'));
            }
        });
        req.on('end', () => resolve(body));
        req.on('error', reject);
    });
}
