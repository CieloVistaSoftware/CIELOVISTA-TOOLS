// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * project-card-shell.ts
 *
 * Exports a single static HTML shell used by both:
 *   - NPM Scripts panel  (cvs.npm.showAndRunScripts)
 *   - Doc Catalog        (projects section)
 *
 * The shell contains:
 *   - CSS for all card elements
 *   - <template id="proj-card"> — one card structure, no data
 *   - <template id="script-btn"> — one script button, no data
 *   - JS that listens for { type:'init', cards: ProjectCardData[] }
 *     and binds data to cloned templates
 *
 * TypeScript's only job: send JSON via postMessage({ type:'init', cards:[...] })
 * The shell does ALL rendering. No HTML string concatenation in TypeScript.
 *
 * Messages received by shell:
 *   { type: 'init',   cards: ProjectCardData[] }           — initial render
 *   { type: 'status', id: string, script: string,
 *     state: 'running'|'ok'|'error'|'stopped', code?: number } — update one button
 *
 * Messages sent to extension:
 *   { command: 'run',          id, script, dir, folder }
 *   { command: 'stop',         id, script }
 *   { command: 'open-folder',  path }
 *   { command: 'open-claude',  path }
 *   { command: 'create-claude',path }
 *   { command: 'create-tests', path, name }
 */

