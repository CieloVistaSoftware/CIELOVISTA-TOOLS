// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

import type { DailyAuditReport, AuditStatus } from '../../shared/audit-schema';
import type { HistoryEntry } from './command-history';
import type { RecentProject } from './recent-projects';
import { CATALOG, esc } from './catalog';
import type { CmdEntry } from './types';

function statusDotHtml(status: AuditStatus | undefined, checkId: string | undefined, summary: string): string {
    if (!status || status === 'green') {
        const color = status === 'green' ? '#3fb950' : '#555';
        const title = status === 'green' ? 'All checks passed' : 'No audit data — run daily health check';
        return `<span class="card-status-dot" style="background:${color}" title="${title}"></span>`;
    }
    const color       = status === 'red' ? '#f48771' : '#cca700';
    const safeSummary = summary.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    return `<button class="card-status-dot card-status-dot--clickable" style="background:${color}" data-action="show-audit" data-check-id="${esc(checkId??'')}" data-status="${esc(status)}" data-summary="${esc(safeSummary)}" title="${status==='red'?'🔴 Issues found':'🟡 Warnings'} — click for details &amp; fixes"></button>`;
}

const SCOPE_META: Record<string, { label: string; color: string; title: string }> = {
    global:      { label: 'Global',      color: '#3fb950', title: 'Works from any workspace — reads the CieloVista registry' },
    workspace:   { label: 'Workspace',   color: '#58a6ff', title: 'Operates on whatever VS Code workspace is currently open' },
    diskcleanup: { label: 'DiskCleanUp', color: '#cca700', title: 'DiskCleanUp project only' },
    tools:       { label: 'Tools',       color: '#bc8cff', title: 'cielovista-tools project only (internal self-audit)' },
};

// SVG icons — no emoji, clean and consistent
const ICON_PLAY = `<svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor"><path d="M2 1.5l7 4-7 4V1.5z"/></svg>`;
const ICON_READ = `<svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="1" y="1.5" width="9" height="8" rx="1"/><line x1="3" y1="4" x2="8" y2="4"/><line x1="3" y1="6" x2="8" y2="6"/><line x1="3" y1="8" x2="6" y2="8"/></svg>`;
const ICON_F1   = `<span style="font-family:var(--vscode-editor-font-family,monospace);font-size:9px;font-weight:700;letter-spacing:-0.5px">F1</span>`;

function buildCard(cmd: CmdEntry, auditMap: Map<string, { status: string; summary: string }>, group: string): string {
    const tagBadges   = cmd.tags.map(t => `<span class="tag" data-tag="${esc(t)}">${esc(t)}</span>`).join('');
    const auditData   = cmd.auditCheckId ? auditMap.get(cmd.auditCheckId) : undefined;
    const status      = auditData?.status as AuditStatus | undefined;
    const liveSummary = auditData?.summary ?? cmd.description;
    const dot         = statusDotHtml(status, cmd.auditCheckId, liveSummary);
    const scopeMeta   = SCOPE_META[cmd.scope] ?? SCOPE_META['global'];
    const scopeBadge  = `<span class="scope-badge" style="border-color:${scopeMeta.color};color:${scopeMeta.color}" title="${esc(scopeMeta.title)}">${esc(scopeMeta.label)}</span>`;
    const breadcrumb  = `<div class="cmd-breadcrumb"><button class="bc-root bc-btn" data-action="bc-root" title="Go to root — show all commands">CieloVista Tools</button><span class="bc-s">\\</span><button class="bc-group bc-btn" data-action="bc-group" data-group="${esc(group)}" title="Filter to ${esc(group)} only">${esc(group)}</button><span class="bc-s">\\</span><span class="bc-leaf">${esc(cmd.title)}</span></div>`;
    // F1 data embedded for the help modal
    const f1Data = esc(JSON.stringify({
        id:    cmd.id,
        title: cmd.title,
        desc:  cmd.description,
        scope: scopeMeta.title,
        tags:  cmd.tags.join(', '),
        dewey: cmd.dewey,
        group,
    }));
    // In-depth, actionable tooltip for run button
    let runTooltip = '';
    if (cmd.helpDoc) {
      runTooltip = `In-depth info:\n(Loading detailed help...)`;
    } else if (cmd.runTooltip) {
      runTooltip = cmd.runTooltip;
    } else {
      runTooltip = [
        `What happens when you run this:`,
        `- ${cmd.description}`,
        `- Executes logic defined in: ${cmd.location || 'N/A'}`,
        '',
        `Webview output:`,
        `- Shows a full log of all actions taken, including console output, step-by-step results, and any errors or warnings.`,
        `- Success: You will see a summary of completed actions and their results.`,
        `- Failure: Errors and troubleshooting tips will be shown in the log.`,
        '',
        `Caveats & Tips:`,
        `- Make sure all prerequisites are met (e.g., file/folder exists, permissions, etc).`,
        `- If the result is not as expected, check the log for error details and next steps.`,
        '',
        `Scope: ${scopeMeta.label} — ${scopeMeta.title}`,
        `Group: ${group}${cmd.dewey ? `\nDewey: ${cmd.dewey}` : ''}`
      ].join('\n');
    }
    return `<div class="cmd-card" data-id="${esc(cmd.id)}" data-group="${esc(group)}" data-tags="${esc(cmd.tags.join(' '))}" data-scope="${esc(cmd.scope)}" tabindex="0" role="article" aria-label="${esc(cmd.title)}">
  ${dot}
  ${breadcrumb}
  <div class="cmd-header">
    <h1 class="cmd-title">${esc(cmd.title)}</h1>
    <span class="cmd-dewey" title="Dewey catalogue number: ${esc(cmd.dewey)}">${esc(cmd.dewey)}</span>
  </div>
  <p class="cmd-desc">${esc(liveSummary)}</p>
  <div class="cmd-footer">
    <div class="cmd-tags">${scopeBadge}${tagBadges}</div>
    <div class="cmd-actions">
      <button class="f1-btn" data-action="show-f1" data-f1="${f1Data}" title="F1 — What, How, Where &amp; Why for this command">${ICON_F1}</button>
      ${cmd.helpDoc ? `<button class="help-btn" data-action="help" data-doc="${esc(cmd.helpDoc)}" title="Open detailed help document for ${esc(cmd.title)}">Help</button>` : ''}
      ${cmd.id === 'cvs.audit.runDaily' ? `<button class="run-btn read-btn" data-action="toggle-audit-output" title="Show/hide the Run Daily Health Check output window">📋 Log</button>` : ''}
      <button class="run-btn ${cmd.action === 'read' ? 'read-btn' : ''}" data-action="run" data-id="${esc(cmd.id)}" title="${esc(runTooltip)}">${cmd.action === 'read' ? ICON_READ : ICON_PLAY} ${cmd.action === 'read' ? 'Open' : 'Run'}</button>
    </div>
  </div>
</div>`;
}

