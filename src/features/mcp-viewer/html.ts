// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * mcp-viewer/html.ts
 *
 * Builds the browser HTML for the MCP Endpoint Viewer. Served by the local
 * HTTP server in `index.ts`. Four tabs, each calls the matching `/api/*`
 * endpoint and renders the JSON result.
 *
 * Follows the View a Doc visual convention: dark theme, same colors.
 * Links rendered in yellow (#FFD700) per project link-visibility rule.
 */

export function buildViewerHtml(port: number, totalProjects: number): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>MCP Endpoint Viewer</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><polygon points='50,5 61,35 95,35 68,57 79,91 50,70 21,91 32,57 5,35 39,35' fill='%230078d4'/></svg>">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;color:#d4d4d4;background:#1e1e1e;display:flex;flex-direction:column;min-height:100vh}

/* Top bar */
#topbar{display:flex;align-items:center;gap:14px;padding:10px 18px;background:#252526;border-bottom:1px solid #404040;flex-shrink:0}
#topbar h1{font-size:1em;font-weight:700;color:#d4d4d4;white-space:nowrap;display:flex;align-items:center;gap:8px}
#topbar h1 .dot{width:8px;height:8px;border-radius:50%;background:#3fb950;box-shadow:0 0 5px #3fb950}
#stat{font-size:11px;color:#858585;margin-left:auto}
#stat b{color:#9cdcfe;font-weight:700}

/* Tabs */
#tabs{display:flex;gap:1px;background:#252526;border-bottom:1px solid #404040;padding:0 14px;flex-shrink:0}
.tab{padding:9px 18px;background:transparent;color:#858585;border:none;cursor:pointer;font-family:inherit;font-size:12px;font-weight:600;border-bottom:2px solid transparent;transition:all .12s}
.tab:hover{color:#d4d4d4}
.tab.active{color:#9cdcfe;border-bottom-color:#0078d4;background:#1e1e1e}

/* Controls bar (optional inputs per endpoint) */
#controls{padding:10px 18px;background:#1e1e1e;border-bottom:1px solid #2d2d2d;display:none;align-items:center;gap:10px;flex-shrink:0}
#controls.show{display:flex}
#controls label{font-size:11px;color:#858585;font-weight:600}
#controls input,#controls select{padding:5px 9px;background:#3c3c3c;color:#d4d4d4;border:1px solid #555;border-radius:3px;font-size:12px;font-family:inherit;outline:none;min-width:180px}
#controls input:focus,#controls select:focus{border-color:#0078d4}
#btn-run{background:#0078d4;color:#fff;border:none;border-radius:3px;padding:5px 14px;cursor:pointer;font-size:12px;font-weight:600}
#btn-run:hover{background:#1b8ae5}
#btn-run:disabled{background:#444;cursor:not-allowed;opacity:.6}

/* Main content */
#main{flex:1;overflow:auto;padding:14px 18px 40px}
#meta{font-size:10px;color:#555;margin-bottom:10px;font-family:monospace}
#meta .ok{color:#3fb950}
#meta .err{color:#f85149}

/* Empty/loading states */
.state{padding:30px;text-align:center;color:#555;font-size:12px}
.state.err{color:#f85149;background:rgba(248,81,73,.05);border:1px solid rgba(248,81,73,.3);border-radius:4px}

/* Tables */
table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:12px}
th{position:sticky;top:0;background:#252526;padding:7px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#858585;border-bottom:1px solid #404040;white-space:nowrap;z-index:1}
td{padding:6px 10px;border-bottom:1px solid #2d2d2d;vertical-align:top}
tr:hover td{background:#252526}

/* Cell formatting */
.c-idx{font-family:monospace;font-size:10px;color:#858585;text-align:right;width:40px}
.c-name{font-weight:700;color:#9cdcfe;white-space:nowrap}
.c-type{font-family:monospace;font-size:10px;color:#ce9178;background:#2d2d2d;padding:1px 6px;border-radius:3px;display:inline-block}
.c-path{font-family:monospace;font-size:10px;color:#858585;word-break:break-all}
.c-desc{color:#d4d4d4;font-size:11px;line-height:1.5}
.c-desc.empty{color:#555;font-style:italic}
.c-title{color:#d4d4d4;font-weight:500;max-width:360px}
.c-file{font-family:monospace;font-size:10px;color:#4ec9b0}
.c-proj{font-family:monospace;font-size:10px;color:#9cdcfe}

/* Status pills — one background per lifecycle stage, consistent across tables. */
.c-status{font-family:monospace;font-size:10px;font-weight:700;padding:1px 7px;border-radius:3px;display:inline-block;text-transform:uppercase;letter-spacing:.04em}
.c-status.product{color:#3fb950;background:rgba(63,185,80,.12);border:1px solid rgba(63,185,80,.3)}
.c-status.workbench{color:#58a6ff;background:rgba(88,166,255,.12);border:1px solid rgba(88,166,255,.3)}
.c-status.generated{color:#d29922;background:rgba(210,153,34,.12);border:1px solid rgba(210,153,34,.3)}
.c-status.archived{color:#858585;background:rgba(133,133,133,.12);border:1px solid rgba(133,133,133,.3)}

/* Links — yellow per project rule */
a{color:#FFD700;text-decoration:none}
a:hover{text-decoration:underline}

/* Group headers inside catalog */
.group-hd{margin:18px 0 6px;padding:6px 10px;background:#252526;border-left:3px solid #0078d4;font-weight:700;font-size:12px;color:#9cdcfe;display:flex;align-items:center;justify-content:space-between}
.group-hd .count{font-weight:400;font-size:10px;color:#858585}

/* JSON fallback view */
pre.json{background:#1a1a1a;border:1px solid #2d2d2d;border-radius:4px;padding:12px;font-family:'Cascadia Code','Fira Code',Consolas,monospace;font-size:11px;color:#d4d4d4;overflow-x:auto;line-height:1.5}

/* Toast */
#toast{position:fixed;bottom:16px;right:16px;background:#2d333b;color:#cae8ff;border:1px solid #58a6ff;border-radius:4px;padding:6px 14px;font-size:11px;z-index:999;opacity:0;transition:opacity .2s;pointer-events:none}
#toast.show{opacity:1}
</style>
</head>
<body>

<div id="topbar">
  <h1><span class="dot"></span>MCP Endpoint Viewer</h1>
  <span id="stat"><b id="stat-count">${totalProjects}</b> projects registered</span>
</div>

<div id="tabs">
  <button class="tab active" data-endpoint="list_projects">list_projects</button>
  <button class="tab" data-endpoint="find_project">find_project</button>
  <button class="tab" data-endpoint="search_docs">search_docs</button>
  <button class="tab" data-endpoint="get_catalog">get_catalog</button>
  <button class="tab" data-endpoint="list_symbols">list_symbols</button>
  <button class="tab" data-endpoint="find_symbol">find_symbol</button>
  <button class="tab" data-endpoint="list_cvt_commands">list_cvt_commands</button>
  <button class="tab" data-endpoint="lookup_dewey">lookup_dewey</button>
</div>

<div id="controls"></div>

<div id="main">
  <div id="meta"></div>
  <div id="result"><div class="state">Loading list_projects&hellip;</div></div>
</div>

<div id="toast"></div>

<script>
(function(){
var BASE = 'http://127.0.0.1:${port}';

var tabsEl     = document.getElementById('tabs');
var controlsEl = document.getElementById('controls');
var metaEl     = document.getElementById('meta');
var resultEl   = document.getElementById('result');
var toastEl    = document.getElementById('toast');

var currentEndpoint = 'list_projects';
var catalogSortBy = 'recent';
var projectOptions = [];

/* Control templates per endpoint. */
var CONTROLS = {
  list_projects: '<label for="status">status</label>' +
                '<select id="status"><option value="">all</option><option value="product">product</option><option value="workbench">workbench</option><option value="generated">generated</option><option value="archived">archived</option></select>' +
                '<button id="btn-run">Run</button>',
  find_project: '<label for="q">query</label>' +
                '<input id="q" type="text" placeholder="e.g. wb, catalog, cielovista" autocomplete="off">' +
                '<label for="status">status</label>' +
                '<select id="status"><option value="">all</option><option value="product">product</option><option value="workbench">workbench</option><option value="generated">generated</option><option value="archived">archived</option></select>' +
                '<button id="btn-run">Run</button>',
  search_docs:  '<label for="q">query</label>' +
                '<input id="q" type="text" placeholder="e.g. catalog, readme, mcp" autocomplete="off">' +
                '<label for="proj">project (optional)</label>' +
                '<input id="proj" type="text" placeholder="exact project name" autocomplete="off">' +
                '<button id="btn-run">Run</button>',
  get_catalog:  '<label for="proj">project (optional)</label>' +
                '<select id="proj"><option value="">blank = all projects</option></select>' +
                '<label for="sortBy">sort</label>' +
                '<select id="sortBy"><option value="recent" selected>most recent date</option><option value="title">title</option><option value="file">file</option><option value="description">description</option></select>' +
                '<button id="btn-run">Run</button>',
  list_symbols: '<label for="q">query</label>' +
                '<input id="q" type="text" placeholder="name, signature, or doc text" autocomplete="off" style="min-width:220px">' +
                '<label for="kind">kind</label>' +
                '<select id="kind"><option value="">any</option><option>function</option><option>class</option><option>interface</option><option>type</option><option>const</option><option>enum</option><option>export</option></select>' +
                '<label for="role">role</label>' +
                '<select id="role"><option value="">any</option><option>src</option><option>script</option><option>test</option><option>declaration</option></select>' +
                '<label for="proj">project</label>' +
                '<input id="proj" type="text" placeholder="optional" autocomplete="off">' +
                '<label><input id="exportedOnly" type="checkbox"> exported only</label>' +
                '<button id="btn-run">Run</button>',
  find_symbol:  '<label for="name">name</label>' +
                '<input id="name" type="text" placeholder="exact or prefix, e.g. sendToCopilotChat" autocomplete="off" style="min-width:240px">' +
                '<button id="btn-run">Run</button>',
  list_cvt_commands: '<label for="group">group (optional)</label>' +
                '<input id="group" type="text" placeholder="e.g. Other Tools, Doc Auditor" autocomplete="off">' +
                '<button id="btn-run">Run</button>',
  lookup_dewey: '<label for="q">dewey query</label>' +
                '<input id="q" type="text" placeholder="e.g. 1400.005, 1400, 005" autocomplete="off">' +
                '<label for="proj">project (optional)</label>' +
                '<input id="proj" type="text" placeholder="exact project name" autocomplete="off">' +
                '<label><input id="includeCommands" type="checkbox" checked> include commands</label>' +
                '<button id="btn-run">Run</button>'
};

function toast(msg){
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(function(){ toastEl.classList.remove('show'); }, 1800);
}

function esc(s){
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function setMeta(url, status, ms, extra){
  var cls = status >= 200 && status < 300 ? 'ok' : 'err';
  var tail = extra ? ' &middot; ' + esc(extra) : '';
  metaEl.innerHTML = 'GET ' + esc(url) + ' &middot; <span class="' + cls + '">' + status + '</span> &middot; ' + ms + 'ms' + tail;
}

function statusPill(s){
  var st = s || 'product';
  return '<span class="c-status ' + esc(st) + '">' + esc(st) + '</span>';
}

function renderProjectsTable(data){
  var projects = (data && data.projects) || [];
  if (!projects.length) {
    resultEl.innerHTML = '<div class="state">No projects in registry.</div>';
    return;
  }
  var rows = projects.map(function(p, i){
    var descClass = p.description ? 'c-desc' : 'c-desc empty';
    var descText  = p.description ? esc(p.description) : '(empty)';
    return '<tr>' +
      '<td class="c-idx">' + (i + 1) + '</td>' +
      '<td class="c-name">' + esc(p.name) + '</td>' +
      '<td>' + statusPill(p.status) + '</td>' +
      '<td><span class="c-type">' + esc(p.type) + '</span></td>' +
      '<td class="' + descClass + '">' + descText + '</td>' +
      '<td class="c-path">' + esc(p.path) + '</td>' +
      '</tr>';
  }).join('');
  resultEl.innerHTML =
    '<table>' +
      '<thead><tr><th>#</th><th>Name</th><th>Status</th><th>Type</th><th>Description</th><th>Path</th></tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table>';
}

function renderFindProjectTable(data){
  var matches = (data && data.matches) || [];
  if (!matches.length) {
    resultEl.innerHTML = '<div class="state">No matches for &ldquo;' + esc(data.query || '') + '&rdquo;.</div>';
    return;
  }
  var rows = matches.map(function(p, i){
    return '<tr>' +
      '<td class="c-idx">' + (i + 1) + '</td>' +
      '<td class="c-name">' + esc(p.name) + '</td>' +
      '<td>' + statusPill(p.status) + '</td>' +
      '<td><span class="c-type">' + esc(p.type) + '</span></td>' +
      '<td class="c-desc">' + esc(p.description || '') + '</td>' +
      '<td class="c-path">' + esc(p.path) + '</td>' +
      '</tr>';
  }).join('');
  resultEl.innerHTML =
    '<table>' +
      '<thead><tr><th>#</th><th>Name</th><th>Status</th><th>Type</th><th>Description</th><th>Path</th></tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table>';
}

function renderDocsTable(data){
  var matches = (data && (data.matches || data.docs)) || [];
  if (!matches.length) {
    var q = data.query ? ' for &ldquo;' + esc(data.query) + '&rdquo;' : '';
    resultEl.innerHTML = '<div class="state">No matches' + q + '.</div>';
    return;
  }

  var docsSorted = sortDocs(matches, currentEndpoint === 'get_catalog' ? catalogSortBy : 'recent');

  /* Group by project name for readability. */
  var groups = {};
  var order  = [];
  for (var i = 0; i < docsSorted.length; i++) {
    var m = docsSorted[i];
    var key = m.projectName || '(unknown)';
    if (!groups[key]) { groups[key] = []; order.push(key); }
    groups[key].push(m);
  }

  var html = '';
  for (var g = 0; g < order.length; g++) {
    var proj = order[g];
    var docs = groups[proj];
    html += '<div class="group-hd"><span>' + esc(proj) + '</span><span class="count">' + docs.length + ' doc' + (docs.length === 1 ? '' : 's') + '</span></div>';
    html += '<table><thead><tr><th>#</th><th>Title</th><th>File</th><th>Updated</th><th>Description</th></tr></thead><tbody>';
    for (var j = 0; j < docs.length; j++) {
      var d = docs[j];
      var descClass = d.description ? 'c-desc' : 'c-desc empty';
      var descText  = d.description ? esc(d.description) : '(empty)';
      var mdLink = BASE + '/md-preview?path=' + encodeURIComponent(d.filePath || '');
      html += '<tr>' +
        '<td class="c-idx">' + (j + 1) + '</td>' +
        '<td class="c-title"><a href="' + esc(mdLink) + '" target="_blank" rel="noopener" title="Open rendered markdown in new tab">' + esc(d.title || d.fileName) + '</a></td>' +
        '<td class="c-file" title="' + esc(d.filePath) + '"><a href="' + esc(mdLink) + '" target="_blank" rel="noopener" title="Open rendered markdown in new tab">' + esc(d.fileName) + '</a></td>' +
        '<td class="c-path" title="' + esc(d.lastModified || '') + '">' + esc(formatStamp(d.lastModified)) + '</td>' +
        '<td class="' + descClass + '">' + descText + '</td>' +
        '</tr>';
    }
    html += '</tbody></table>';
  }
  resultEl.innerHTML = html;
}

function renderSymbolsTable(data){
  var matches = (data && data.matches) || [];
  if (!matches.length) {
    resultEl.innerHTML = '<div class="state">No matching symbols.</div>';
    return;
  }
  /* Group by project for readability. */
  var groups = {}; var order = [];
  for (var i = 0; i < matches.length; i++) {
    var key = matches[i].projectName || '(unknown)';
    if (!groups[key]) { groups[key] = []; order.push(key); }
    groups[key].push(matches[i]);
  }
  var html = '';
  for (var g = 0; g < order.length; g++) {
    var proj = order[g];
    var syms = groups[proj];
    html += '<div class="group-hd"><span>' + esc(proj) + '</span><span class="count">' + syms.length + ' symbol' + (syms.length === 1 ? '' : 's') + '</span></div>';
    html += '<table><thead><tr><th>Name</th><th>Kind</th><th>Role</th><th>Exp</th><th>Signature / Doc</th><th>File : line</th></tr></thead><tbody>';
    for (var j = 0; j < syms.length; j++) {
      var s = syms[j];
      var doc = s.docComment ? '<div style="color:#858585;font-size:10px;margin-top:4px;white-space:pre-wrap">' + esc(s.docComment.replace(/^\\s*\\/\\*\\*/, '').replace(/\\*\\/\\s*$/, '').replace(/^\\s*\\*\\s?/gm, '')) + '</div>' : '';
      var locShort = s.sourceFile.split(/[\\\\/]/).slice(-3).join('/') + ' : ' + s.line;
      html += '<tr>' +
        '<td class="c-name">' + esc(s.name) + '</td>' +
        '<td><span class="c-type">' + esc(s.kind) + '</span></td>' +
        '<td><span class="c-type">' + esc(s.role) + '</span></td>' +
        '<td class="c-desc">' + (s.exported ? '<span style="color:#3fb950">yes</span>' : '<span style="color:#858585">no</span>') + '</td>' +
        '<td class="c-desc"><code style="font-size:10px">' + esc(s.signature) + '</code>' + doc + '</td>' +
        '<td class="c-path" title="' + esc(s.sourceFile) + '">' + esc(locShort) + '</td>' +
        '</tr>';
    }
    html += '</tbody></table>';
  }
  resultEl.innerHTML = html;
}

function renderCvtCommandsTable(data){
  var cmds = (data && data.commands) || [];
  if (!cmds.length) {
    resultEl.innerHTML = '<div class="state">No CVT commands match.</div>';
    return;
  }
  /* Group by group name. */
  var groups = {}; var order = [];
  for (var i = 0; i < cmds.length; i++) {
    var key = cmds[i].group || '(ungrouped)';
    if (!groups[key]) { groups[key] = []; order.push(key); }
    groups[key].push(cmds[i]);
  }
  var html = '';
  for (var g = 0; g < order.length; g++) {
    var grp = order[g];
    var gs = groups[grp];
    html += '<div class="group-hd"><span>' + esc(grp) + '</span><span class="count">' + gs.length + ' cmd' + (gs.length === 1 ? '' : 's') + '</span></div>';
    html += '<table><thead><tr><th>Dewey</th><th>ID</th><th>Title</th><th>Scope</th><th>Tags</th><th>Description</th></tr></thead><tbody>';
    for (var j = 0; j < gs.length; j++) {
      var c = gs[j];
      html += '<tr>' +
        '<td class="c-idx">' + esc(c.dewey) + '</td>' +
        '<td class="c-name">' + esc(c.id) + '</td>' +
        '<td class="c-title">' + esc(c.title) + '</td>' +
        '<td><span class="c-type">' + esc(c.scope) + '</span></td>' +
        '<td class="c-desc">' + esc((c.tags || []).join(', ')) + '</td>' +
        '<td class="c-desc">' + esc(c.description) + '</td>' +
        '</tr>';
    }
    html += '</tbody></table>';
  }
  resultEl.innerHTML = html;
}

function renderLookupDewey(data){
  var docs = (data && data.docs) || [];
  var commands = (data && data.commands) || [];
  if (!docs.length && !commands.length) {
    resultEl.innerHTML = '<div class="state">No Dewey matches for &ldquo;' + esc((data && data.query) || '') + '&rdquo;.</div>';
    return;
  }

  var html = '';
  if (docs.length) {
    html += '<div class="group-hd"><span>Documents</span><span class="count">' + docs.length + ' match' + (docs.length === 1 ? '' : 'es') + '</span></div>';
    html += '<table><thead><tr><th>#</th><th>Dewey</th><th>Project</th><th>Title</th><th>File</th><th>Description</th></tr></thead><tbody>';
    for (var i = 0; i < docs.length; i++) {
      var d = docs[i];
      html += '<tr>' +
        '<td class="c-idx">' + (i + 1) + '</td>' +
        '<td class="c-idx">' + esc(d.dewey || '') + '</td>' +
        '<td class="c-proj">' + esc(d.projectName || '') + '</td>' +
        '<td class="c-title">' + esc(d.title || d.fileName || '') + '</td>' +
        '<td class="c-file" title="' + esc(d.filePath || '') + '">' + esc(d.fileName || '') + '</td>' +
        '<td class="c-desc">' + esc(d.description || '') + '</td>' +
        '</tr>';
    }
    html += '</tbody></table>';
  }

  if (commands.length) {
    html += '<div class="group-hd"><span>CVT Commands</span><span class="count">' + commands.length + ' match' + (commands.length === 1 ? '' : 'es') + '</span></div>';
    html += '<table><thead><tr><th>Dewey</th><th>ID</th><th>Title</th><th>Group</th><th>Scope</th><th>Description</th></tr></thead><tbody>';
    for (var j = 0; j < commands.length; j++) {
      var c = commands[j];
      html += '<tr>' +
        '<td class="c-idx">' + esc(c.dewey || '') + '</td>' +
        '<td class="c-name">' + esc(c.id || '') + '</td>' +
        '<td class="c-title">' + esc(c.title || '') + '</td>' +
        '<td class="c-desc">' + esc(c.group || '') + '</td>' +
        '<td><span class="c-type">' + esc(c.scope || '') + '</span></td>' +
        '<td class="c-desc">' + esc(c.description || '') + '</td>' +
        '</tr>';
    }
    html += '</tbody></table>';
  }

  resultEl.innerHTML = html;
}

/* Fetch and render the current endpoint. */
function runEndpoint(params){
  var qs = params ? ('?' + new URLSearchParams(params).toString()) : '';
  var url = BASE + '/api/' + currentEndpoint + qs;
  resultEl.innerHTML = '<div class="state">Loading&hellip;</div>';
  metaEl.textContent = 'GET ' + url + ' ...';
  var t0 = Date.now();
  fetch(url)
    .then(function(res){
      var ms = Date.now() - t0;
      return res.text().then(function(body){
        var json;
        try { json = JSON.parse(body); } catch (e) { json = null; }
        setMeta(url, res.status, ms, json ? (countSummary(json)) : 'non-JSON response');
        if (!res.ok || !json) {
          resultEl.innerHTML = '<div class="state err">' + esc(body) + '</div>';
          return;
        }
        if (currentEndpoint === 'list_projects')  { renderProjectsTable(json); return; }
        if (currentEndpoint === 'find_project')   { renderFindProjectTable(json); return; }
        if (currentEndpoint === 'search_docs')    { renderDocsTable(json); return; }
        if (currentEndpoint === 'get_catalog')    { renderDocsTable(json); return; }
        if (currentEndpoint === 'list_symbols')   { renderSymbolsTable(json); return; }
        if (currentEndpoint === 'find_symbol')    { renderSymbolsTable(json); return; }
        if (currentEndpoint === 'list_cvt_commands') { renderCvtCommandsTable(json); return; }
        if (currentEndpoint === 'lookup_dewey')   { renderLookupDewey(json); return; }
        resultEl.innerHTML = '<pre class="json">' + esc(JSON.stringify(json, null, 2)) + '</pre>';
      });
    })
    .catch(function(err){
      var ms = Date.now() - t0;
      setMeta(url, 0, ms, err.message || 'network error');
      resultEl.innerHTML = '<div class="state err">' + esc(err.message || 'network error') + '</div>';
    });
}

function countSummary(json){
  if (typeof json.projectCount === 'number') { return json.projectCount + ' projects'; }
  if (typeof json.docMatchCount === 'number' || typeof json.commandMatchCount === 'number') {
    var d = typeof json.docMatchCount === 'number' ? json.docMatchCount : 0;
    var c = typeof json.commandMatchCount === 'number' ? json.commandMatchCount : 0;
    return d + ' docs, ' + c + ' commands';
  }
  if (typeof json.matchCount   === 'number') {
    if (typeof json.totalIndexed  === 'number') { return json.matchCount + ' / ' + json.totalIndexed + ' indexed'; }
    if (typeof json.totalCommands === 'number') { return json.matchCount + ' / ' + json.totalCommands + ' commands'; }
    return json.matchCount + ' matches';
  }
  if (typeof json.docCount     === 'number') { return json.docCount + ' docs'; }
  return '';
}

function byMostRecent(a, b){
  var ta = Date.parse((a && a.lastModified) || '') || 0;
  var tb = Date.parse((b && b.lastModified) || '') || 0;
  return tb - ta;
}

function sortDocs(docs, mode){
  var arr = docs.slice();
  if (mode === 'title') {
    arr.sort(function(a,b){ return String(a.title || '').localeCompare(String(b.title || '')); });
  } else if (mode === 'file') {
    arr.sort(function(a,b){ return String(a.fileName || '').localeCompare(String(b.fileName || '')); });
  } else if (mode === 'description') {
    arr.sort(function(a,b){ return String(a.description || '').localeCompare(String(b.description || '')); });
  } else {
    arr.sort(byMostRecent);
  }
  return arr;
}

function formatStamp(iso){
  if (!iso) { return ''; }
  var d = new Date(iso);
  if (isNaN(d.getTime())) { return ''; }
  return d.toLocaleString();
}

function loadProjectOptions(selectEl){
  if (!selectEl) { return; }
  function renderOptions(names){
    var selected = selectEl.value || '';
    var opts = ['<option value="">blank = all projects</option>'];
    for (var i = 0; i < names.length; i++) {
      var n = names[i];
      opts.push('<option value="' + esc(n) + '">' + esc(n) + '</option>');
    }
    selectEl.innerHTML = opts.join('');
    selectEl.value = selected;
  }

  if (projectOptions.length) {
    renderOptions(projectOptions);
    return;
  }

  fetch(BASE + '/api/list_projects')
    .then(function(res){ return res.json(); })
    .then(function(json){
      var rows = (json && json.projects) || [];
      projectOptions = rows.map(function(p){ return p.name; }).sort();
      renderOptions(projectOptions);
    })
    .catch(function(){
      // Keep default blank option only.
    });
}

/* Switch tabs. */
function selectTab(endpoint){
  currentEndpoint = endpoint;
  Array.prototype.forEach.call(tabsEl.querySelectorAll('.tab'), function(t){
    t.classList.toggle('active', t.dataset.endpoint === endpoint);
  });
  var ctrl = CONTROLS[endpoint] || '';
  controlsEl.innerHTML = ctrl;
  controlsEl.classList.toggle('show', ctrl.length > 0);

  /* Wire controls */
  var btn = document.getElementById('btn-run');
  var qEl = document.getElementById('q');
  var pEl = document.getElementById('proj');
  var nameEl = document.getElementById('name');
  var kindEl = document.getElementById('kind');
  var roleEl = document.getElementById('role');
  var expEl  = document.getElementById('exportedOnly');
  var includeCommandsEl = document.getElementById('includeCommands');
  var groupEl = document.getElementById('group');
  var statusEl = document.getElementById('status');
  var sortByEl = document.getElementById('sortBy');

  if (endpoint === 'get_catalog' && pEl) {
    loadProjectOptions(pEl);
  }
  if (endpoint === 'get_catalog' && sortByEl) {
    sortByEl.value = catalogSortBy;
  }

  function runFromControls(){
    if (endpoint === 'list_projects') {
      var st0 = (statusEl && statusEl.value || '').trim();
      runEndpoint(st0 ? { status: st0 } : null);
    } else if (endpoint === 'find_project') {
      var q = (qEl && qEl.value || '').trim();
      if (!q) { toast('Enter a query first'); qEl && qEl.focus(); return; }
      var st1 = (statusEl && statusEl.value || '').trim();
      var fpParams = { query: q };
      if (st1) { fpParams.status = st1; }
      runEndpoint(fpParams);
    } else if (endpoint === 'search_docs') {
      var q2 = (qEl && qEl.value || '').trim();
      if (!q2) { toast('Enter a query first'); qEl && qEl.focus(); return; }
      var p2 = (pEl && pEl.value || '').trim();
      var params = { query: q2 };
      if (p2) { params.projectName = p2; }
      runEndpoint(params);
    } else if (endpoint === 'get_catalog') {
      var p3 = (pEl && pEl.value || '').trim();
      catalogSortBy = (sortByEl && sortByEl.value) ? sortByEl.value : 'recent';
      runEndpoint(p3 ? { projectName: p3 } : null);
    } else if (endpoint === 'list_symbols') {
      var params2 = {};
      var qSym = (qEl && qEl.value || '').trim();
      if (qSym) { params2.query = qSym; }
      if (kindEl && kindEl.value) { params2.kind = kindEl.value; }
      if (roleEl && roleEl.value) { params2.role = roleEl.value; }
      var pSym = (pEl && pEl.value || '').trim();
      if (pSym) { params2.projectName = pSym; }
      if (expEl && expEl.checked) { params2.exportedOnly = 'true'; }
      runEndpoint(params2);
    } else if (endpoint === 'find_symbol') {
      var nm = (nameEl && nameEl.value || '').trim();
      if (!nm) { toast('Enter a symbol name'); nameEl && nameEl.focus(); return; }
      runEndpoint({ name: nm });
    } else if (endpoint === 'list_cvt_commands') {
      var gr = (groupEl && groupEl.value || '').trim();
      runEndpoint(gr ? { group: gr } : null);
    } else if (endpoint === 'lookup_dewey') {
      var q3 = (qEl && qEl.value || '').trim();
      if (!q3) { toast('Enter a Dewey query first'); qEl && qEl.focus(); return; }
      var p4 = (pEl && pEl.value || '').trim();
      var params3 = { query: q3 };
      if (p4) { params3.projectName = p4; }
      if (includeCommandsEl && !includeCommandsEl.checked) { params3.includeCommands = 'false'; }
      runEndpoint(params3);
    }
  }

  if (btn) { btn.addEventListener('click', runFromControls); }
  [qEl, pEl, nameEl, groupEl].forEach(function(el){
    if (!el) { return; }
    el.addEventListener('keydown', function(e){ if (e.key === 'Enter') { runFromControls(); } });
  });
  /* Status dropdown re-runs on change — no need to click Run. */
  if (statusEl) { statusEl.addEventListener('change', runFromControls); }
  if (sortByEl) { sortByEl.addEventListener('change', runFromControls); }

  if (endpoint === 'list_projects') {
    runEndpoint(null);
  } else if (endpoint === 'get_catalog') {
    /* No query required for get_catalog — run empty. */
    runEndpoint(null);
  } else if (endpoint === 'list_symbols') {
    /* Full index — run empty to show everything. */
    runEndpoint(null);
  } else if (endpoint === 'list_cvt_commands') {
    /* All 83 commands — run empty. */
    runEndpoint(null);
  } else {
    resultEl.innerHTML = '<div class="state">Enter a query and click Run.</div>';
    metaEl.textContent = '';
    if (qEl)    { qEl.focus(); }
    if (nameEl) { nameEl.focus(); }
  }
}

/* Tab click handling. */
tabsEl.addEventListener('click', function(e){
  var t = e.target.closest('.tab');
  if (!t) { return; }
  selectTab(t.dataset.endpoint);
});

/* Initial load. */
selectTab('list_projects');
})();
</script>
</body>
</html>`;
}
