"use strict";
// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
Object.defineProperty(exports, "__esModule", { value: true });
exports.esc = esc;
exports.buildAuditHtml = buildAuditHtml;
function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function buildTabPreview(groupId, files) {
    const MAX = 4000;
    const tabs = files.map((f, i) => `<button class="tab-btn${i === 0 ? ' active' : ''}" data-group="${groupId}" data-tab="${i}" onclick="switchTab('${groupId}',${i})">${esc(`${f.projectName}/${f.fileName}`)}</button>`).join('');
    const panes = files.map((f, i) => {
        const preview = f.content.length > MAX ? f.content.slice(0, MAX) + `\n\n… (${f.content.length - MAX} more chars)` : f.content;
        return `<div class="tab-pane${i === 0 ? '' : ' hidden'}" data-group="${groupId}" data-pane="${i}">
          <div class="file-meta">
            <span class="path-label">${esc(f.filePath)}</span>
            <span class="size-label">${f.sizeBytes} bytes</span>
            <button class="sm-btn" onclick="openFile(${JSON.stringify(esc(f.filePath)).replace(/&quot;/g, '"')})">Open in editor ↗</button>
          </div>
          <pre class="preview">${esc(preview)}</pre>
        </div>`;
    }).join('');
    return `<div class="tab-block"><div class="tab-bar">${tabs}</div><div class="tab-panes">${panes}</div></div>`;
}
function buildAuditHtml(results) {
    const warnings = results.warningCandidates ?? [];
    const warningRows = warnings.map((c, mi) => {
        const gid = `warn-${mi}`;
        return `<div class="card warning">
          <div class="card-title">⚠️ ${esc(c.file.projectName)}/${esc(c.file.fileName)}</div>
          <div class="muted">${esc(c.reason)}</div>
          ${buildTabPreview(gid, [c.file])}
        </div>`;
    }).join('');
    const totalIssues = results.duplicates.length + results.similar.length + results.moveCandidates.length + results.orphans.length;
    const guidanceLines = [];
    if (results.duplicates.length) {
        guidanceLines.push(`<li><strong>📄 ${results.duplicates.length} duplicate(s)</strong> — same file in multiple projects. Pick the keeper, delete the rest, or Merge.</li>`);
    }
    if (results.similar.length) {
        guidanceLines.push(`<li><strong>🔀 ${results.similar.length} similar pair(s)</strong> — different filenames, overlapping content. Diff first, then decide.</li>`);
    }
    if (results.moveCandidates.length) {
        guidanceLines.push(`<li><strong>📦 ${results.moveCandidates.length} move candidate(s)</strong> — project docs that look like global standards. Move to CieloVistaStandards.</li>`);
    }
    if (results.orphans.length) {
        guidanceLines.push(`<li><strong>👻 ${results.orphans.length} orphan(s)</strong> — nobody links to these. Open each before deleting.</li>`);
    }
    const guidanceHtml = totalIssues === 0
        ? `<div class="guidance ok-box">✅ Everything looks clean across ${results.totalDocsScanned} docs.</div>`
        : `<div class="guidance"><strong>What to do:</strong><ul>${guidanceLines.join('')}</ul><p class="tip">💡 Nothing is deleted without a confirmation dialog.</p></div>`;
    const dupeRows = results.duplicates.map((g, gi) => {
        const gid = `dupe-${gi}`;
        const allPaths = JSON.stringify(g.files.map(f => f.filePath));
        const rec = g.fileName.toLowerCase() === 'claude.md' ? '⚠️ CLAUDE.md is project-specific — only merge if truly identical.'
            : g.fileName.toLowerCase().includes('current-status') ? '⚠️ CURRENT-STATUS.md is project-specific — do not merge.'
                : '✅ Pick the most complete version as keeper, delete the rest.';
        return `<div class="card"><div class="card-title">📄 ${esc(g.fileName)} — ${g.files.length} copies</div>
          <div class="recommendation">${rec}</div>${buildTabPreview(gid, g.files)}
          <div class="actions">
            <button onclick="cmd('merge',${JSON.stringify(allPaths)})">⛙ Merge all into one…</button>
            <button class="secondary" onclick="cmd('walkGroup',${JSON.stringify(allPaths)})">👣 Walk through individually</button>
          </div></div>`;
    }).join('');
    const simRows = results.similar.map((g, si) => {
        const gid = `sim-${si}`;
        const pairPaths = JSON.stringify([g.fileA.filePath, g.fileB.filePath]);
        return `<div class="card"><div class="card-title">🔀 ${Math.round(g.similarity * 100)}% similar — ${esc(g.fileA.fileName)} ↔ ${esc(g.fileB.fileName)}</div>
          <div class="muted">${esc(g.reason)}</div>
          <div class="recommendation">✅ Diff first to see what's different, then decide whether to merge.</div>
          ${buildTabPreview(gid, [g.fileA, g.fileB])}
          <div class="actions">
            <button onclick="cmd('diff',${JSON.stringify(pairPaths)})">⬛ Diff side by side</button>
            <button class="secondary" onclick="cmd('merge',${JSON.stringify(pairPaths)})">⛙ Merge…</button>
          </div></div>`;
    }).join('');
    const moveRows = results.moveCandidates.map((c, mi) => {
        const gid = `move-${mi}`;
        return `<div class="card"><div class="card-title">📦 ${esc(c.file.projectName)}/${esc(c.file.fileName)}</div>
          <div class="muted">${esc(c.reason)}</div>
          ${buildTabPreview(gid, [c.file])}
          <div class="actions">
            <button onclick="cmd('moveToGlobal',${JSON.stringify(JSON.stringify(c.file.filePath))})">📦 Move to Global Standards…</button>
          </div></div>`;
    }).join('');
    const orphanRows = results.orphans.map((o, oi) => {
        const gid = `orphan-${oi}`;
        return `<div class="card"><div class="card-title">👻 ${esc(o.file.projectName)}/${esc(o.file.fileName)}</div>
          <div class="muted">${esc(o.reason)}</div>
          ${buildTabPreview(gid, [o.file])}
          <div class="actions">
            <button class="danger" onclick="cmd('delete',${JSON.stringify(JSON.stringify(o.file.filePath))})">🗑 Delete…</button>
          </div></div>`;
    }).join('');
    const section = (title, count, body, sid) => `<div class="section" data-section="${sid}"><h2>${title} <span class="badge">${count}</span></h2>${count === 0 ? `<p class="ok">None found. ✅</p>` : body}</div>`;
    const CSS = `*{box-sizing:border-box}body{font-family:var(--vscode-font-family);font-size:13px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background);padding:16px 20px;margin:0}h1{font-size:1.3em;margin-bottom:4px}h2{font-size:1.05em;border-bottom:1px solid var(--vscode-panel-border);padding-bottom:6px;margin-top:24px}.summary{display:flex;gap:12px;margin:12px 0 16px;flex-wrap:wrap}.stat{background:var(--vscode-textCodeBlock-background);padding:8px 14px;border-radius:4px;text-align:center;min-width:78px;cursor:pointer}.stat-n{font-size:1.5em;font-weight:700;display:block}.stat-label{font-size:0.8em;color:var(--vscode-descriptionForeground)}.stat:hover{outline:2px solid var(--vscode-focusBorder)}.stat.active-filter{outline:2px solid var(--vscode-focusBorder);background:var(--vscode-button-background)}.stat.active-filter .stat-n,.stat.active-filter .stat-label{color:var(--vscode-button-foreground)}.section.filtered-out{display:none}.guidance{background:var(--vscode-textCodeBlock-background);border:1px solid var(--vscode-panel-border);border-radius:4px;padding:12px 16px;margin-bottom:20px;line-height:1.6}.guidance ul{margin:6px 0 6px 18px;padding:0}.guidance li{margin:4px 0}.tip{color:var(--vscode-descriptionForeground);font-size:0.88em;margin:8px 0 0}.ok-box{color:var(--vscode-testing-iconPassed)}.section{margin-bottom:28px}.card{border:1px solid var(--vscode-panel-border);border-radius:4px;padding:12px 14px;margin-bottom:12px}.card-title{font-weight:700;font-size:0.95em;margin-bottom:6px}.recommendation{font-size:0.85em;margin:4px 0 10px;padding:6px 10px;border-radius:3px;background:var(--vscode-editor-background);border-left:3px solid var(--vscode-focusBorder)}.muted{color:var(--vscode-descriptionForeground);font-size:0.85em;margin:2px 0 6px}.badge{background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);border-radius:10px;padding:1px 8px;font-size:0.8em}.ok{color:var(--vscode-testing-iconPassed)}.tab-block{border:1px solid var(--vscode-panel-border);border-radius:4px;overflow:hidden;margin:8px 0 10px}.tab-bar{display:flex;flex-wrap:wrap;background:var(--vscode-editor-background);border-bottom:1px solid var(--vscode-panel-border)}.tab-btn{background:transparent;color:var(--vscode-descriptionForeground);border:none;border-right:1px solid var(--vscode-panel-border);padding:5px 12px;cursor:pointer;font-size:11px;white-space:nowrap;max-width:220px;overflow:hidden;text-overflow:ellipsis}.tab-btn:hover{background:var(--vscode-list-hoverBackground);color:var(--vscode-editor-foreground)}.tab-btn.active{background:var(--vscode-textCodeBlock-background);color:var(--vscode-editor-foreground);font-weight:600;border-bottom:2px solid var(--vscode-focusBorder)}.tab-pane{display:block}.tab-pane.hidden{display:none}.file-meta{display:flex;align-items:center;gap:10px;padding:6px 10px;background:var(--vscode-editor-background);border-bottom:1px solid var(--vscode-panel-border);flex-wrap:wrap}.path-label{font-family:var(--vscode-editor-font-family);font-size:0.8em;color:var(--vscode-descriptionForeground);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.size-label{font-size:0.78em;color:var(--vscode-descriptionForeground);white-space:nowrap}.sm-btn{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:none;padding:2px 8px;border-radius:2px;cursor:pointer;font-size:11px;white-space:nowrap}.sm-btn:hover{background:var(--vscode-button-secondaryHoverBackground)}pre.preview{margin:0;padding:10px;background:var(--vscode-textCodeBlock-background);font-family:var(--vscode-editor-font-family);font-size:11px;line-height:1.45;white-space:pre-wrap;word-break:break-all;max-height:280px;overflow-y:auto}.actions{margin-top:10px;display:flex;gap:6px;flex-wrap:wrap}button{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;padding:5px 12px;border-radius:2px;cursor:pointer;font-size:12px}button:hover{background:var(--vscode-button-hoverBackground)}button.secondary{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}button.secondary:hover{background:var(--vscode-button-secondaryHoverBackground)}button.danger{background:var(--vscode-inputValidation-errorBackground);color:var(--vscode-inputValidation-errorForeground)}button.danger:hover{opacity:0.85}`;
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><style>${CSS}</style></head><body>
<h1>📋 CieloVista Docs Audit</h1>
<p class="muted">Scanned ${results.totalDocsScanned} docs across ${results.projectsScanned} projects</p>
<div class="summary">
  <div class="stat" onclick="filterSection('all')"><span class="stat-n">${results.totalDocsScanned}</span><span class="stat-label">Docs scanned</span></div>
  <div class="stat" data-filter="duplicates" onclick="filterSection('duplicates')"><span class="stat-n" style="color:${results.duplicates.length ? 'var(--vscode-inputValidation-warningForeground)' : 'inherit'}">${results.duplicates.length}</span><span class="stat-label">Duplicates</span></div>
  <div class="stat" data-filter="similar" onclick="filterSection('similar')"><span class="stat-n" style="color:${results.similar.length ? 'var(--vscode-inputValidation-warningForeground)' : 'inherit'}">${results.similar.length}</span><span class="stat-label">Similar pairs</span></div>
  <div class="stat" data-filter="move" onclick="filterSection('move')"><span class="stat-n" style="color:${results.moveCandidates.length ? 'var(--vscode-inputValidation-infoForeground)' : 'inherit'}">${results.moveCandidates.length}</span><span class="stat-label">Move candidates</span></div>
  <div class="stat" data-filter="orphans" onclick="filterSection('orphans')"><span class="stat-n" style="color:${results.orphans.length ? 'var(--vscode-inputValidation-warningForeground)' : 'inherit'}">${results.orphans.length}</span><span class="stat-label">Orphans</span></div>
</div>
${guidanceHtml}
${warnings.length ? `<div class="section" data-section="claude-warnings"><h2>⚠️ CLAUDE.md Warnings <span class="badge">${warnings.length}</span></h2>${warningRows}</div>` : ''}
${section('📄 Duplicate Filenames', results.duplicates.length, dupeRows, 'duplicates')}
${section('🔀 Similar Content', results.similar.length, simRows, 'similar')}
${section('📦 Should Move to Global Standards', results.moveCandidates.length, moveRows, 'move')}
${section('👻 Orphaned Docs', results.orphans.length, orphanRows, 'orphans')}
<script>
const vscode = acquireVsCodeApi();
function cmd(command, pathsJson){let data;try{data=JSON.parse(pathsJson);}catch{data=pathsJson;}vscode.postMessage({command,data});}
function openFile(fp){vscode.postMessage({command:'open',data:fp});}
let _f='all';
function filterSection(id){if(_f===id){id='all';}_f=id;document.querySelectorAll('.stat[data-filter]').forEach(el=>el.classList.toggle('active-filter',el.dataset.filter===id));document.querySelectorAll('.section[data-section]').forEach(el=>el.classList.toggle('filtered-out',id!=='all'&&el.dataset.section!==id));if(id!=='all'){const t=document.querySelector('.section[data-section="'+id+'"]');if(t)t.scrollIntoView({behavior:'smooth',block:'start'});}}
function switchTab(gid,idx){document.querySelectorAll('[data-group="'+gid+'"].tab-btn').forEach((b,i)=>b.classList.toggle('active',i===idx));document.querySelectorAll('[data-group="'+gid+'"][data-pane]').forEach(p=>p.classList.toggle('hidden',parseInt(p.dataset.pane||'-1')!==idx));}
</script></body></html>`;
}
//# sourceMappingURL=html.js.map