function buildLocationBar(wsPath: string | undefined): string {
    if (!wsPath) { return ''; }
    // Split path into segments for breadcrumb: C: \ dev \ vscode-claude
    const sep   = wsPath.includes('\\') ? '\\' : '/';
    const parts = wsPath.split(sep).filter(Boolean);

    const crumbs = parts.map((seg, i) => {
        const fullPath = (wsPath.startsWith('\\\\') ? '\\\\' : '') +
            parts.slice(0, i + 1).join(sep);
        const isLast   = i === parts.length - 1;
        const dispSep = sep;
        const sepHtml  = i > 0 ? `<span class="loc-sep">${esc(dispSep)}</span>` : '';
        if (isLast) {
            return `${sepHtml}<span class="loc-crumb loc-current">${esc(seg)}</span>`;
        }
        return `${sepHtml}<button class="loc-crumb loc-link" data-path="${esc(fullPath)}" title="Open ${esc(fullPath)} in terminal">${esc(seg)}</button>`;
    }).join('');

    return `<div id="location-bar">
  <button class="loc-nav" id="loc-back"  disabled title="Back">&larr;</button>
  <button class="loc-nav" id="loc-fwd"   disabled title="Forward">&rarr;</button>
  <div class="loc-crumbs">${crumbs}</div>
  <button class="loc-copy" id="loc-copy-btn" title="Copy path to clipboard">&#128203;</button>
</div>`;
}

export function buildLauncherHtml(
    report: DailyAuditReport | null,
    workspacePath?: string,
    history: HistoryEntry[] = [],
    recents: RecentProject[] = [], registeredCommands?: Set<string>
): string {
    const auditMap = new Map<string, { status: string; summary: string }>();
    if (report) { for (const c of report.checks) { auditMap.set(c.checkId, { status: c.status, summary: c.summary }); } }

    const auditAge    = report ? Math.round((Date.now() - new Date(report.generatedAt).getTime()) / 60000) : -1;
    const auditAgeStr = auditAge < 0 ? '' : auditAge < 60 ? `${auditAge}min ago` : auditAge < 1440 ? `${Math.round(auditAge/60)}hr ago` : `${Math.round(auditAge/1440)}d ago`;

    const noBannerHtml = report ? '' : `<div id="no-audit-banner">
  <span>&#x26AA; No audit data yet — run an initial audit to see health indicators on each command</span>
  <button data-action="run" data-id="cvs.audit.runDaily">🔍 Run Initial Audit</button>
</div>`;

    // Filter the catalog to only commands that are actually registered at runtime.
    // Issue #65 — without this filter, clicking a stale catalog ID surfaces a
    // "command not found" error from VS Code. The home page already does the
    // same filter; this brings the launcher to parity. When registeredCommands
    // is undefined (e.g. legacy callers or deserialization racing the registry),
    // we fall through to the full catalog rather than rendering nothing.
    const isRegistered = (c: CmdEntry): boolean => registeredCommands ? registeredCommands.has(c.id) : false;
    const registeredLookup: Record<string, true> | undefined = registeredCommands
      ? Object.fromEntries(Array.from(registeredCommands, id => [id, true] as const))
      : undefined;
    const visibleCatalog = registeredCommands
      ? CATALOG.filter(c => registeredLookup && registeredLookup[c.id])
      : CATALOG;
    const visibleGroups = [...new Set(visibleCatalog.map(c => c.group))];
    const visibleTags   = [...new Set(visibleCatalog.flatMap(c => c.tags))].sort();

    const byGroup = new Map<string, CmdEntry[]>();
    for (const cmd of visibleCatalog) {
        if (!byGroup.has(cmd.group)) { byGroup.set(cmd.group, []); }
        byGroup.get(cmd.group)!.push(cmd);
    }

    let groupSections = [...byGroup.entries()].map(([group, cmds]) =>
        `<section class="group-section" data-group="${esc(group)}">
  <h2 class="group-heading">${esc(group)} <span class="group-count">${cmds.length}</span></h2>
  <div class="cmd-grid">${cmds.map(cmd => buildCard(cmd, auditMap, group)).join('')}</div>
</section>`
    ).join('');

    const testCmds = visibleCatalog.filter(cmd => cmd.tags.includes('test'));
    if (testCmds.length > 0) {
        groupSections += `<section class="group-section" data-group="Tests">
  <h2 class="group-heading">Tests <span class="group-count">${testCmds.length}</span></h2>
  <div class="cmd-grid">${testCmds.map(cmd => buildCard(cmd, auditMap, 'Tests')).join('')}</div>
</section>`;
    }

    const groupBtns = visibleGroups.map(g => {
        let icon = visibleCatalog.find(c => c.group === g)?.groupIcon ?? '';
        if (g === 'Tests') { icon = '🧪'; }
        return `<button class="group-btn" data-group="${esc(g)}" title="Show ${esc(g)} commands only">${esc(g)}</button>`;
    }).join('');

    const topicCheckboxes = visibleTags.map(t =>
        `<label class="dd-item"><input type="checkbox" class="topic-cb" value="${esc(t)}"><span>${esc(t)}</span></label>`
    ).join('');

    const locationBarHtml = buildLocationBar(workspacePath);
    const wsPathJs        = (workspacePath ?? '').replace(/\\/g, '\\\\');
    const catalogJson = JSON.stringify(visibleCatalog);
    const total       = visibleCatalog.length;
    const historyJson = JSON.stringify(history);
    const recentsJson = JSON.stringify(recents.map(r => ({ name: r.name, fsPath: r.fsPath })));

    const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--vscode-font-family);font-size:13px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background)}