export const PROJECT_CARD_SHELL_HTML = /* html */`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none';style-src 'unsafe-inline';script-src 'unsafe-inline';">
<style>
/* ── Reset ── */
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--vscode-font-family);font-size:13px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background);padding:12px 16px}

/* ── Toolbar ── */
#topbar{display:flex;align-items:center;gap:10px;margin-bottom:14px;position:sticky;top:0;background:var(--vscode-editor-background);padding:8px 0;z-index:10;border-bottom:1px solid var(--vscode-panel-border)}
#topbar h1{font-size:1em;font-weight:700;flex:1}
#search{flex:1;max-width:260px;padding:4px 8px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border,#555);border-radius:3px;font-size:12px;font-family:inherit}
#search:focus{outline:none;border-color:var(--vscode-focusBorder)}
#btn-configure{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:none;padding:4px 10px;border-radius:3px;cursor:pointer;font-size:12px}
#btn-configure:hover{background:var(--vscode-button-secondaryHoverBackground)}
#count{font-size:11px;color:var(--vscode-descriptionForeground);white-space:nowrap}

/* ── Grid ── */
#grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:10px}
#empty{text-align:center;padding:40px;color:var(--vscode-descriptionForeground);display:none}

/* ── Card ── */
.pc{background:var(--vscode-textCodeBlock-background);border:1px solid var(--vscode-panel-border);border-radius:5px;padding:10px 12px;display:flex;flex-direction:column;gap:5px}
.pc:hover{border-color:var(--vscode-focusBorder)}
.pc.hidden{display:none}
.pc.running{border-color:var(--vscode-focusBorder)}

/* ── Card header ── */
.pc-head{display:flex;align-items:center;gap:6px}
.pc-name{font-weight:800;font-size:1em;flex:1;cursor:default}
.pc-dewey{font-family:var(--vscode-editor-font-family,monospace);font-size:9px;font-weight:700;background:var(--vscode-focusBorder,#0078d4);color:#fff;border-radius:3px;padding:1px 6px;letter-spacing:.04em;flex-shrink:0}
.pc-type{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--vscode-descriptionForeground);flex-shrink:0}
.pc-status-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;display:none}
.pc-status-dot.up{display:inline-block;background:#3fb950;box-shadow:0 0 5px #3fb950;animation:pulse-dot 1.5s ease-in-out infinite}
.pc-status-dot.down{display:inline-block;background:#f85149;box-shadow:0 0 4px #f85149}
@keyframes pulse-dot{0%,100%{box-shadow:0 0 3px #3fb950}50%{box-shadow:0 0 8px #3fb950}}

/* ── Card body ── */
.pc-desc{font-size:11px;line-height:1.5;opacity:.85}
.pc-path{font-family:var(--vscode-editor-font-family,monospace);font-size:9px;color:var(--vscode-descriptionForeground);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* ── Script buttons row ── */
.pc-actions{display:flex;flex-direction:column;gap:7px;margin-top:4px}
.pc-primary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px}
.pc-secondary{display:flex;flex-wrap:wrap;gap:4px}
.pc-more{border:1px solid var(--vscode-panel-border);border-radius:4px;background:var(--vscode-editor-background)}
.pc-more[open]{border-color:var(--vscode-focusBorder)}
.pc-more summary{list-style:none;cursor:pointer;padding:5px 8px;font-size:11px;font-weight:700;color:var(--vscode-descriptionForeground);display:flex;align-items:center;justify-content:space-between}
.pc-more summary::-webkit-details-marker{display:none}
.pc-more summary::after{content:'▾';opacity:.75}
.pc-more[open] summary::after{content:'▴'}
.pc-more-body{padding:0 8px 8px;display:flex;flex-direction:column;gap:6px}
.pc-more-group{display:flex;flex-direction:column;gap:4px}
.pc-more-head{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--vscode-descriptionForeground)}
.pc-more-row{display:flex;flex-wrap:wrap;gap:4px}
.pc-footer{display:flex;flex-wrap:wrap;gap:4px;margin-top:2px;padding-top:6px;border-top:1px solid var(--vscode-panel-border)}

/* ── Buttons ── */
.btn{border:none;border-radius:3px;padding:4px 10px;cursor:pointer;font-size:11px;font-weight:600;font-family:inherit;position:relative}
.btn-primary{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}
.btn-primary:hover{background:var(--vscode-button-hoverBackground)}
.btn-secondary{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}
.btn-secondary:hover{background:var(--vscode-button-secondaryHoverBackground)}
.btn-hero{padding:6px 10px;font-size:12px;justify-content:center}
.btn-chip{padding:3px 8px;font-size:10px}
.btn-mini{padding:3px 7px;font-size:10px}
.btn-warn{border:1px dashed #cca700!important;color:#cca700!important;background:rgba(204,167,0,.1)!important}
.btn-warn:hover{background:rgba(204,167,0,.2)!important}
.btn-ghost{background:none;border:1px dashed var(--vscode-focusBorder);color:var(--vscode-focusBorder);opacity:.8}
.btn-ghost:hover{opacity:1}

/* ── Status light on script button ── */
.btn-script{display:inline-flex;align-items:center;gap:5px}
.sc-light{width:7px;height:7px;border-radius:50%;flex-shrink:0;opacity:0;transition:opacity .2s}
.sc-light.green{opacity:1;background:#3fb950;box-shadow:0 0 5px #3fb950;animation:pulse-g 1.2s ease-in-out infinite}
.sc-light.red{opacity:1;background:#f85149;box-shadow:0 0 5px #f85149}
@keyframes pulse-g{0%,100%{box-shadow:0 0 3px #3fb950}50%{box-shadow:0 0 8px #3fb950}}

/* ── Tooltip ── */
.tt-wrap{position:relative;display:inline-block}
.tt-box{display:none;position:absolute;top:calc(100% + 4px);left:0;min-width:270px;max-width:340px;background:var(--vscode-editorHoverWidget-background,#252526);border:1px solid var(--vscode-focusBorder,#0078d4);border-radius:5px;padding:10px 12px;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,.5);font-size:11px;pointer-events:none}
.tt-box.show{display:block}
.tt-name{font-weight:700;font-size:12px;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between}
.tt-dewey{font-family:var(--vscode-editor-font-family,monospace);font-size:9px;background:var(--vscode-focusBorder,#0078d4);color:#fff;border-radius:3px;padding:1px 4px}
.tt-row{display:grid;grid-template-columns:38px 1fr;gap:5px;margin-bottom:4px;line-height:1.4}
.tt-row:last-child{margin-bottom:0}
.tt-lbl{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#4ec9b0}
.tt-doc{font-size:9px;margin-top:4px;padding-top:4px;border-top:1px solid rgba(255,255,255,.1);color:var(--vscode-descriptionForeground)}
</style>
</head>
<body>

<div id="topbar">
  <h1 id="panel-title">package.json Scripts</h1>
  <input id="search" type="text" placeholder="Filter projects and scripts…" autocomplete="off">
  <button id="btn-configure">⚙️ Configure</button>
  <span id="count"></span>
</div>

<div id="grid"></div>
<div id="empty">No projects match your filter.</div>

<!-- Configure overlay -->
<div id="cfg-overlay" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);z-index:1000;align-items:center;justify-content:center">
  <div id="cfg-dialog" style="background:var(--vscode-editor-background);border:1px solid var(--vscode-focusBorder);border-radius:6px;min-width:360px;max-width:500px;width:90vw;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 4px 24px rgba(0,0,0,.6)">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--vscode-panel-border);flex-shrink:0">
      <span style="font-weight:700">Configure Projects</span>
      <button id="cfg-close" style="background:none;border:none;color:var(--vscode-editor-foreground);cursor:pointer;font-size:1.2em;padding:0 4px">&#10005;</button>
    </div>
    <div id="cfg-body" style="overflow-y:auto;padding:14px 16px;flex:1;display:flex;flex-direction:column;gap:12px">
      <div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--vscode-descriptionForeground);margin-bottom:8px">Registered Projects</div>
        <div id="cfg-project-list"></div>
      </div>
      <div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--vscode-descriptionForeground);margin-bottom:6px">Add from Folder</div>
        <div style="font-size:11px;color:var(--vscode-descriptionForeground);margin-bottom:8px">Browse to a parent folder and scan for projects to add.</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <input id="cfg-scan-path" type="text" placeholder="C:\\source\\repos" autocomplete="off"
            style="flex:1;min-width:180px;padding:5px 8px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);border-radius:3px;font-size:12px;font-family:monospace">
          <button data-cfg-action="browse-for-scan" style="background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:none;padding:5px 10px;border-radius:3px;cursor:pointer;font-size:12px">&#128194; Browse</button>
          <button data-cfg-action="do-scan" style="background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;padding:5px 10px;border-radius:3px;cursor:pointer;font-size:12px">&#128269; Scan</button>
        </div>
        <div id="cfg-scan-results" style="margin-top:8px"></div>
      </div>
    </div>
  </div>
</div>

<!-- Card template — cloned once per project, never modified by TypeScript -->
<template id="proj-card">
  <article class="pc" data-name="" data-type="" data-path="">
    <div class="pc-head">
      <span class="pc-type-icon"></span>
      <span class="pc-name"></span>
      <span class="pc-status-dot" title=""></span>
      <span class="pc-type"></span>
      <span class="pc-dewey"></span>
    </div>
    <div class="pc-desc"></div>
    <div class="pc-path"></div>
    <div class="pc-actions">
      <div class="pc-primary"></div>
      <div class="pc-secondary"></div>
      <details class="pc-more" style="display:none">
        <summary>More commands <span class="pc-more-count"></span></summary>
        <div class="pc-more-body"></div>
      </details>
    </div>
    <div class="pc-footer"></div>
  </article>
</template>

<!-- Script button template — cloned once per script -->
<template id="script-btn">
  <div class="tt-wrap">
    <button class="btn btn-script btn-secondary">
      <span class="btn-label"></span>
      <span class="sc-light"></span>
    </button>
    <div class="tt-box">
      <div class="tt-name">
        <span class="tt-script-name"></span>
        <span class="tt-dewey"></span>
      </div>
      <div class="tt-row"><span class="tt-lbl">What</span><span class="tt-what"></span></div>
      <div class="tt-row"><span class="tt-lbl">When</span><span class="tt-when"></span></div>
      <div class="tt-row"><span class="tt-lbl">Where</span><span class="tt-where"></span></div>
      <div class="tt-row"><span class="tt-lbl">How</span><span class="tt-how"></span></div>
      <div class="tt-row"><span class="tt-lbl">Why</span><span class="tt-why"></span></div>
      <div class="tt-row"><span class="tt-lbl">Output</span><span class="tt-output"></span></div>
      <div class="tt-doc"></div>
    </div>
  </div>
</template>

<script>(function(){
'use strict';
var vsc = acquireVsCodeApi();
var grid = document.getElementById('grid');
var empty = document.getElementById('empty');
var countEl = document.getElementById('count');
var search = document.getElementById('search');
var cardTmpl = document.getElementById('proj-card');
var btnTmpl  = document.getElementById('script-btn');
var _hasData = false;

// ── Message listener MUST be first — before sending 'ready' ──────────────────
// VS Code delivers the extension's 'init' reply synchronously in Electron.
// If the listener is attached after 'ready' fires, the reply is missed → blank panel.
window.addEventListener('message', function(ev) {
  var m = ev.data;
  if (m.type === 'init') {
    _hasData = true;
    render(m.cards || [], m.title || '');
    return;
  }
  if (m.type === 'status') {
    var cards2 = document.querySelectorAll('.pc');
    cards2.forEach(function(card) {
      if (card.dataset.cardId && m.id && card.dataset.cardId !== m.id) return;
      var btns = card.querySelectorAll('button[data-script]');
      btns.forEach(function(btn) {
        if (btn.dataset.script !== m.script) return;
        var light = btn.querySelector('.sc-light');
        if (!light) return;
        if (m.state === 'running') {
          light.className = 'sc-light green';
          card.classList.add('running');
        } else if (m.state === 'ok') {
          light.className = 'sc-light'; card.classList.remove('running');
        } else if (m.state === 'error') {
          light.className = 'sc-light red'; card.classList.remove('running');
        } else {
          light.className = 'sc-light'; card.classList.remove('running');
        }
      });
    });
    return;
  }
  if (m.type === 'mcp-dot') {
    document.querySelectorAll('.pc').forEach(function(card) {
      if (card.dataset.name !== m.name) return;
      var dot = card.querySelector('.pc-status-dot');
      if (!dot) return;
      dot.className = 'pc-status-dot ' + m.status;
      dot.title = m.status === 'up' ? 'MCP server running' : 'MCP server stopped';
    });
    return;
  }
  if (m.type === 'cfg-registry') {
    var el = document.getElementById('cfg-project-list');
    if (!m.projects || !m.projects.length) {
      el.innerHTML = '<div style="font-size:12px;color:var(--vscode-descriptionForeground)">No projects registered yet.</div>';
    } else {
      el.innerHTML = m.projects.map(function(p) {
        return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--vscode-panel-border)">'
          +'<div style="flex:1;min-width:0"><div style="font-weight:700;font-size:12px">'+cfgEsc(p.name)+'</div>'
          +'<div style="font-family:monospace;font-size:10px;color:var(--vscode-descriptionForeground);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+cfgEsc(p.path)+'</div></div>'
          +'<span style="font-size:10px;font-weight:700;color:'+(p.exists?'#3fb950':'#f85149')+'">'+(p.exists?'\u2713':'\u274c')+'</span>'
          +'<button data-cfg-action="remove-project" data-path="'+cfgEsc(p.path)+'" style="background:rgba(200,50,50,.1);color:#f85149;border:1px solid rgba(200,50,50,.3);padding:2px 8px;border-radius:3px;cursor:pointer;font-size:11px">Remove</button>'
          +'</div>';
      }).join('');
    }
    return;
  }
  if (m.type === 'cfg-scan-results') {
    var re = document.getElementById('cfg-scan-results');
    if (m.error) { re.textContent = '\u26a0\ufe0f ' + m.error; return; }
    if (!m.results || !m.results.length) { re.textContent = 'No subfolders found.'; return; }
    re.innerHTML = m.results.map(function(r) {
      if (r.alreadyAdded) return '<div style="padding:4px 0;font-size:12px">'+cfgEsc(r.name)+' <span style="color:#3fb950;font-size:10px">\u2713 In registry</span></div>';
      return '<div style="display:flex;align-items:center;gap:8px;padding:4px 0">'
        +'<span style="font-weight:700;font-size:12px;flex:1">'+cfgEsc(r.name)+'</span>'
        +'<span style="font-size:10px;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);border-radius:8px;padding:1px 6px">'+cfgEsc(r.typeHint)+'</span>'
        +'<button data-cfg-action="add-project" data-name="'+cfgEsc(r.name)+'" data-path="'+cfgEsc(r.path)+'" data-type="'+cfgEsc(r.typeHint)+'" style="background:rgba(63,185,80,.12);color:#3fb950;border:1px solid rgba(63,185,80,.35);padding:2px 8px;border-radius:3px;cursor:pointer;font-size:11px">\uff0b Add</button>'
        +'</div>';
    }).join('');
    return;
  }
  if (m.type === 'cfg-remove-result') {
    var re2 = document.getElementById('cfg-scan-results');
    if (!re2) return;
    re2.textContent = m.removed
      ? 'Removed from registry.'
      : 'Could not remove: project path was not found in the registry.';
    return;
  }
  if (m.command === 'set-scan-path' && m.value) {
    var inp = document.getElementById('cfg-scan-path');
    if (inp) inp.value = m.value;
  }
});

// Show loading state immediately so the panel is never blank
countEl.textContent = 'Loading\u2026';

// Send ready — listener is already attached above so the init reply won't be missed
vsc.postMessage({ command: 'ready' });

// Retry after 1s in case the first ready was missed (e.g. panel revealed from hidden state)
setTimeout(function() {
  if (!_hasData) { vsc.postMessage({ command: 'ready' }); }
}, 1000);

// ── Tooltip timer ──
var _ttTimer = null;
document.addEventListener('mouseover', function(e) {
  var wrap = e.target.closest('.tt-wrap');
  if (!wrap) return;
  var box = wrap.querySelector('.tt-box');
  if (!box) return;
  _ttTimer = setTimeout(function(){ box.classList.add('show'); }, 700);
});
document.addEventListener('mouseout', function(e) {
  var wrap = e.target.closest('.tt-wrap');
  if (!wrap) return;
  if (_ttTimer) { clearTimeout(_ttTimer); _ttTimer = null; }
  var box = wrap.querySelector('.tt-box');
  if (box) box.classList.remove('show');
});

// ── Search ──
search.addEventListener('input', function() {
  var q = search.value.toLowerCase().trim();
  var vis = 0;
  document.querySelectorAll('.pc').forEach(function(c) {
    var match = !q
      || c.dataset.name.toLowerCase().includes(q)
      || c.dataset.type.toLowerCase().includes(q)
      || c.dataset.path.toLowerCase().includes(q);
    c.classList.toggle('hidden', !match);
    if (match) vis++;
  });
  var total = document.querySelectorAll('.pc').length;
  countEl.textContent = q ? (vis + ' of ' + total) : (total + ' projects');
  empty.style.display = vis === 0 ? 'block' : 'none';
});

// ── Click handler ──
document.addEventListener('click', function(e) {
  var btn = e.target.closest('button[data-action]');
  if (!btn) return;
  var action = btn.dataset.action;
  var card = btn.closest('.pc');

  if (action === 'run') {
    vsc.postMessage({ command:'run', id:card.dataset.cardId, script:btn.dataset.script,
                      dir:card.dataset.path, folder:card.dataset.name });
    var light = btn.querySelector('.sc-light');
    if (light) light.className = 'sc-light green';
    var stopBtn = card.querySelector('button[data-action="stop"][data-script="'+btn.dataset.script+'"]');
    if (stopBtn) stopBtn.style.display = '';
    card.classList.add('running');
  }
  else if (action === 'stop') {
    vsc.postMessage({ command:'stop', id:card.dataset.cardId, script:btn.dataset.script });
  }
  else if (action === 'open-folder') {
    vsc.postMessage({ command:'open-folder', path:btn.dataset.path });
  }
  else if (action === 'open-claude') {
    vsc.postMessage({ command:'open-claude', path:btn.dataset.path });
  }
  else if (action === 'create-claude') {
    vsc.postMessage({ command:'create-claude', path:btn.dataset.path });
  }
  else if (action === 'create-tests') {
    vsc.postMessage({ command:'create-tests', path:btn.dataset.path, name:btn.dataset.name });
  }
});

// ── Render ──
function render(cards, title) {
  if (title) { document.getElementById('panel-title').textContent = title; }
  grid.innerHTML = '';
  cards.forEach(function(c) { grid.appendChild(buildCard(c)); });
  var n = cards.length;
  countEl.textContent = n + ' project' + (n === 1 ? '' : 's');
  empty.style.display = n === 0 ? 'block' : 'none';
  search.focus();
}

function buildCard(c) {
  var node = cardTmpl.content.cloneNode(true);
  var art  = node.querySelector('.pc');
  var id   = c.dewey + '::' + c.name;
  art.dataset.cardId = id;
  art.dataset.name   = c.name;
  art.dataset.type   = c.type;
  art.dataset.path   = c.rootPath;

  node.querySelector('.pc-type-icon').textContent = c.typeIcon + ' ';
  node.querySelector('.pc-name').textContent      = c.name;
  var dotEl = node.querySelector('.pc-status-dot');
  if (c.mcpStatusDot) {
    dotEl.className = 'pc-status-dot ' + c.mcpStatusDot;
    dotEl.title = c.mcpStatusDot === 'up' ? 'MCP server running' : 'MCP server stopped';
  }
  node.querySelector('.pc-type').textContent      = c.type.toUpperCase();
  node.querySelector('.pc-dewey').textContent      = c.dewey;
  node.querySelector('.pc-desc').textContent       = c.description;
  node.querySelector('.pc-path').textContent       = c.rootPath;
  node.querySelector('.pc-path').title             = c.rootPath;

  var primaryEl = node.querySelector('.pc-primary');
  var secondaryEl = node.querySelector('.pc-secondary');
  var moreEl = node.querySelector('.pc-more');
  var moreBody = node.querySelector('.pc-more-body');
  var moreCount = node.querySelector('.pc-more-count');

  var layout = classifyScripts(c.scripts || []);
  layout.primary.forEach(function(s) { primaryEl.appendChild(buildScriptBtn(s, 'hero')); });
  layout.secondary.forEach(function(s) { secondaryEl.appendChild(buildScriptBtn(s, 'chip')); });

  if (layout.moreCount > 0) {
    moreEl.style.display = '';
    moreCount.textContent = '(' + layout.moreCount + ')';
    Object.keys(layout.moreGroups).forEach(function(groupName) {
      var arr = layout.moreGroups[groupName];
      if (!arr || arr.length === 0) return;
      var group = document.createElement('div');
      group.className = 'pc-more-group';
      var head = document.createElement('div');
      head.className = 'pc-more-head';
      head.textContent = groupName;
      var row = document.createElement('div');
      row.className = 'pc-more-row';
      arr.forEach(function(s) { row.appendChild(buildScriptBtn(s, 'mini')); });
      group.appendChild(head);
      group.appendChild(row);
      moreBody.appendChild(group);
    });
  }

  if (c.needsTests) {
    var tb = makeBtn('warn', '\uD83E\uDDEA Create Tests');
    tb.dataset.action = 'create-tests';
    tb.dataset.path   = c.rootPath;
    tb.dataset.name   = c.name;
    tb.title = 'No real tests found — click to generate';
    secondaryEl.appendChild(tb);
  }

  var footer = node.querySelector('.pc-footer');

  var folderBtn = makeBtn('secondary', '\uD83D\uDCC2 Open Folder');
  folderBtn.dataset.action = 'open-folder';
  folderBtn.dataset.path   = c.rootPath;
  folderBtn.title = 'Open this project folder in VS Code Explorer';
  footer.appendChild(folderBtn);

  if (c.claudeMdPath) {
    var cBtn = makeBtn('secondary', '\uD83D\uDCC1 CLAUDE.md');
    cBtn.dataset.action = 'open-claude';
    cBtn.dataset.path   = c.claudeMdPath;
    cBtn.title = 'Open CLAUDE.md for this project';
    footer.appendChild(cBtn);
  } else {
    var cBtn2 = makeBtn('ghost', '\u2795 Create CLAUDE.md');
    cBtn2.dataset.action = 'create-claude';
    cBtn2.dataset.path   = c.rootPath;
    cBtn2.title = 'Create CLAUDE.md from template in this project root';
    footer.appendChild(cBtn2);
  }

  return node;
}

function classifyScripts(scripts) {
  var primaryOrder = ['rebuild', 'start', 'dev', 'build', 'compile', 'test'];

  var byName = {};
  scripts.forEach(function(s) { byName[s.name] = s; });

  var picked = new Set();
  var primary = [];
  primaryOrder.forEach(function(name) {
    if (byName[name] && !picked.has(name) && primary.length < 4) {
      primary.push(byName[name]);
      picked.add(name);
    }
  });

  if (primary.length < 2) {
    scripts.forEach(function(s) {
      if (picked.has(s.name)) return;
      if (s.primary || /^test$|^build$|^start$|^dev$|^rebuild$/.test(s.name)) {
        primary.push(s);
        picked.add(s.name);
      }
      if (primary.length >= 4) return;
    });
  }

  // All remaining scripts go to secondary — no "More commands" section
  var secondary = [];
  scripts.forEach(function(s) {
    if (picked.has(s.name)) return;
    secondary.push(s);
    picked.add(s.name);
  });

  return { primary: primary, secondary: secondary, moreGroups: {}, moreCount: 0 };
}

function buildScriptBtn(s, size) {
  var node = btnTmpl.content.cloneNode(true);
  var wrap = node.querySelector('.tt-wrap');
  var btn  = node.querySelector('button');
  var tt   = node.querySelector('.tt-box');

  btn.classList.add(s.primary ? 'btn-primary' : 'btn-secondary');
  if (size === 'hero') btn.classList.add('btn-hero');
  if (size === 'chip') btn.classList.add('btn-chip');
  if (size === 'mini') btn.classList.add('btn-mini');
  btn.querySelector('.btn-label').textContent = s.name;
  btn.dataset.action  = 'run';
  btn.dataset.script  = s.name;
  btn.title = 'Hover to view details';

  // Stop button (hidden by default)
  var stopBtn = makeBtn('secondary', '\u25a0');
  stopBtn.style.display = 'none';
  stopBtn.dataset.action = 'stop';
  stopBtn.dataset.script = s.name;
  stopBtn.title = 'Stop the running script process';
  stopBtn.style.padding  = '4px 7px';
  wrap.appendChild(stopBtn);

  // Tooltip content
  tt.querySelector('.tt-script-name').textContent = 'npm run ' + s.name;
  tt.querySelector('.tt-dewey').textContent        = s.dewey;
  tt.querySelector('.tt-what').textContent         = s.doc.what;
  tt.querySelector('.tt-when').textContent         = s.doc.when;
  tt.querySelector('.tt-where').textContent        = s.doc.where;
  tt.querySelector('.tt-how').textContent          = s.doc.how;
  tt.querySelector('.tt-why').textContent          = s.doc.why;
  tt.querySelector('.tt-output').textContent       = s.doc.expectedOutput;
  tt.querySelector('.tt-doc').textContent          = s.doc.sourceLabel;

  return node;
}

function makeBtn(variant, label) {
  var b = document.createElement('button');
  b.className = 'btn btn-' + variant;
  b.textContent = label;
  return b;
}

function cfgEsc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ── Configure overlay ──
document.getElementById('btn-configure').addEventListener('click', function() {
  vsc.postMessage({ command: 'get-registry' });
  document.getElementById('cfg-overlay').style.display = 'flex';
});
document.getElementById('cfg-close').addEventListener('click', function() {
  document.getElementById('cfg-overlay').style.display = 'none';
});
document.getElementById('cfg-overlay').addEventListener('click', function(e) {
  if (e.target === document.getElementById('cfg-overlay')) document.getElementById('cfg-overlay').style.display = 'none';
});
document.addEventListener('click', function(e) {
  var cb = e.target.closest('[data-cfg-action]');
  if (!cb) return;
  var act = cb.dataset.cfgAction;
  if (act === 'browse-for-scan') {
    vsc.postMessage({ command: 'browse-for-scan', current: (document.getElementById('cfg-scan-path')||{}).value || '' });
  } else if (act === 'do-scan') {
    var sp = ((document.getElementById('cfg-scan-path')||{}).value || '').trim();
    if (!sp) return;
    document.getElementById('cfg-scan-results').textContent = 'Scanning…';
    vsc.postMessage({ command: 'cfg-scan-folder', path: sp });
  } else if (act === 'remove-project') {
    if (confirm('Remove "'+cb.dataset.path+'" from the registry?')) vsc.postMessage({ command: 'cfg-remove-project', path: cb.dataset.path });
  } else if (act === 'add-project') {
    vsc.postMessage({ command: 'cfg-add-project', name: cb.dataset.name, path: cb.dataset.path, type: cb.dataset.type || 'app' });
  }
});


})();</script>
</body></html>`;
