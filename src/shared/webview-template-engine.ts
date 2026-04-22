// Copyright (c) 2025 CieloVista Software. All rights reserved.
/**
 * webview-template-engine.ts
 *
 * A binding engine for VS Code webviews.
 *
 * Architecture principle:
 *   TypeScript  = data only (never generates HTML or JS)
 *   HTML shell  = static structure + named <template> blocks
 *   JS engine   = binds data to templates via DOM APIs
 *
 * Usage (TypeScript side):
 *   const shell = buildShell({
 *     templates: { 'script-card': SCRIPT_CARD_TMPL, 'output-job': OUTPUT_JOB_TMPL },
 *     styles:    [STYLES],
 *   });
 *   panel.webview.html = shell;
 *   panel.webview.postMessage({ type: 'init', template: 'script-card', items: entries });
 *   panel.webview.postMessage({ type: 'update', id: 'card-123', patch: { state: 'running' } });
 *
 * Usage (webview JS side — injected as part of the shell):
 *   The engine listens for postMessage events:
 *     { type: 'init',   template, items, target? }  — clone template N times, bind data, append to target
 *     { type: 'update', id, patch }                 — update specific fields on an existing element by id
 *     { type: 'remove', id }                         — remove element by id
 *     { type: 'clear',  target? }                    — remove all children from target
 *
 *   Data binding rules (applied to cloned template):
 *     data-bind="field"        → element.textContent = item[field]
 *     data-bind-attr="field"   → reads data-attr-name, sets that attribute to item[field]
 *     data-bind-class="field"  → adds item[field] as a CSS class
 *     data-bind-show="field"   → element.style.display = item[field] ? '' : 'none'
 *     data-bind-hide="field"   → element.style.display = item[field] ? 'none' : ''
 *     data-event="click:field" → vsc.postMessage({ event: field, id: item.id, ...item })
 *
 *   Each cloned root element gets id=item.id if item.id is present.
 */

export interface TemplateShellOptions {
    /** Named HTML <template> blocks — key = template name, value = inner HTML */
    templates:  Record<string, string>;
    /** CSS strings to inject in <style> tags */
    styles?:    string[];
    /** ID of the default container element (default: 'root') */
    rootId?:    string;
    /** Additional static HTML to include inside <body> before the root */
    bodyPrefix?: string;
}

/**
 * Builds a complete static HTML shell with embedded template definitions
 * and the binding engine JS. TypeScript never generates HTML after this.
 */
