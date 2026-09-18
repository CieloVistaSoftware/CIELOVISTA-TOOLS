// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * local-image-route.ts — serve the images next to a document from a local
 * HTTP server, and only those (#741).
 *
 * "View a Doc" renders markdown into a page served from
 * http://127.0.0.1:PORT/doc?path=... and opened in the system browser. A
 * relative image ("./diagram.png") in that page resolves against the server
 * URL, and nothing on the server answered for it, so the image was broken.
 *
 * The fix has two halves, both here:
 *
 *   1. rewriteImagesToRoute() turns every local <img src> in the rendered
 *      HTML into  http://127.0.0.1:PORT/img?path=<absolute file path>&t=<token>.
 *      It reuses rewriteLocalImageSrcs() from webview-images.ts (#737), the
 *      same resolver the doc preview uses; only the URL it produces differs.
 *
 *   2. serveImageRequest() answers /img. It is a file-serving route on a
 *      socket any local process (or any web page, via <img>) can reach, so it
 *      refuses everything that is not plainly an image inside an allowed root:
 *
 *        - the request must carry the server's token (server-token.ts); only
 *          pages this server rendered have it, so another web page cannot
 *          use the route at all
 *        - the path must be absolute and free of NUL bytes
 *        - the extension must be a known image type (no .env, .ts, .json ...)
 *        - the resolved path must sit inside one of the allowed roots — the
 *          server decides the roots, the request never does, so ../ segments,
 *          %2e%2e, and absolute paths elsewhere are all refused
 *        - after following symlinks the real file must STILL be inside a root
 *          and STILL have an image extension (a link named x.png pointing at
 *          ~/.ssh/id_rsa is refused)
 *        - only GET and HEAD
 *
 *      Responses carry nosniff and a sandboxing CSP, so an SVG opened directly
 *      cannot run script in the server's origin.
 *
 * Pure functions plus one request handler that takes its roots as an
 * argument; no vscode import, no module state.
 */

import * as fs from 'fs';
import * as path from 'path';
import type * as http from 'http';
import { rewriteLocalImageSrcs } from './webview-images';
import { SERVER_TOKEN_PARAM, requestHasToken } from './server-token';

/** The route the rewritten image URLs point at. */
export const IMAGE_ROUTE = '/img';

/** The only file types the route will serve, with their Content-Type. */
export const IMAGE_CONTENT_TYPES: Readonly<Record<string, string>> = Object.freeze({
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif':  'image/gif',
    '.webp': 'image/webp',
    '.svg':  'image/svg+xml',
    '.bmp':  'image/bmp',
    '.ico':  'image/x-icon',
    '.avif': 'image/avif',
});

/** Outcome of checking one /img request. */
export type ImageResolution =
    | { ok: true;  absPath: string; contentType: string }
    | { ok: false; status: 400 | 403 | 404; reason: string };

/** The URL a page should use to load the image at absPath through the route. */
export function imageRouteUrl(origin: string, absPath: string, token: string): string {
    return `${origin.replace(/\/+$/, '')}${IMAGE_ROUTE}?path=${encodeURIComponent(absPath)}` +
        `&${SERVER_TOKEN_PARAM}=${encodeURIComponent(token)}`;
}

/**
 * Rewrite every local <img src> in rendered markdown to the image route.
 * Remote (https:), data: and fragment sources are left alone.
 *
 * @param html   rendered markdown (md-renderer output)
 * @param docDir folder of the document; relative srcs resolve against it
 * @param origin the server origin, e.g. http://127.0.0.1:51234
 * @param token  the server's token (server-token.ts)
 */
export function rewriteImagesToRoute(html: string, docDir: string, origin: string, token: string): string {
    return rewriteLocalImageSrcs(html, docDir, (absPath: string) => imageRouteUrl(origin, absPath, token)).html;
}

function contentTypeOf(p: string): string | undefined {
    return IMAGE_CONTENT_TYPES[path.extname(p).toLowerCase()];
}

/** True when child is root itself or somewhere beneath it (after normalising both). */
export function isInsideRoot(child: string, root: string): boolean {
    const rel = path.relative(path.resolve(root), path.resolve(child));
    if (rel === '') { return true; }
    return rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel);
}

function realOrSelf(p: string): string {
    try { return fs.realpathSync.native(p); } catch { return path.resolve(p); }
}

/**
 * Decide whether an /img request may be served.
 *
 * @param requestedPath the ?path= value, already URL-decoded once by URL parsing
 * @param allowedRoots  folders the server is willing to serve images from
 */
export function resolveServableImage(
    requestedPath: string | null | undefined,
    allowedRoots: readonly string[]
): ImageResolution {
    if (!requestedPath) { return { ok: false, status: 400, reason: 'missing path' }; }
    if (requestedPath.includes('\0')) { return { ok: false, status: 400, reason: 'NUL byte in path' }; }
    if (!path.isAbsolute(requestedPath)) { return { ok: false, status: 400, reason: 'path is not absolute' }; }

    const absPath = path.resolve(requestedPath);
    if (!contentTypeOf(absPath)) { return { ok: false, status: 403, reason: 'not an image type' }; }

    const roots = allowedRoots.filter(Boolean).map(r => path.resolve(r));
    if (!roots.some(r => isInsideRoot(absPath, r))) {
        return { ok: false, status: 403, reason: 'outside the allowed folders' };
    }

    let stat: fs.Stats;
    try { stat = fs.statSync(absPath); } catch { return { ok: false, status: 404, reason: 'not found' }; }
    if (!stat.isFile()) { return { ok: false, status: 404, reason: 'not a file' }; }

    // Symlinks: the file actually read must pass the same two checks.
    const realPath = realOrSelf(absPath);
    const realType = contentTypeOf(realPath);
    if (!realType) { return { ok: false, status: 403, reason: 'link target is not an image type' }; }
    if (!roots.some(r => isInsideRoot(realPath, realOrSelf(r)))) {
        return { ok: false, status: 403, reason: 'link target is outside the allowed folders' };
    }

    return { ok: true, absPath: realPath, contentType: realType };
}

/**
 * Answer one /img request on a node http server.
 * The caller routes url.pathname === IMAGE_ROUTE here and supplies the roots
 * and its token.
 */
export function serveImageRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    url: URL,
    allowedRoots: readonly string[],
    token: string
): void {
    const baseHeaders = {
        'X-Content-Type-Options':  'nosniff',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        'Cache-Control':           'no-cache',
    };

    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { ...baseHeaders, 'Allow': 'GET, HEAD', 'Content-Type': 'text/plain' });
        res.end('Method not allowed');
        return;
    }

    if (!requestHasToken(url, token)) {
        res.writeHead(403, { ...baseHeaders, 'Content-Type': 'text/plain' });
        res.end('Refused');
        return;
    }

    const result = resolveServableImage(url.searchParams.get('path'), allowedRoots);
    if (!result.ok) {
        res.writeHead(result.status, { ...baseHeaders, 'Content-Type': 'text/plain' });
        res.end(result.status === 404 ? 'Not found' : 'Refused');
        return;
    }

    fs.readFile(result.absPath, (err, data) => {
        if (err) {
            res.writeHead(404, { ...baseHeaders, 'Content-Type': 'text/plain' });
            res.end('Not found');
            return;
        }
        res.writeHead(200, { ...baseHeaders, 'Content-Type': result.contentType, 'Content-Length': data.length });
        res.end(req.method === 'HEAD' ? undefined : data);
    });
}
