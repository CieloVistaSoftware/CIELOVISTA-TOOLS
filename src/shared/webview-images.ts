// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * webview-images.ts — what a webview needs to show the images in rendered
 * markdown (#737).
 *
 * md-renderer turns ![alt](src) into <img alt src>. Inside a webview that
 * image only appears when two things are true:
 *
 *   1. The page's Content-Security-Policy has an img-src that allows it.
 *      Without one, default-src 'none' blocks every image.
 *   2. A relative src ("./diagram.png") has been turned into a webview URI,
 *      and the folder it lives in is one of the panel's localResourceRoots.
 *      A bare relative path resolves against the webview's own origin, where
 *      the file does not exist.
 *
 * Pure functions only: the caller passes in the webview's cspSource and its
 * asWebviewUri, so this file never imports vscode.
 */

import * as path from 'path';

/**
 * The img-src directive for a webview that shows rendered markdown.
 * Local files arrive through the webview's own resource origin (cspSource);
 * remote images must be https; inline images are data: URIs. Plain http: is
 * deliberately not allowed.
 */
export function markdownImgSrc(cspSource: string): string {
    return `img-src ${cspSource} https: data:`;
}

/** Result of rewriting a rendered document's image sources. */
export interface RewrittenImages {
    /** The HTML with every relative image src replaced by a webview URI. */
    html: string;
    /**
     * Folders the webview must be allowed to read from: the document's own
     * folder first, then the folder of each local image it references
     * (which differs when the doc uses "../images/x.png").
     */
    resourceRoots: string[];
}

/** A src that already names its own origin: https:, data:, vscode-webview:, //host, #frag. */
function isNonLocalSrc(src: string): boolean {
    if (/^[a-zA-Z]:[\\/]/.test(src)) { return false; }      // Windows drive path — local
    return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(src) || src.startsWith('//') || src.startsWith('#');
}

function decodeAttr(s: string): string {
    return s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function encodeAttr(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/**
 * Rewrite every local <img src> in rendered HTML to a webview URI.
 *
 * @param html         rendered markdown (md-renderer output)
 * @param docDir       folder of the document; relative srcs resolve against it
 * @param toWebviewUri turns an absolute file path into the string the webview
 *                     can load — pass (p) => webview.asWebviewUri(Uri.file(p)).toString()
 */
export function rewriteLocalImageSrcs(
    html: string,
    docDir: string,
    toWebviewUri: (absPath: string) => string
): RewrittenImages {
    const roots = new Set<string>([path.resolve(docDir)]);

    const out = html.replace(/(<img\b[^>]*?\ssrc=)"([^"]*)"/gi, (match: string, head: string, rawSrc: string) => {
        const src = decodeAttr(rawSrc).trim();
        if (!src || isNonLocalSrc(src)) { return match; }

        let filePart = src.replace(/[?#].*$/, '');
        try { filePart = decodeURIComponent(filePart); } catch { /* keep raw value */ }
        if (!filePart) { return match; }

        const absPath = path.resolve(docDir, filePart);
        roots.add(path.dirname(absPath));
        return `${head}"${encodeAttr(toWebviewUri(absPath))}"`;
    });

    return { html: out, resourceRoots: [...roots] };
}