export function buildShell(opts: TemplateShellOptions): string {
    const rootId   = opts.rootId ?? 'root';
    const styleTag = opts.styles?.length
        ? `<style>${opts.styles.join('\n')}</style>`
        : '';

    const templateTags = Object.entries(opts.templates)
        .map(([name, html]) => `<template id="tmpl-${name}">${html}</template>`)
        .join('\n');

    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none';style-src 'unsafe-inline';script-src 'unsafe-inline';">
${styleTag}
</head><body>
${opts.bodyPrefix ?? ''}
<div id="${rootId}"></div>
${templateTags}
<script>
/* ── CieloVista Template Engine v1.0 ── */
(function(){
'use strict';
var vsc = acquireVsCodeApi();

// ── Bind one item to a cloned template node ──────────────────────────────────
function bindNode(node, item) {
  // data-bind="field" → textContent
  node.querySelectorAll('[data-bind]').forEach(function(el) {
    var field = el.getAttribute('data-bind');
    if (field in item) el.textContent = item[field] ?? '';
  });
  // data-bind-html="field" → innerHTML (use sparingly, data must be safe)
  node.querySelectorAll('[data-bind-html]').forEach(function(el) {
    var field = el.getAttribute('data-bind-html');
    if (field in item) el.innerHTML = item[field] ?? '';
  });
  // data-bind-attr="field" + data-attr-name="attrName" → setAttribute
  node.querySelectorAll('[data-bind-attr]').forEach(function(el) {
    var field    = el.getAttribute('data-bind-attr');
    var attrName = el.getAttribute('data-attr-name');
    if (attrName && field in item) el.setAttribute(attrName, item[field] ?? '');
  });
  // data-bind-class="field" → add item[field] as CSS class
  node.querySelectorAll('[data-bind-class]').forEach(function(el) {
    var field = el.getAttribute('data-bind-class');
    if (field in item && item[field]) el.classList.add(item[field]);
  });
  // data-bind-show="field" → show if truthy
  node.querySelectorAll('[data-bind-show]').forEach(function(el) {
    var field = el.getAttribute('data-bind-show');
    el.style.display = (field in item && item[field]) ? '' : 'none';
  });
  // data-bind-hide="field" → hide if truthy
  node.querySelectorAll('[data-bind-hide]').forEach(function(el) {
    var field = el.getAttribute('data-bind-hide');
    el.style.display = (field in item && item[field]) ? 'none' : '';
  });
  // data-event="eventType:messageName" → wire click/etc to postMessage
  node.querySelectorAll('[data-event]').forEach(function(el) {
    el.getAttribute('data-event').split(' ').forEach(function(spec) {
      var parts = spec.split(':');
      var evType = parts[0], msgName = parts[1];
      if (!evType || !msgName) return;
      el.addEventListener(evType, function(e) {
        e.stopPropagation();
        vsc.postMessage(Object.assign({ event: msgName, id: item.id }, item));
      });
    });
  });
  // Set id on root element if item.id present
  if (item.id) {
    var root = node.firstElementChild;
    if (root) root.setAttribute('data-item-id', item.id);
  }
}

// ── Patch an existing element ────────────────────────────────────────────────
function patchElement(el, patch) {
  Object.entries(patch).forEach(function([key, val]) {
    var targets = el.querySelectorAll('[data-bind="'+key+'"]');
    if (targets.length === 0 && el.getAttribute && el.getAttribute('data-bind') === key) targets = [el];
    targets.forEach(function(t) { t.textContent = val ?? ''; });
    // class patches: data-patch-class="fieldName" toggles a class
    el.querySelectorAll('[data-patch-class="'+key+'"]').forEach(function(t) {
      t.className = t.getAttribute('data-class-base') + (val ? ' ' + val : '');
    });
    // show/hide patches
    el.querySelectorAll('[data-bind-show="'+key+'"]').forEach(function(t) {
      t.style.display = val ? '' : 'none';
    });
    el.querySelectorAll('[data-bind-hide="'+key+'"]').forEach(function(t) {
      t.style.display = val ? 'none' : '';
    });
    // attr patches
    el.querySelectorAll('[data-bind-attr="'+key+'"]').forEach(function(t) {
      var a = t.getAttribute('data-attr-name');
      if (a) t.setAttribute(a, val ?? '');
    });
  });
}

// ── Message dispatcher ───────────────────────────────────────────────────────
window.addEventListener('message', function(ev) {
  var m = ev.data;
  if (!m || !m.type) return;

  if (m.type === 'init') {
    var tmpl = document.getElementById('tmpl-' + m.template);
    var container = document.getElementById(m.target || '${rootId}');
    if (!tmpl || !container) {
      console.warn('CVS-ENGINE: missing template or container', m.template, m.target);
      return;
    }
    if (m.clear !== false) container.innerHTML = '';
    (m.items || []).forEach(function(item) {
      var clone = tmpl.content.cloneNode(true);
      bindNode(clone, item);
      container.appendChild(clone);
    });
    // fire ready event
    window.dispatchEvent(new CustomEvent('cvs-init', { detail: m }));
  }

  else if (m.type === 'append') {
    var tmpl = document.getElementById('tmpl-' + m.template);
    var container = document.getElementById(m.target || '${rootId}');
    if (!tmpl || !container) return;
    var clone = tmpl.content.cloneNode(true);
    bindNode(clone, m.item);
    container.appendChild(clone);
    window.dispatchEvent(new CustomEvent('cvs-append', { detail: m }));
  }

  else if (m.type === 'update') {
    var el = document.querySelector('[data-item-id="' + m.id + '"]');
    if (el) patchElement(el, m.patch);
  }

  else if (m.type === 'remove') {
    var el = document.querySelector('[data-item-id="' + m.id + '"]');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  else if (m.type === 'clear') {
    var container = document.getElementById(m.target || '${rootId}');
    if (container) container.innerHTML = '';
  }

  else if (m.type === 'show') {
    var el = document.querySelector('[data-item-id="' + m.id + '"]');
    if (el) el.style.display = m.display ?? '';
  }
});

// Forward all events from the page to the extension host
// Any element with data-event will already postMessage via bindNode.
// This catches custom events bubbled up from templates.
document.addEventListener('cvs-action', function(e) {
  vsc.postMessage(e.detail);
});

})();
</script>
</body></html>`;
}

/**
 * Helper: send an init message to a webview panel.
 */
export function sendInit(
    panel: import('vscode').WebviewPanel,
    template: string,
    items: Record<string, unknown>[],
    target?: string,
    clear = true
): void {
    panel.webview.postMessage({ type: 'init', template, items, target, clear });
}

/**
 * Helper: send an append message (add one item without clearing).
 */
export function sendAppend(
    panel: import('vscode').WebviewPanel,
    template: string,
    item: Record<string, unknown>,
    target?: string
): void {
    panel.webview.postMessage({ type: 'append', template, item, target });
}

/**
 * Helper: patch specific fields on an existing rendered item.
 */
export function sendUpdate(
    panel: import('vscode').WebviewPanel,
    id: string,
    patch: Record<string, unknown>
): void {
    panel.webview.postMessage({ type: 'update', id, patch });
}

/**
 * Helper: remove a rendered item by id.
 */
export function sendRemove(panel: import('vscode').WebviewPanel, id: string): void {
    panel.webview.postMessage({ type: 'remove', id });
}
