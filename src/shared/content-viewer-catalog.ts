// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * ContentViewerCatalog — Webview panel for rendering a folder/file catalog from JSON.
 *
 * Usage:
 *   import { showContentViewerCatalog } from './content-viewer-catalog';
 *   showContentViewerCatalog({ title, catalogJson });
 */

import * as vscode from 'vscode';

let _panel: vscode.WebviewPanel | undefined;

export interface CatalogFile { name: string; path: string; }
export interface CatalogFolder { name: string; path: string; files: CatalogFile[]; }
export interface CatalogJson { folders: CatalogFolder[]; }

export interface ContentViewerCatalogOptions {
    title: string;
    catalogJson: CatalogJson;
}

export function showContentViewerCatalog(opts: ContentViewerCatalogOptions): void {
    const html = buildHtml(opts.title, opts.catalogJson);
    if (_panel) {
        _panel.title = `\u{1F4C4} ${opts.title}`;
        _panel.webview.html = html;
        _panel.reveal(vscode.ViewColumn.Beside, true);
        return;
    }
    _panel = vscode.window.createWebviewPanel(
        'contentViewerCatalog', `\u{1F4C4} ${opts.title}`,
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
        { enableScripts: true, retainContextWhenHidden: true }
    );
    _panel.webview.html = html;
    _panel.onDidDispose(() => { _panel = undefined; });
    _panel.webview.onDidReceiveMessage(async msg => {
        if (msg.command === 'openFile' && msg.path) {
            const doc = await vscode.workspace.openTextDocument(msg.path);
            await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
        }
        if (msg.command === 'openFolder' && msg.folder) {
            await vscode.commands.executeCommand(
                'vscode.openFolder', vscode.Uri.file(msg.folder), { forceNewWindow: true }
            );
        }
    });
}

