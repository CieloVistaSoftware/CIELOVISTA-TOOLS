// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * server-token.ts — a per-server secret that proves a request to a local
 * HTTP server came from a page that server rendered (#741, #752).
 *
 * A server bound to 127.0.0.1 is reachable from every web page the user has
 * open: the port is ephemeral but can be found by scanning. The server
 * creates one token when it starts, embeds it only in pages it renders, and
 * refuses any request that does not carry it. A page on another origin cannot
 * read this server's pages, so it cannot learn the token.
 *
 * <img> and plain links cannot send headers, so the token travels as a query
 * parameter, SERVER_TOKEN_PARAM.
 *
 * Pure functions, no module state: each server keeps its own token.
 */

import * as crypto from 'crypto';

/** Query parameter that carries the token. */
export const SERVER_TOKEN_PARAM = 't';

/** A new random token: 32 bytes, hex encoded. */
export function createServerToken(): string {
    return crypto.randomBytes(32).toString('hex');
}

/** Constant-time comparison of the server's token with the one a request supplied. */
export function tokenMatches(expected: string, supplied: string | null | undefined): boolean {
    if (!expected || typeof supplied !== 'string') { return false; }
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(supplied, 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** True when the request URL carries the server's token. */
export function requestHasToken(url: URL, expected: string): boolean {
    return tokenMatches(expected, url.searchParams.get(SERVER_TOKEN_PARAM));
}