#toolbar{position:sticky;top:0;z-index:50;background:var(--vscode-editor-background);border-bottom:1px solid var(--vscode-panel-border);padding:10px 16px;display:flex;flex-direction:column;gap:8px}
#toolbar-top{display:flex;gap:8px;align-items:center}
#toolbar h1{font-size:1.1em;font-weight:700;white-space:nowrap}
#search{flex:1;padding:6px 10px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);border-radius:3px;font-size:13px}
#search:focus{outline:1px solid var(--vscode-focusBorder)}
#stat{font-size:11px;color:var(--vscode-descriptionForeground);white-space:nowrap}
#btn-clear{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:none;padding:5px 10px;border-radius:3px;cursor:pointer;font-size:12px}
#btn-clear:hover{background:var(--vscode-button-secondaryHoverBackground)}
#scope-toggle{display:flex;border:1px solid var(--vscode-panel-border);border-radius:4px;overflow:hidden;flex-shrink:0}
.scope-tog{background:transparent;color:var(--vscode-descriptionForeground);border:none;border-right:1px solid var(--vscode-panel-border);padding:5px 11px;cursor:pointer;font-size:12px;font-weight:500;white-space:nowrap;transition:background 0.1s}
.scope-tog:last-child{border-right:none}
.scope-tog:hover{background:var(--vscode-list-hoverBackground);color:var(--vscode-editor-foreground)}
.scope-tog.active{background:var(--vscode-button-background);color:var(--vscode-button-foreground);font-weight:700}
#group-bar{display:flex;gap:6px;flex-wrap:wrap}
.group-btn{background:transparent;color:var(--vscode-descriptionForeground);border:1px solid var(--vscode-panel-border);padding:3px 10px;border-radius:12px;cursor:pointer;font-size:11px;white-space:nowrap}
.group-btn:hover{border-color:var(--vscode-focusBorder);color:var(--vscode-editor-foreground)}
.group-btn.active{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border-color:var(--vscode-button-background)}
#browse-row{padding:8px 16px 0;display:flex;align-items:center;gap:10px}
#topic-wrap{position:relative;display:inline-block}
#topic-btn{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:1px solid var(--vscode-panel-border);padding:4px 12px;border-radius:3px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:6px}
#topic-btn:hover{background:var(--vscode-button-secondaryHoverBackground)}
#topic-badge{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border-radius:10px;padding:0 6px;font-size:10px;font-weight:700;display:none}
#topic-dropdown{position:absolute;top:calc(100% + 4px);left:0;z-index:200;background:var(--vscode-dropdown-background);border:1px solid var(--vscode-panel-border);border-radius:4px;min-width:220px;max-height:340px;overflow-y:auto;box-shadow:0 4px 12px rgba(0,0,0,0.3);display:none}
#topic-dropdown.open{display:block}
.dd-header{padding:6px 10px;border-bottom:1px solid var(--vscode-panel-border);display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--vscode-descriptionForeground);position:sticky;top:0;background:var(--vscode-dropdown-background)}
.dd-header button{background:none;border:none;color:var(--vscode-textLink-foreground);cursor:pointer;font-size:11px;padding:0}
.dd-header button:hover{text-decoration:underline}
.dd-item{display:flex;align-items:center;gap:8px;padding:5px 10px;cursor:pointer;font-size:12px}
.dd-item:hover{background:var(--vscode-list-hoverBackground)}
.dd-item input[type=checkbox]{cursor:pointer;accent-color:var(--vscode-button-background)}
.dd-item span{cursor:pointer}
#topic-summary{font-size:11px;color:var(--vscode-descriptionForeground)}
#content{padding:12px 16px 40px}
.group-section{margin-bottom:24px}
.group-section.hidden{display:none}
.group-heading{font-size:0.95em;font-weight:700;border-bottom:2px solid var(--vscode-focusBorder);padding-bottom:5px;margin-bottom:10px;display:flex;align-items:center;gap:8px}
.group-count{background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);border-radius:10px;padding:1px 7px;font-size:0.8em;font-weight:400}
.cmd-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:8px}
.cmd-card{position:relative;background:var(--vscode-textCodeBlock-background);border:1px solid var(--vscode-panel-border);border-radius:4px;padding:10px 12px 10px 22px;display:flex;flex-direction:column;gap:6px;transition:border-color 0.1s}
.cmd-card:hover{border-color:var(--vscode-focusBorder)}
.cmd-card.hidden{display:none}
.card-status-dot{position:absolute;top:10px;left:7px;width:9px;height:9px;border-radius:50%;flex-shrink:0;border:none;padding:0;cursor:default}
.card-status-dot--clickable{cursor:pointer;transition:transform 0.1s,box-shadow 0.1s}
.card-status-dot--clickable:hover{transform:scale(1.4);box-shadow:0 0 0 3px rgba(255,255,255,0.15)}
.cmd-breadcrumb{display:flex;align-items:center;gap:0;font-family:var(--vscode-editor-font-family,monospace);font-size:9px;color:rgba(255,255,255,0.5);flex-wrap:nowrap;overflow:hidden;margin-bottom:3px;letter-spacing:0.02em}
.bc-btn{background:transparent;border:none;padding:0 1px;cursor:pointer;font-family:inherit;font-size:inherit;border-radius:2px;color:rgba(255,255,255,0.75)}
.bc-btn:hover{color:#fff;text-decoration:underline}
.bc-root{color:rgba(255,255,255,0.45)}
.bc-group{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:rgba(255,255,255,0.75)}
.bc-leaf{color:#fff;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bc-s{color:rgba(255,255,255,0.3);flex-shrink:0;margin:0 1px}
.cmd-header{display:flex;justify-content:space-between;align-items:flex-start;gap:6px}
.cmd-title{font-weight:700;font-size:0.92em;flex:1;margin:0;line-height:1.3}
.cmd-dewey{font-family:var(--vscode-editor-font-family,'monospace');font-size:9px;color:var(--vscode-descriptionForeground);background:var(--vscode-editor-background);border:1px solid var(--vscode-panel-border);border-radius:3px;padding:1px 5px;white-space:nowrap;opacity:0.75;letter-spacing:0.03em}
.cmd-desc{font-size:11px;line-height:1.5;opacity:0.85;flex:1}
.cmd-footer{display:flex;justify-content:space-between;align-items:flex-end;gap:6px;flex-wrap:wrap}
.cmd-tags{display:flex;flex-wrap:wrap;gap:3px;flex:1}
.tag{font-size:9px;padding:1px 6px;border-radius:3px;background:var(--vscode-editor-background);border:1px solid var(--vscode-panel-border);color:var(--vscode-descriptionForeground);cursor:pointer}
.tag:hover{border-color:var(--vscode-focusBorder)}
.cmd-actions{display:flex;gap:4px;align-items:center;flex-shrink:0}
.run-btn{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;padding:4px 12px;border-radius:3px;cursor:pointer;font-size:11px;font-weight:600;white-space:nowrap;display:inline-flex;align-items:center;gap:4px}
.run-btn:hover{background:var(--vscode-button-hoverBackground)}
/* Read action — muted secondary style so readers are visually distinct from runners */
.read-btn{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}
.read-btn:hover{background:var(--vscode-button-secondaryHoverBackground)}
.help-btn{background:transparent;color:var(--vscode-descriptionForeground);border:1px solid var(--vscode-panel-border);padding:4px 8px;border-radius:3px;cursor:pointer;font-size:11px;white-space:nowrap}
.help-btn:hover{color:var(--vscode-textLink-foreground);border-color:var(--vscode-textLink-foreground)}
.f1-btn{background:var(--vscode-editor-background);color:var(--vscode-descriptionForeground);border:1px solid var(--vscode-panel-border);padding:3px 6px;border-radius:3px;cursor:pointer;font-size:10px;white-space:nowrap;line-height:1;display:inline-flex;align-items:center}
.f1-btn:hover{color:var(--vscode-editor-foreground);border-color:var(--vscode-focusBorder);background:var(--vscode-list-hoverBackground)}
.cmd-card:focus{outline:1px solid var(--vscode-focusBorder)}
.f1-overlay{position:fixed;inset:0;z-index:600;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5)}
.f1-box{background:var(--vscode-editor-background);border:1px solid var(--vscode-focusBorder);border-radius:6px;padding:22px 26px;min-width:360px;max-width:560px;max-height:80vh;overflow-y:auto;box-shadow:0 12px 40px rgba(0,0,0,0.6);display:flex;flex-direction:column;gap:14px}
.f1-header{display:flex;align-items:flex-start;gap:10px}
.f1-key{font-family:var(--vscode-editor-font-family,monospace);font-size:11px;font-weight:700;background:var(--vscode-textCodeBlock-background);border:1px solid var(--vscode-panel-border);border-radius:3px;padding:2px 7px;flex-shrink:0;color:var(--vscode-descriptionForeground)}
.f1-title{font-weight:700;font-size:1.05em;flex:1;line-height:1.3}
.f1-close{background:none;border:none;color:var(--vscode-descriptionForeground);cursor:pointer;font-size:18px;padding:0;line-height:1;flex-shrink:0}
.f1-close:hover{color:var(--vscode-editor-foreground)}
.f1-section{display:flex;flex-direction:column;gap:4px}
.f1-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--vscode-focusBorder);}
.f1-value{font-size:12px;line-height:1.6;color:var(--vscode-editor-foreground);opacity:0.9}
.f1-tags{display:flex;flex-wrap:wrap;gap:4px;margin-top:2px}
.f1-tag{font-size:10px;padding:1px 7px;border-radius:3px;background:var(--vscode-textCodeBlock-background);border:1px solid var(--vscode-panel-border);color:var(--vscode-descriptionForeground)}
.f1-actions{display:flex;gap:8px;padding-top:4px;border-top:1px solid var(--vscode-panel-border)}
.f1-run-btn{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;padding:6px 16px;border-radius:3px;cursor:pointer;font-size:12px;font-weight:600}
.f1-run-btn:hover{background:var(--vscode-button-hoverBackground)}
.f1-dismiss{background:transparent;border:1px solid var(--vscode-panel-border);color:var(--vscode-descriptionForeground);padding:6px 12px;border-radius:3px;cursor:pointer;font-size:12px}
.f1-dismiss:hover{border-color:var(--vscode-focusBorder)}
.scope-badge{display:inline-block;font-size:9px;padding:1px 6px;border-radius:3px;border:1px solid;font-weight:600;white-space:nowrap;margin-right:2px}
#empty{padding:40px 16px;text-align:center;color:var(--vscode-descriptionForeground);display:none}
#empty.visible{display:block}
.audit-detail-overlay{position:fixed;inset:0;z-index:500;display:flex;align-items:flex-start;justify-content:center;padding-top:60px;background:rgba(0,0,0,0.45)}
.audit-detail-box{background:var(--vscode-editor-background);border:1px solid var(--vscode-focusBorder);border-radius:6px;padding:20px 22px;min-width:340px;max-width:520px;box-shadow:0 8px 32px rgba(0,0,0,0.5);display:flex;flex-direction:column;gap:12px}
.audit-detail-header{display:flex;align-items:center;gap:10px}
.audit-detail-dot{width:12px;height:12px;border-radius:50%;flex-shrink:0}
.audit-detail-title{font-weight:700;font-size:1em;flex:1}
.audit-detail-close{background:none;border:none;color:var(--vscode-descriptionForeground);cursor:pointer;font-size:16px;padding:0 2px;line-height:1}
.audit-detail-close:hover{color:var(--vscode-editor-foreground)}
.audit-detail-summary{font-size:12px;line-height:1.6;border-left:3px solid var(--vscode-focusBorder);padding:6px 10px;background:var(--vscode-textCodeBlock-background);border-radius:0 3px 3px 0}
.audit-detail-actions{display:flex;gap:8px;flex-wrap:wrap}
.audit-fix-btn{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;padding:6px 14px;border-radius:3px;cursor:pointer;font-size:12px;font-weight:600}
.audit-fix-btn:hover{background:var(--vscode-button-hoverBackground)}
.audit-run-btn{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:none;padding:6px 12px;border-radius:3px;cursor:pointer;font-size:12px}
.audit-run-btn:hover{background:var(--vscode-button-secondaryHoverBackground)}
#location-bar{display:flex;align-items:center;gap:6px;padding:4px 16px;background:var(--vscode-textCodeBlock-background);border-bottom:1px solid var(--vscode-panel-border);font-family:var(--vscode-editor-font-family,monospace);font-size:11px;overflow-x:auto;white-space:nowrap;min-height:26px}
.loc-pin{flex-shrink:0;font-size:11px;opacity:0.4}
.loc-crumbs{display:flex;align-items:center;flex-wrap:nowrap;gap:0;flex:1;overflow:hidden}
.loc-sep{color:rgba(255,255,255,0.25);margin:0 1px;flex-shrink:0}
.loc-crumb{font-family:inherit;font-size:11px;padding:0 2px;border-radius:2px;white-space:nowrap;color:rgba(255,255,255,0.6)}
.loc-link{background:transparent;border:none;color:rgba(255,255,255,0.6);cursor:pointer;font-family:inherit;font-size:inherit;padding:0 2px}
.loc-link:hover{color:#fff;text-decoration:underline}
.loc-current{color:#fff;font-weight:700}
.loc-copy{background:transparent;border:none;color:rgba(255,255,255,0.3);cursor:pointer;font-size:11px;padding:1px 4px;border-radius:2px;flex-shrink:0;font-family:inherit}
.loc-copy:hover{color:#fff}
.loc-nav{background:transparent;border:none;color:rgba(255,255,255,0.5);cursor:pointer;font-size:13px;padding:2px 6px;border-radius:3px;font-family:inherit;flex-shrink:0}
.loc-nav:hover:not(:disabled){color:#fff;background:rgba(255,255,255,0.1)}
.loc-nav:disabled{opacity:0.2;cursor:default}
#no-audit-banner{display:flex;align-items:center;gap:12px;padding:8px 16px;background:var(--vscode-inputValidation-warningBackground,rgba(204,167,0,0.1));border-bottom:1px solid var(--vscode-inputValidation-warningBorder,#cca700);font-size:12px}
#no-audit-banner span{flex:1}
#no-audit-banner button,#btn-audit{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;padding:4px 12px;border-radius:3px;cursor:pointer;font-size:12px;font-weight:600;white-space:nowrap}
#no-audit-banner button:hover,#btn-audit:hover{background:var(--vscode-button-hoverBackground)}
#run-status{position:fixed;bottom:0;left:0;right:0;padding:6px 16px;font-size:12px;background:var(--vscode-statusBar-background);color:var(--vscode-statusBar-foreground);display:none;align-items:center;gap:8px;z-index:100;border-top:1px solid var(--vscode-panel-border)}
#run-status.visible{display:flex}
.spin{display:inline-block;animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
/* ── History strip ── */
#history-strip{display:flex;align-items:center;gap:6px;padding:5px 16px;background:var(--vscode-textCodeBlock-background);border-bottom:1px solid var(--vscode-panel-border);overflow-x:auto;white-space:nowrap;min-height:32px}
#history-strip.empty{display:none}
#history-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--vscode-descriptionForeground);flex-shrink:0}
.hist-btn{background:transparent;border:1px solid var(--vscode-panel-border);color:var(--vscode-editor-foreground);border-radius:3px;padding:2px 8px;cursor:pointer;font-size:11px;font-family:inherit;white-space:nowrap;display:inline-flex;align-items:center;gap:4px;flex-shrink:0}
.hist-btn:hover{border-color:var(--vscode-focusBorder);background:var(--vscode-list-hoverBackground)}
.hist-ok{color:#3fb950}.hist-err{color:#f85149}
/* ── Recent projects dropdown ── */
#recent-wrap{position:relative;display:inline-block;flex-shrink:0}
#btn-recent{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:none;padding:5px 10px;border-radius:3px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:5px}
#btn-recent:hover{background:var(--vscode-button-secondaryHoverBackground)}
#recent-dd{display:none;position:absolute;top:calc(100% + 4px);right:0;z-index:200;background:var(--vscode-dropdown-background);border:1px solid var(--vscode-panel-border);border-radius:4px;min-width:240px;box-shadow:0 4px 12px rgba(0,0,0,.3)}
#recent-dd.open{display:block}
.recent-item{display:flex;align-items:center;gap:8px;padding:7px 12px;cursor:pointer;font-size:12px;border-bottom:1px solid var(--vscode-panel-border)}
.recent-item:last-child{border-bottom:none}
.recent-item:hover{background:var(--vscode-list-hoverBackground)}
.recent-name{font-weight:700;flex:1}
.recent-path{font-size:10px;color:var(--vscode-descriptionForeground);font-family:var(--vscode-editor-font-family,monospace);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px}
`;

    // BUG FIX: Moved from getElementById('content').addEventListener to document.addEventListener
    // so that the toolbar 🔍 Audit button and the no-audit-banner button are also handled.
    // Those buttons live OUTSIDE #content so their clicks were silently swallowed before.
    // Tag clicks are guarded with .closest('#content') so they still only fire from cards.
    const JS = `
(function(){
'use strict';
const vscode   = acquireVsCodeApi();
const CATALOG  = ${catalogJson};
const TOTAL    = ${total};
let _activeTags = new Set(), _activeGroup = '', _searchQ = '', _ddOpen = false, _activeScope = '';

var _runBtn = null, _runBtnOrig = '', _runBtnTimeout = null;
function _resetRunBtn() {
  if (_runBtn) { _runBtn.innerHTML = _runBtnOrig; _runBtn.disabled = false; _runBtn.style.opacity = ''; _runBtn = null; }
  if (_runBtnTimeout) { clearTimeout(_runBtnTimeout); _runBtnTimeout = null; }
}
const searchEl     = document.getElementById('search');
const statEl       = document.getElementById('stat');
const emptyEl      = document.getElementById('empty');
const runStatus    = document.getElementById('run-status');
const runStatusTxt = document.getElementById('run-status-text');
const runStatusCmd = document.getElementById('run-status-cmd');
const topicBtn     = document.getElementById('topic-btn');
const topicDd      = document.getElementById('topic-dropdown');
const topicArrow   = document.getElementById('topic-arrow');
const topicBadge   = document.getElementById('topic-badge');
const topicSummary = document.getElementById('topic-summary');

searchEl.addEventListener('input', function() {
  _searchQ = searchEl.value.toLowerCase().trim();
  applyFilters();
});

topicBtn.addEventListener('click', function(e) {
  e.stopPropagation();
  _ddOpen = !_ddOpen;
  topicDd.className = _ddOpen ? 'open' : '';
  topicArrow.textContent = _ddOpen ? '\\u25b4' : '\\u25be';
});

document.getElementById('dd-select-all').addEventListener('click', function(e) {
  e.stopPropagation();
  selectAllTopics();
});
document.getElementById('dd-clear').addEventListener('click', function(e) {
  e.stopPropagation();
  clearTopics();
});

topicDd.addEventListener('change', function(e) {
  if (e.target.classList.contains('topic-cb')) {
    if (e.target.checked) { _activeTags.add(e.target.value); }
    else                  { _activeTags.delete(e.target.value); }
    updateBadge();
    applyFilters();
  }
});

function selectAllTopics() {
  document.querySelectorAll('.topic-cb').forEach(function(cb) { cb.checked = true; _activeTags.add(cb.value); });
  updateBadge(); applyFilters();
}
function clearTopics() {
  document.querySelectorAll('.topic-cb').forEach(function(cb) { cb.checked = false; });
  _activeTags.clear(); updateBadge(); applyFilters();
}
function updateBadge() {
  var count = _activeTags.size;
  if (count === 0) { topicBadge.style.display = 'none'; topicSummary.textContent = ''; }
  else {
    topicBadge.style.display = 'inline';
    topicBadge.textContent   = count;
    var tags = Array.from(_activeTags).slice(0, 3).join(', ');
    topicSummary.textContent = count > 3 ? tags + ' +' + (count - 3) + ' more' : tags;
  }
}

document.addEventListener('keydown', function(e) {
  if (e.ctrlKey && e.key === 'a' && _ddOpen) { e.preventDefault(); selectAllTopics(); return; }
  if (e.key === 'Escape') {
    if (document.querySelector('.audit-detail-overlay')) { closeAuditDetail(); return; }
    if (_ddOpen) { _ddOpen = false; topicDd.className = ''; topicArrow.textContent = '\\u25be'; }
    else { clearAll(); }
  }
});

// Close topic dropdown on outside click
document.addEventListener('click', function(e) {
  if (_ddOpen && !e.target.closest('#topic-wrap')) {
    _ddOpen = false; topicDd.className = ''; topicArrow.textContent = '\\u25be';
  }
});

// Group filter bar
document.getElementById('group-bar').addEventListener('click', function(e) {
  var btn = e.target.closest('.group-btn');
  if (!btn) { return; }
  _navigateTo(btn.dataset.group || '', '');
});

// ── MAIN CLICK HANDLER (document-level so toolbar + banner buttons are handled too) ──
document.addEventListener('click', function(e) {
  // Breadcrumb — root clears all filters, group filters to that group
  var bcBtn = e.target.closest('[data-action^="bc-"]');
  if (bcBtn) {
    var bcAction = bcBtn.dataset.action;
    if (bcAction === 'bc-root') {
      _navigateTo('', '');
    } else if (bcAction === 'bc-group') {
      _navigateTo(bcBtn.dataset.group, '');
    }
    return;
  }

  // Tag badge — only fire from inside #content cards
  var tagEl = e.target.closest('.tag');
  if (tagEl && tagEl.closest('#content')) {
    var t = tagEl.dataset.tag;
    _activeTags.add(t);
    var cb = topicDd.querySelector('.topic-cb[value="' + t.replace(/"/g, '\\"') + '"]');
    if (cb) { cb.checked = true; }
    updateBadge(); applyFilters();
    document.getElementById('browse-row').scrollIntoView({ behavior: 'smooth' });
    return;
  }

  // Audit status dot
  var dotBtn = e.target.closest('[data-action="show-audit"]');
  if (dotBtn) { showAuditDetail(dotBtn); return; }

  // Log toggle button on the Run Audit card
  var logBtn = e.target.closest('[data-action="toggle-audit-output"]');
  if (logBtn) { vscode.postMessage({ command: 'toggle-audit-output' }); return; }

  // Help button
  var helpBtn = e.target.closest('[data-action="help"]');
  if (helpBtn) { vscode.postMessage({ command: 'help', doc: helpBtn.dataset.doc }); return; }

  // F1 help modal
  var f1Btn = e.target.closest('[data-action="show-f1"]');
  if (f1Btn) { showF1Modal(f1Btn.dataset.f1); return; }

  // Close F1 modal
  if (e.target.closest('[data-action="close-f1"]') || e.target.classList.contains('f1-overlay')) { closeF1Modal(); return; }

  // F1 run-from-modal
  var f1Run = e.target.closest('[data-action="f1-run"]');
  if (f1Run) { closeF1Modal(); vscode.postMessage({ command: 'run', id: f1Run.dataset.id }); return; }

  // Close audit overlay
  var closeBtn = e.target.closest('[data-action="close-audit"]');
  if (closeBtn) { closeAuditDetail(); return; }

  // Audit fix button (inside overlay)
  var fixBtn = e.target.closest('[data-action="audit-fix"]');
  if (fixBtn) { closeAuditDetail(); vscode.postMessage({ command: 'run', id: fixBtn.dataset.id }); return; }

  // Close overlay on backdrop click
  if (e.target.classList.contains('audit-detail-overlay')) { closeAuditDetail(); return; }

  // ── Run any [data-action="run"] button anywhere on the page ──
  // This now catches: toolbar Audit button, no-audit-banner, and all card Run buttons
  var btn = e.target.closest('[data-action="run"]');
  if (btn) {
    // Skip if inside topic dropdown or group bar (they have their own handlers)
    if (btn.closest('#topic-wrap') || btn.closest('#group-bar')) { return; }
    var id    = btn.dataset.id;
    var entry = CATALOG.find(function(c) { return c.id === id; });
    var title = entry ? entry.title : id;
    _runBtn = btn; _runBtnOrig = btn.innerHTML;
    btn.innerHTML     = '\u23f3 Running\u2026';
    btn.disabled      = true;
    btn.style.opacity = '0.7';
    runStatusTxt.textContent = 'Running:';
    runStatusCmd.textContent = title;
    runStatus.classList.add('visible');
    setTimeout(function() {




      _resetRunBtn(); runStatus.classList.remove('visible');
    }, 30000);
    vscode.postMessage({ command: 'run', id: id });
  }
});

document.getElementById('btn-clear').addEventListener('click', clearAll);
// Scope toggle — Both / Global / Local Folder
document.getElementById('scope-toggle').addEventListener('click', function(e) {
  var btn = e.target.closest('.scope-tog');
  if (!btn) { return; }
  _activeScope = btn.dataset.scope;
  document.querySelectorAll('.scope-tog').forEach(function(b) {
    b.classList.toggle('active', b.dataset.scope === _activeScope);
  });
  applyFilters();
});

function clearAll() {
  _activeGroup   = ''; _searchQ = ''; _activeScope = '';
  searchEl.value = '';
  document.querySelectorAll('.scope-tog').forEach(function(b) { b.classList.toggle('active', b.dataset.scope === ''); });
  clearTopics();
  document.querySelectorAll('.group-btn').forEach(function(b) { b.classList.toggle('active', b.dataset.group === ''); });
  document.querySelectorAll('.cmd-card, .group-section').forEach(function(el) { el.classList.remove('hidden'); });
  emptyEl.classList.remove('visible');
  statEl.textContent = TOTAL + ' commands';
}

function applyFilters() {
  var visible = 0;
  document.querySelectorAll('.cmd-card').forEach(function(card) {
    var group  = card.dataset.group;
    var tags   = (card.dataset.tags || '').toLowerCase();
    var titleT = (card.querySelector('.cmd-title') ? card.querySelector('.cmd-title').textContent : '').toLowerCase();
    var descT  = (card.querySelector('.cmd-desc')  ? card.querySelector('.cmd-desc').textContent  : '').toLowerCase();
    var scope     = card.dataset.scope || '';
    var matchGroup = !_activeGroup || group === _activeGroup;
    var matchScope = !_activeScope
      || (_activeScope === 'global' && scope === 'global')
      || (_activeScope === 'local'  && scope !== 'global');
    var matchTopic = _activeTags.size === 0 || Array.from(_activeTags).some(function(t) { return tags.indexOf(t.toLowerCase()) !== -1; });
    var matchQ     = !_searchQ || titleT.indexOf(_searchQ) !== -1 || descT.indexOf(_searchQ) !== -1 || tags.indexOf(_searchQ) !== -1;
    var show = matchGroup && matchScope && matchTopic && matchQ;
    card.classList.toggle('hidden', !show);
    if (show) { visible++; }
  });
  document.querySelectorAll('.group-section').forEach(function(sec) {
    sec.classList.toggle('hidden', !sec.querySelector('.cmd-card:not(.hidden)'));
  });
  emptyEl.classList.toggle('visible', visible === 0);
  statEl.textContent = visible === TOTAL ? TOTAL + ' commands' : visible + ' of ' + TOTAL + ' commands';
}

window.addEventListener('message', function(e) {
  var msg = e.data;
  if (msg.type === 'done')  { _resetRunBtn(); runStatusTxt.textContent = '\u2705 Done:';  runStatusCmd.textContent = msg.title || '';   setTimeout(function() { runStatus.classList.remove('visible'); }, 2000); }
  if (msg.type === 'error') { _resetRunBtn(); runStatusTxt.textContent = '\u274c Failed:'; runStatusCmd.textContent = msg.message || msg.title || ''; setTimeout(function() { runStatus.classList.remove('visible'); }, 4000); }
  // Green/red status light per card when run-state arrives from extension host
  if (msg.type === 'run-state') {
    var card = document.querySelector('.cmd-card[data-id="' + msg.id + '"]');
    if (card) {
      var dot = card.querySelector('.card-status-dot');
      if (!dot) {
        dot = document.createElement('span');
        dot.className = 'card-status-dot';
        card.prepend(dot);
      }
      if (msg.state === 'running') {
        dot.style.background = '#3fb950';
        dot.style.boxShadow  = '0 0 6px #3fb950';
        dot.title = 'Running\u2026';
        // Reset after 30s safety timeout
        if (dot._runTimeout) clearTimeout(dot._runTimeout);
        dot._runTimeout = setTimeout(function(){ dot.style.background=''; dot.style.boxShadow=''; }, 30000);
      } else if (msg.state === 'ok') {
        dot.style.background = '#3fb950';
        dot.style.boxShadow  = 'none';
        dot.title = '\u2705 Last run succeeded';
        if (dot._runTimeout) clearTimeout(dot._runTimeout);
      } else if (msg.state === 'error') {
        dot.style.background = '#f85149';
        dot.style.boxShadow  = '0 0 6px #f85149';
        dot.title = '\u274c Last run failed';
        if (dot._runTimeout) clearTimeout(dot._runTimeout);
      }
    }
    _resetRunBtn();
    runStatus.classList.remove('visible');
  }
  // Real-time MCP server status update
  if (msg.type === 'mcp-status') {
    // Ensure MCP card has a status dot, then update its color.
    var mcpWrap = document.querySelector('.cmd-card[data-id="cvs.mcp.startServer"]');
    if (mcpWrap) {
      var mcpCard = mcpWrap.querySelector('.card-status-dot');
      if (!mcpCard) {
        mcpCard = document.createElement('span');
        mcpCard.className = 'card-status-dot';
        mcpWrap.prepend(mcpCard);
      }
      if (msg.status === 'up') {
        mcpCard.style.background = '#3fb950';
        mcpCard.style.boxShadow = 'none';
        mcpCard.title = 'MCP server is running';
      } else {
        mcpCard.style.background = '#f48771';
        mcpCard.style.boxShadow = 'none';
        mcpCard.title = 'MCP server is stopped';
      }
    }
  }
});

searchEl.focus();

// ── Command history ──
var _history = ${historyJson};
function renderHistory(hist) {
  var strip = document.getElementById('history-strip');
  if (!strip) return;
  if (!hist || hist.length === 0) { strip.className = 'empty'; return; }
  strip.className = '';
  var html = '<span id="history-label">Recent:</span>';
  hist.slice(0, 10).forEach(function(h) {
    var icon = h.ok ? '<span class="hist-ok">\u2705</span>' : '<span class="hist-err">\u274c</span>';
    html += '<button class="hist-btn" data-action="run" data-id="' + h.id.replace(/"/g,'&quot;') + '" title="Re-run: ' + h.title.replace(/"/g,'&quot;') + '">' + icon + ' ' + h.title.replace(/&/g,'&amp;').replace(/</g,'&lt;') + '</button>';
  });
  strip.innerHTML = html;
}
renderHistory(_history);

// ── Recent projects ──
var _recents = ${recentsJson};
var _recentOpen = false;
var btnRecent = document.getElementById('btn-recent');
var recentDd  = document.getElementById('recent-dd');
if (btnRecent && recentDd) {
  if (_recents.length === 0) { btnRecent.style.display = 'none'; }
  else {
    recentDd.innerHTML = _recents.map(function(r) {
      return '<div class="recent-item" data-path="' + r.fsPath.replace(/"/g,'&quot;') + '">'
        + '<div><div class="recent-name">' + r.name.replace(/&/g,'&amp;') + '</div>'
        + '<div class="recent-path">' + r.fsPath.replace(/&/g,'&amp;') + '</div></div></div>';
    }).join('');
    recentDd.addEventListener('click', function(e) {
      var item = e.target.closest('.recent-item');
      if (!item) return;
      recentDd.className = '';
      _recentOpen = false;
      vscode.postMessage({ command: 'open-recent', path: item.dataset.path });
    });
    btnRecent.addEventListener('click', function(e) {
      e.stopPropagation();
      _recentOpen = !_recentOpen;
      recentDd.className = _recentOpen ? 'open' : '';
    });
    document.addEventListener('click', function(e) {
      if (_recentOpen && !e.target.closest('#recent-wrap')) {
        _recentOpen = false; recentDd.className = '';
      }
    });
  }
}

// ── History update from extension after a run ──
var _origMsgListener = null;
window.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'history-update') { renderHistory(e.data.history); }
});

// ── Navigation model: location bar = current directory ─────────────────────
// Clicking any segment navigates to that level and filters cards accordingly.
// Level 0 = root (all cards), Level 1 = group, Level 2 = single card

var _wsSegments = (function(){
  // Parse the initial loc-crumbs into an array of { label, path } for workspace segments
  var segs = [];
  document.querySelectorAll('.loc-crumbs .loc-link').forEach(function(b) {
    segs.push({ label: b.textContent.trim(), path: b.dataset.path || '' });
  });
  var cur = document.querySelector('.loc-crumbs .loc-current');
  if (cur) segs.push({ label: cur.textContent.trim(), path: '' });
  return segs;
})();

var _navGroup = '';   // current group filter ('' = root)
var _navCard  = '';   // current card filter ('' = group or root)

// History stack for back/forward
var _navHistory = [{ group: '', card: '' }];  // starts at root
var _navIdx     = 0;


function _rebuildLocBar(group, cardTitle) {
  var c = document.querySelector('.loc-crumbs');
  if (!c) return;

  var html = '';
  // Workspace segments — all clickable back to root
  _wsSegments.forEach(function(seg, i) {
    if (i > 0) html += '<span class="loc-sep">\\</span>';
    if (i < _wsSegments.length - 1) {
      html += '<button class="loc-crumb loc-link" data-action="loc-ws" data-path="' + (seg.path || '').replace(/"/g,'&quot;') + '">' + seg.label.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</button>';
    } else if (!group) {
      html += '<span class="loc-crumb loc-current">' + seg.label.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</span>';
    } else {
      html += '<button class="loc-crumb loc-link" data-action="loc-root">' + seg.label.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</button>';
    }
  });

  if (group) {
    html += '<span class="loc-sep">\\</span>';
    if (!cardTitle) {
      html += '<span class="loc-crumb loc-current">' + group.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</span>';
    } else {
      html += '<button class="loc-crumb loc-link" data-action="loc-group" data-group="' + group.replace(/"/g,'&quot;') + '">' + group.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</button>';
    }
  }

  if (cardTitle) {
    html += '<span class="loc-sep">\\</span><span class="loc-crumb loc-current">' + cardTitle.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</span>';
  }

  c.innerHTML = html;
}

function _applyNav(group, cardId) {
  _navGroup = group || '';
  _navCard  = cardId || '';

  var cardTitle = '';
  if (cardId) {
    var cardEl = document.querySelector('.cmd-card[data-id="' + cardId + '"]');
    if (cardEl) { var t = cardEl.querySelector('.cmd-title'); if (t) cardTitle = t.textContent.trim(); }
  }

  _rebuildLocBar(_navGroup, cardTitle);

  document.querySelectorAll('.cmd-card').forEach(function(card) {
    var show;
    if (_navCard)       { show = card.dataset.id    === _navCard;  }
    else if (_navGroup) { show = card.dataset.group === _navGroup; }
    else                { show = true; }
    card.classList.toggle('hidden', !show);
  });
  document.querySelectorAll('.group-section').forEach(function(sec) {
    sec.classList.toggle('hidden', !sec.querySelector('.cmd-card:not(.hidden)'));
  });
  document.querySelectorAll('.group-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.group === _navGroup);
  });

  var vis = document.querySelectorAll('.cmd-card:not(.hidden)').length;
  statEl.textContent = vis === TOTAL ? TOTAL + ' commands' : vis + ' of ' + TOTAL + ' commands';
  window.scrollTo({ top: 0, behavior: 'smooth' });
  _updateNavBtns();
}

function _navigateTo(group, cardId) {
  // Truncate forward history when navigating to a new location
  _navHistory = _navHistory.slice(0, _navIdx + 1);
  _navHistory.push({ group: group || '', card: cardId || '' });
  _navIdx = _navHistory.length - 1;
  _applyNav(group, cardId);
}

function _navBack() {
  if (_navIdx <= 0) return;
  _navIdx--;
  var h = _navHistory[_navIdx];
  _applyNav(h.group, h.card);
}

function _navForward() {
  if (_navIdx >= _navHistory.length - 1) return;
  _navIdx++;
  var h = _navHistory[_navIdx];
  _applyNav(h.group, h.card);
}

function _updateNavBtns() {
  var back = document.getElementById('loc-back');
  var fwd  = document.getElementById('loc-fwd');
  if (back) back.disabled = _navIdx <= 0;
  if (fwd)  fwd.disabled  = _navIdx >= _navHistory.length - 1;
}

// Location bar — back/forward + copy + segment clicks
(function(){
  var backBtn = document.getElementById('loc-back');
  var fwdBtn  = document.getElementById('loc-fwd');
  if (backBtn) backBtn.addEventListener('click', function() { _navBack(); });
  if (fwdBtn)  fwdBtn.addEventListener('click',  function() { _navForward(); });

  var copyBtn = document.getElementById('loc-copy-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', function() {
      var path = '${wsPathJs}';
      if (!path) return;
      navigator.clipboard.writeText(path).then(function() {
        copyBtn.textContent = '\u2705';
        setTimeout(function(){ copyBtn.textContent = '\u{1F4CB}'; }, 1500);
      }).catch(function(){
        copyBtn.textContent = '\u274c';
        setTimeout(function(){ copyBtn.textContent = '\u{1F4CB}'; }, 1500);
      });
    });
  }
  document.addEventListener('click', function(e) {
    var seg = e.target.closest('.loc-link');
    if (!seg) return;
    var act = seg.dataset.action;
    // Navigate back to root (workspace folder level)
    if (act === 'loc-root' || act === 'loc-ws') {
      if (act === 'loc-ws' && seg.dataset.path) {
        // Clicking a parent path segment opens that folder in terminal
        vscode.postMessage({ command: 'openFolder', path: seg.dataset.path });
        return;
      }
      _navigateTo('', '');
      return;
    }
    // Navigate back to group level
    if (act === 'loc-group') {
      _navigateTo(seg.dataset.group, '');
      return;
    }
    // Regular workspace path click
    if (seg.dataset.path) {
      vscode.postMessage({ command: 'openFolder', path: seg.dataset.path });
    }
  });
})();

// Audit detail overlay
var FIX_ACTIONS = {
  'claudeCoverage': { id: 'cvs.docs.syncCheck',     label: '🔧 Open Sync Check'              },
  'registryHealth': { id: 'cvs.docs.openRegistry',  label: '📄 Open Registry'                },
  'marketplace':    { id: 'cvs.marketplace.fixAll', label: '🔧 Fix All Marketplace Issues'   },
  'readmeQuality':  { id: 'cvs.readme.fixAll',      label: '🔧 Fix All READMEs'              },
  'changelog':      { id: 'cvs.marketplace.fixAll', label: '🔧 Auto-generate Changelog'      },
  'testCoverage':   { id: 'cvs.audit.testCoverage', label: '🎭 Fix Test Coverage'            },
};

function showAuditDetail(dotEl) {
  var checkId = dotEl.dataset.checkId || '';
  var status  = dotEl.dataset.status  || 'red';
  var summary = dotEl.dataset.summary || 'Issues were found during the last audit.';
  var color   = status === 'red' ? '#f48771' : '#cca700';
  var label   = status === 'red' ? '🔴 Issues Found' : '🟡 Warnings';
  var fix     = FIX_ACTIONS[checkId];
  var html    = '<div class="audit-detail-overlay">' +
    '<div class="audit-detail-box">' +
      '<div class="audit-detail-header">' +
        '<span class="audit-detail-dot" style="background:' + color + '"></span>' +
        '<span class="audit-detail-title">' + label + '</span>' +
        '<button class="audit-detail-close" data-action="close-audit">&times;</button>' +
      '</div>' +
      '<div class="audit-detail-summary">' + summary.replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</div>' +
      '<div class="audit-detail-actions">' +
        (fix ? '<button class="audit-fix-btn" data-action="audit-fix" data-id="' + fix.id + '">' + fix.label + '</button>' : '') +
        '<button class="audit-run-btn" data-action="audit-fix" data-id="cvs.audit.runDaily">🔄 Re-run Audit</button>' +
        '<button class="audit-run-btn" data-action="close-audit">Dismiss</button>' +
      '</div>' +
    '</div>' +
  '</div>';
  closeAuditDetail();
  var overlay = document.createElement('div');
  overlay.innerHTML = html;
  document.body.appendChild(overlay.firstChild);
}

// ── F1 Help Modal ────────────────────────────────────────────────────────────
function showF1Modal(jsonStr) {
  closeF1Modal();
  var d;
  try { d = JSON.parse(jsonStr); } catch(e) { return; }
  var tagsHtml = (d.tags || '').split(',').map(function(t) {
    t = t.trim(); return t ? '<span class="f1-tag">' + t.replace(/&/g,'&amp;').replace(/</g,'&lt;') + '</span>' : '';
  }).join('');
  var overlay = document.createElement('div');
  overlay.className = 'f1-overlay';
  overlay.innerHTML =
    '<div class="f1-box">' +
      '<div class="f1-header">' +
        '<span class="f1-key">F1</span>' +
        '<span class="f1-title">' + (d.title||'').replace(/&/g,'&amp;').replace(/</g,'&lt;') + '</span>' +
        '<button class="f1-close" data-action="close-f1" title="Close (Esc)">&times;</button>' +
      '</div>' +
      '<div class="f1-section"><div class="f1-label">What it does</div>' +
        '<div class="f1-value">' + (d.desc||'').replace(/&/g,'&amp;').replace(/</g,'&lt;') + '</div></div>' +
      '<div class="f1-section"><div class="f1-label">Where it works</div>' +
        '<div class="f1-value">' + (d.scope||'').replace(/&/g,'&amp;').replace(/</g,'&lt;') + '</div></div>' +
      '<div class="f1-section"><div class="f1-label">Group</div>' +
        '<div class="f1-value">' + (d.group||'').replace(/&/g,'&amp;').replace(/</g,'&lt;') + '</div></div>' +
      (tagsHtml ? '<div class="f1-section"><div class="f1-label">Tags</div><div class="f1-tags">' + tagsHtml + '</div></div>' : '') +
      '<div class="f1-section"><div class="f1-label">Catalogue number</div>' +
        '<div class="f1-value" style="font-family:monospace">' + (d.dewey||'') + '</div></div>' +
      '<div class="f1-actions">' +
        '<button class="f1-run-btn" data-action="f1-run" data-id="' + (d.id||'').replace(/"/g,'&quot;') + '" title="Run this command now">Run now</button>' +
        '<button class="f1-dismiss" data-action="close-f1">Close</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  // Trap Escape key
  overlay._keyHandler = function(e) { if (e.key === 'Escape') { closeF1Modal(); } };
  document.addEventListener('keydown', overlay._keyHandler);
}

function closeF1Modal() {
  var el = document.querySelector('.f1-overlay');
  if (el) {
    if (el._keyHandler) { document.removeEventListener('keydown', el._keyHandler); }
    el.remove();
  }
}

// Also handle F1 key pressed while a card is focused
document.addEventListener('keydown', function(e) {
  if (e.key === 'F1') {
    var focused = document.activeElement && document.activeElement.closest('.cmd-card');
    if (focused) {
      e.preventDefault();
      var f1Btn = focused.querySelector('[data-action="show-f1"]');
      if (f1Btn) { showF1Modal(f1Btn.dataset.f1); }
    }
  }
});

function closeAuditDetail() {
  var existing = document.querySelector('.audit-detail-overlay');
  if (existing) { existing.remove(); }
}

})();
`;

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${CSS}</style></head><body>
${noBannerHtml}
${locationBarHtml}
<div id="toolbar">
  <div id="toolbar-top">
    <h1 title="CieloVista Tools — developer toolkit">CieloVista Tools</h1>
    <input id="search" type="text" placeholder="Search commands, descriptions, or tags&#8230;" autocomplete="off">
    <div id="scope-toggle" title="Filter by where the command works">
      <button class="scope-tog active" data-scope="" title="Show all commands">All</button>
      <button class="scope-tog" data-scope="global" title="Show only commands that work from any workspace">Global</button>
      <button class="scope-tog" data-scope="local" title="Show only commands that act on the current workspace folder">Local</button>
    </div>
    <button id="btn-clear" title="Clear all filters and search">Clear</button>
    <button id="btn-audit" data-action="run" data-id="cvs.audit.runDaily" title="Run daily health check across all projects">Audit</button>
    <div id="recent-wrap">
      <button id="btn-recent" title="Open a recent project">&#128194; Recent &#9662;</button>
      <div id="recent-dd"></div>
    </div>
    <span id="stat">${total} commands</span>
    ${auditAgeStr ? `<span style="font-size:10px;color:var(--vscode-descriptionForeground)">&#x23F1; ${esc(auditAgeStr)}</span>` : ''}
  </div>
  <div id="group-bar">
    <button class="group-btn active" data-group="">All</button>
    ${groupBtns}
  </div>
</div>
<div id="browse-row">
  <div id="topic-wrap">
    <button id="topic-btn" title="Filter commands by topic tags">Browse by topic <span id="topic-badge"></span><span id="topic-arrow">&#9662;</span></button>
    <div id="topic-dropdown">
      <div class="dd-header">
        <span>Topics</span>
        <div style="display:flex;gap:8px">
          <button id="dd-select-all">Select all</button>
          <button id="dd-clear">Clear</button>
        </div>
      </div>
      ${topicCheckboxes}
    </div>
  </div>
  <span id="topic-summary"></span>
</div>
<div id="history-strip" class="empty"></div>
<div id="content">
  ${groupSections}
  <div id="empty">No commands match your search.</div>
</div>
<div id="run-status">
  <span class="spin">&#9696;</span>
  <span id="run-status-text">Running&#8230;</span>
  <span id="run-status-cmd" style="opacity:0.7"></span>
</div>
<script>${JS}</script></body></html>`;
}