function escapeHtml(s: string): string {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---------------------------------------------------------------------------
// buildHtml
// All browser JS is built via plain string concatenation (not template literal)
// so that regex patterns containing ${ never conflict with TS template parsing.
// ---------------------------------------------------------------------------
function buildHtml(title: string, catalog: CatalogJson): string {
    const safeTitle   = escapeHtml(title);
    const catalogJson = JSON.stringify(catalog);

    // CSS — no interpolation needed, kept as a constant string
    const CSS = [
        'body{font-family:var(--vscode-font-family);font-size:14px;',
        'color:var(--vscode-editor-foreground);background:var(--vscode-editor-background);margin:0;padding:0}',
        '#topbar{padding:10px 18px;background:var(--vscode-editor-background);',
        'border-bottom:1px solid var(--vscode-panel-border);font-weight:bold;font-size:1.1em;',
        'display:flex;align-items:center;gap:12px;flex-wrap:wrap}',
        '#search-bar{flex:1;min-width:180px;max-width:420px;',
        'background:var(--vscode-input-background,#222);color:var(--vscode-input-foreground,#fff);',
        'border:1px solid var(--vscode-panel-border);border-radius:5px;padding:6px 14px;',
        'font-size:14px;margin-left:18px}',
        '#catalog{padding:24px 2vw 48px;max-width:1200px;width:100%}',
        '.catalog-table{width:100%;border-collapse:separate;border-spacing:0 18px;table-layout:auto}',
        '.catalog-row{vertical-align:top}',
        '.folder-col{width:220px;min-width:120px;max-width:30vw;padding-right:24px}',
        '.folder-label{display:flex;align-items:center;gap:8px;font-weight:bold;font-size:1.08em}',
        '.folder-badge{background:#222d;color:#fff;font-size:11px;border-radius:6px;',
        'padding:2px 10px;margin-left:2px;font-family:monospace}',
        '.folder-icon{cursor:pointer;margin-right:4px;color:#e2b86a;font-size:1.1em;transition:filter 0.15s}',
        '.folder-icon:hover{filter:brightness(1.3)}',
        '.doc-col{}',
        '.doc-chips{display:flex;flex-wrap:wrap;gap:7px}',
        '.doc-chip{background:var(--vscode-button-secondaryBackground,#222);',
        'color:var(--vscode-button-secondaryForeground,#fff);border-radius:6px;padding:4px 12px;',
        'font-size:13px;cursor:pointer;border:none;outline:none;transition:background 0.15s;margin-bottom:4px}',
        '.doc-chip:hover{background:var(--vscode-button-secondaryHoverBackground,#444);color:#fff}',
        '.highlight{background:#ffe066;color:#222;border-radius:3px;padding:0 2px}',
        '@media(max-width:700px){',
        '#catalog{padding:12px 2vw 24px}',
        '.catalog-table,.catalog-row,.folder-col,.doc-col{display:block;',
        'width:100% !important;max-width:100% !important;min-width:0 !important}',
        '.folder-col{padding-right:0;margin-bottom:6px}',
        '.doc-chips{gap:5px}}',
    ].join('');

    // Browser JS — built with plain string concat so regex literals are in single-quoted strings,
    // which TypeScript does NOT parse for ${ interpolation.
    const JS = [
        '(function(){',
        'var vscode=acquireVsCodeApi();',
        'var catalog=' + catalogJson + ';',
        'function escH(s){',
        '  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");',
        '}',
        'function highlight(text,q){',
        '  if(!q)return escH(text);',
        // regex pattern built via concat to keep ${ out of single-quoted strings
        '  var pat="[.*+?^${}()|[\\\\]\\\\\\\\]";',
        '  var esc=q.replace(new RegExp(pat,"g"),"\\\\$&");',
        '  var hi="<span class=\\"highlight\\">$1</span>";',
        '  return escH(text).replace(new RegExp("("+esc+")","ig"),hi);',
        '}',
        'function render(){',
        '  var tbody=document.getElementById("catalog-tbody");',
        '  if(!tbody)return;',
        '  tbody.innerHTML="";',
        '  var q=(document.getElementById("search-bar").value||"").trim().toLowerCase();',
        '  for(var fi=0;fi<catalog.folders.length;fi++){',
        '    var folder=catalog.folders[fi];',
        '    var files=q?folder.files.filter(function(f){',
        '      return f.name.toLowerCase().indexOf(q)>=0||folder.name.toLowerCase().indexOf(q)>=0;',
        '    }):folder.files;',
        '    if(files.length===0&&!(q&&folder.name.toLowerCase().indexOf(q)>=0))continue;',
        '    var tr=document.createElement("tr");tr.className="catalog-row";',
        '    var tdF=document.createElement("td");tdF.className="folder-col";',
        '    var lbl=document.createElement("span");lbl.className="folder-label";',
        '    var ico=document.createElement("span");ico.className="folder-icon";',
        '    ico.innerHTML="&#128193;";ico.title="Open folder";',
        '    (function(fp){ico.onclick=function(){vscode.postMessage({command:"openFolder",folder:fp});};})(folder.path);',
        '    lbl.appendChild(ico);',
        '    var nm=document.createElement("span");nm.innerHTML=highlight(folder.name,q);lbl.appendChild(nm);',
        '    var bdg=document.createElement("span");bdg.className="folder-badge";',
        '    bdg.textContent=String(folder.files.length);lbl.appendChild(bdg);',
        '    tdF.appendChild(lbl);tr.appendChild(tdF);',
        '    var tdD=document.createElement("td");tdD.className="doc-col";',
        '    var chips=document.createElement("div");chips.className="doc-chips";',
        '    for(var ci=0;ci<files.length;ci++){',
        '      var file=files[ci];',
        '      var chip=document.createElement("button");chip.className="doc-chip";',
        '      chip.innerHTML=highlight(file.name,q);',
        '      (function(fp){chip.onclick=function(){vscode.postMessage({command:"openFile",path:fp});};})(file.path);',
        '      chips.appendChild(chip);',
        '    }',
        '    tdD.appendChild(chips);tr.appendChild(tdD);tbody.appendChild(tr);',
        '  }',
        '}',
        'document.getElementById("search-bar").addEventListener("input",render);',
        'render();',
        '})();',
    ].join('\n');

    return (
        '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
        '<style>' + CSS + '</style></head><body>' +
        '<div id="topbar">&#128196; ' + safeTitle +
        '  <input id="search-bar" type="text" placeholder="Search docs, folders..." autocomplete="off" /></div>' +
        '<div id="catalog"><table class="catalog-table"><tbody id="catalog-tbody"></tbody></table></div>' +
        '<script>' + JS + '</script>' +
        '</body></html>'
    );
}

export function disposeContentViewerCatalog(): void {
    _panel?.dispose();
    _panel = undefined;
}
