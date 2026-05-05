// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { loadRegistry } from '../shared/registry';
import { log } from '../shared/output-channel';

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.vscode', '.vscode-test', 'dist', 'out',
  'test-results', 'playwright-report', 'reports'
]);

interface Finding {
  projectName: string;
  filePath: string;
  line: number;
  kind: 'image' | 'link' | 'doc-id';
  target: string;
  candidates: string[];
}

interface ProjectRollup {
  projectName: string;
  rootPath: string;
  docsScanned: number;
  brokenTotal: number;
  byKind: { image: number; link: number; 'doc-id': number };
  sourceFileCounts: Array<{ filePath: string; count: number }>;
  withCandidates: number;
  withoutCandidates: number;
}

let panel: vscode.WebviewPanel | undefined;
let isScanRunning = false;

function walkMdFiles(rootPath: string, maxDepth = 8): string[] {
  const files: string[] = [];
  if (!fs.existsSync(rootPath)) {
    return files;
  }
  function walk(dir: string, depth: number): void {
    if (depth > maxDepth) {
      return;
    }
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) {
        continue;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
      } else if (entry.isFile() && /\.md$/i.test(entry.name)) {
        files.push(full);
      }
    }
  }
  walk(rootPath, 0);
  return files;
}

function walkAllFiles(rootPath: string, maxDepth = 8): string[] {
  const files: string[] = [];
  if (!fs.existsSync(rootPath)) {
    return files;
  }
  function walk(dir: string, depth: number): void {
    if (depth > maxDepth) {
      return;
    }
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) {
        continue;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
      } else if (entry.isFile()) {
        files.push(full);
      }
    }
  }
  walk(rootPath, 0);
  return files;
}

function lineFromOffset(content: string, offset: number): number {
  return content.slice(0, offset).split('\n').length;
}

function normalizeTarget(raw: string): string {
  const trimmed = raw.trim().replace(/^<|>$/g, '');
  const q = trimmed.indexOf('?');
  const h = trimmed.indexOf('#');
  let end = trimmed.length;
  if (q >= 0) { end = Math.min(end, q); }
  if (h >= 0) { end = Math.min(end, h); }
  const noFrag = trimmed.slice(0, end);
  try { return decodeURI(noFrag); } catch { return noFrag; }
}

function isExternalTarget(target: string): boolean {
  const t = target.toLowerCase();
  return t.startsWith('http://') || t.startsWith('https://') || t.startsWith('mailto:') || t.startsWith('tel:') || t.startsWith('#');
}

function parseRefs(content: string): Array<{ kind: 'image' | 'link'; target: string; line: number }> {
  const refs: Array<{ kind: 'image' | 'link'; target: string; line: number }> = [];
  const re = /(!?)\[[^\]]*\]\(([^)\n]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    const target = normalizeTarget(match[2]);
    if (!target || isExternalTarget(target)) {
      continue;
    }
    refs.push({
      kind: match[1] === '!' ? 'image' : 'link',
      target,
      line: lineFromOffset(content, match.index)
    });
  }
  return refs;
}

function fileNameCandidates(targetPath: string, files: string[]): string[] {
  const name = path.basename(targetPath).toLowerCase();
  if (!name) {
    return [];
  }
  return files.filter((f) => path.basename(f).toLowerCase() === name).slice(0, 5);
}

function esc(text: string): string {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function reduceGoal(total: number): number {
  if (total <= 0) {
    return 0;
  }
  if (total >= 100) {
    return 10;
  }
  if (total >= 25) {
    return 5;
  }
  return 0;
}

function buildProjectActionItems(rollup: ProjectRollup): string[] {
  const items: string[] = [];
  if (rollup.brokenTotal === 0) {
    items.push('No action needed. Keep links stable and re-run before publishing.');
    return items;
  }
  if (rollup.byKind.link > 0) {
    items.push(`Fix ${rollup.byKind.link} markdown link target(s): update moved/renamed relative paths first.`);
  }
  if (rollup.byKind.image > 0) {
    items.push(`Fix ${rollup.byKind.image} image reference(s): confirm image file exists and path casing matches.`);
  }
  if (rollup.byKind['doc-id'] > 0) {
    items.push(`Replace ${rollup.byKind['doc-id']} /doc/... reference(s) with concrete relative markdown paths.`);
  }
  if (rollup.withCandidates > 0) {
    items.push(`${rollup.withCandidates} issue(s) already have candidate target files. Resolve these first for fastest reduction.`);
  }
  if (rollup.withoutCandidates > 0) {
    items.push(`${rollup.withoutCandidates} issue(s) have no candidates. Create missing files or remove stale references.`);
  }
  const topFiles = rollup.sourceFileCounts.slice(0, 3);
  if (topFiles.length > 0) {
    items.push(`Start with top source file(s): ${topFiles.map((f) => `${path.basename(f.filePath)} (${f.count})`).join(', ')}.`);
  }
  return items;
}

function buildRollups(
  findings: Finding[],
  projectRoots: Array<{ projectName: string; rootPath: string }>,
  mdByProject: Map<string, string[]>
): ProjectRollup[] {
  const findingsByProject = new Map<string, Finding[]>();
  for (const finding of findings) {
    const bucket = findingsByProject.get(finding.projectName);
    if (bucket) {
      bucket.push(finding);
    } else {
      findingsByProject.set(finding.projectName, [finding]);
    }
  }

  return projectRoots.map((proj) => {
    const items = findingsByProject.get(proj.projectName) ?? [];
    const byKind: { image: number; link: number; 'doc-id': number } = { image: 0, link: 0, 'doc-id': 0 };
    const sourceCounts = new Map<string, number>();
    let withCandidates = 0;
    let withoutCandidates = 0;
    for (const item of items) {
      byKind[item.kind] += 1;
      sourceCounts.set(item.filePath, (sourceCounts.get(item.filePath) ?? 0) + 1);
      if (item.candidates.length > 0) {
        withCandidates += 1;
      } else {
        withoutCandidates += 1;
      }
    }
    const sourceFileCounts = [...sourceCounts.entries()]
      .map(([filePath, count]) => ({ filePath, count }))
      .sort((a, b) => b.count - a.count);
    return {
      projectName: proj.projectName,
      rootPath: proj.rootPath,
      docsScanned: (mdByProject.get(proj.projectName) ?? []).length,
      brokenTotal: items.length,
      byKind,
      sourceFileCounts,
      withCandidates,
      withoutCandidates
    };
  });
}

function buildViewerHtml(findings: Finding[], totalDocsScanned: number, rollups: ProjectRollup[]): string {
  const groups = new Map<string, Finding[]>();
  for (const finding of findings) {
    const arr = groups.get(finding.projectName);
    if (arr) {
      arr.push(finding);
    } else {
      groups.set(finding.projectName, [finding]);
    }
  }

  const sections = [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([projectName, items]) => {
      const rows = items.map((item, idx) => {
        const kindClass = item.kind === 'image' ? 'kind-image' : item.kind === 'link' ? 'kind-link' : 'kind-docid';
        const candidates = item.candidates.length
          ? item.candidates.map((cand, cidx) => `<button class="cand" data-path="${esc(cand)}" data-id="${projectName}-${idx}-${cidx}">${esc(cand)}</button>`).join('')
          : '<span class="none">No candidates found</span>';
        return `<tr>
  <td><button class="src" data-path="${esc(item.filePath)}">${esc(path.basename(item.filePath))}:${item.line}</button></td>
  <td><span class="kind ${kindClass}">${esc(item.kind)}</span></td>
  <td><code>${esc(item.target)}</code></td>
  <td class="cands">${candidates}</td>
</tr>`;
      }).join('');

      return `<section class="project">
  <h2>${esc(projectName)} <span>${items.length}</span></h2>
  <table>
    <thead>
      <tr><th>Source</th><th>Type</th><th>Missing Target</th><th>Candidates (click to open)</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</section>`;
    }).join('');

  const pass1Rows = rollups
    .slice()
    .sort((a, b) => b.brokenTotal - a.brokenTotal)
    .map((r) => `<tr>
  <td>${esc(r.projectName)}</td>
  <td>${r.docsScanned}</td>
  <td>${r.brokenTotal}</td>
  <td>${r.byKind.link}</td>
  <td>${r.byKind.image}</td>
  <td>${r.byKind['doc-id']}</td>
</tr>`).join('');

  const topProjects = rollups
    .slice()
    .sort((a, b) => b.brokenTotal - a.brokenTotal)
    .filter((r) => r.brokenTotal > 0)
    .slice(0, 5);

  const pass2Rows = topProjects.map((r) => {
    const firstFiles = r.sourceFileCounts.slice(0, 5)
      .map((f) => `${esc(path.basename(f.filePath))} (${f.count})`)
      .join(', ');
    return `<tr>
  <td>${esc(r.projectName)}</td>
  <td>${r.brokenTotal}</td>
  <td>${r.withCandidates}</td>
  <td>${r.withoutCandidates}</td>
  <td>${firstFiles || '-'}</td>
</tr>`;
  }).join('');

  const pass3Sections = rollups
    .slice()
    .sort((a, b) => b.brokenTotal - a.brokenTotal)
    .map((r) => {
      const actions = buildProjectActionItems(r).map((a) => `<li>${esc(a)}</li>`).join('');
      const goal = reduceGoal(r.brokenTotal);
      const goalText = r.brokenTotal === 0
        ? 'PASS now: keep at 0.'
        : goal === 0
          ? 'Required for next audit pass: fix all remaining references to 0.'
          : `Required for next audit pass: reduce to <= ${goal}, then clear to 0.`;
      return `<section class="plan">
  <h3>${esc(r.projectName)} - ${r.brokenTotal} issue(s)</h3>
  <p class="goal">${esc(goalText)}</p>
  <ul>${actions}</ul>
</section>`;
    }).join('');

  return `<!doctype html><html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';"><style>
body{font-family:var(--vscode-font-family);color:var(--vscode-editor-foreground);background:var(--vscode-editor-background);margin:16px}
h1{margin:0 0 8px 0;font-size:20px}
.meta{color:var(--vscode-descriptionForeground);margin-bottom:16px}
h2.pass{margin:16px 0 8px 0;font-size:15px}
.pass-panel{border:1px solid var(--vscode-panel-border);border-radius:8px;padding:10px 12px;margin-bottom:12px}
.pass-panel p{margin:0 0 8px 0;color:var(--vscode-descriptionForeground)}
.plan{border:1px solid var(--vscode-panel-border);border-radius:6px;padding:8px 10px;margin:8px 0}
.plan h3{margin:0 0 4px 0;font-size:13px}
.plan .goal{margin:0 0 6px 0;color:var(--vscode-descriptionForeground)}
.plan ul{margin:0;padding-left:18px}
.plan li{margin:0 0 3px 0}
section.project{border:1px solid var(--vscode-panel-border);border-radius:8px;margin:0 0 14px 0;overflow:hidden}
section.project h2{margin:0;padding:10px 12px;background:var(--vscode-sideBar-background);font-size:14px;display:flex;justify-content:space-between}
table{width:100%;border-collapse:collapse}
th,td{border-top:1px solid var(--vscode-panel-border);padding:8px;vertical-align:top;text-align:left}
th{font-size:12px;color:var(--vscode-descriptionForeground)}
.kind{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600}
.kind-image{background:#3b1f1f;color:#ffb3b3}
.kind-link{background:#1b2d4a;color:#b5d6ff}
.kind-docid{background:#3a2f14;color:#ffdf8a}
button.src,button.cand{display:block;background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:1px solid var(--vscode-panel-border);border-radius:4px;padding:4px 7px;cursor:pointer;margin-bottom:4px;text-align:left}
button.src:hover,button.cand:hover{background:var(--vscode-button-secondaryHoverBackground);border-color:var(--vscode-focusBorder)}
td.cands{min-width:320px}
code{font-family:var(--vscode-editor-font-family)}
.none{color:var(--vscode-descriptionForeground)}
</style></head><body>
<h1>Broken References</h1>
<div class="meta">Scanned docs: ${totalDocsScanned} | Broken references: ${findings.length}</div>

<h2 class="pass">Pass 1 - Discovery (What and Where)</h2>
<div class="pass-panel">
  <p>Inventory for every CVT-known folder/project in the registry.</p>
  <table>
    <thead>
      <tr><th>Project</th><th>Docs Scanned</th><th>Broken</th><th>Links</th><th>Images</th><th>Doc IDs</th></tr>
    </thead>
    <tbody>${pass1Rows}</tbody>
  </table>
</div>

<h2 class="pass">Pass 2 - Prioritization (How to Reach Next Audit Faster)</h2>
<div class="pass-panel">
  <p>Focus first on projects and files with the highest impact and easiest candidate-based fixes.</p>
  <table>
    <thead>
      <tr><th>Project</th><th>Broken</th><th>With Candidates</th><th>Without Candidates</th><th>Top Source Files</th></tr>
    </thead>
    <tbody>${pass2Rows || '<tr><td colspan="5">No issues to prioritize.</td></tr>'}</tbody>
  </table>
</div>

<h2 class="pass">Pass 3 - Remediation Checklist (What Must Be Done to Pass Next Audit)</h2>
<div class="pass-panel">
  ${pass3Sections}
</div>

<h2 class="pass">Detailed Findings</h2>
${sections || '<p>No broken references found.</p>'}
<script>
const vscode = acquireVsCodeApi();
document.querySelectorAll('button.src').forEach((btn)=>btn.addEventListener('click',()=>vscode.postMessage({type:'open',path:btn.dataset.path})));
document.querySelectorAll('button.cand').forEach((btn)=>btn.addEventListener('click',()=>vscode.postMessage({type:'open',path:btn.dataset.path})));
</script>
</body></html>`;
}

async function scanBrokenRefs(): Promise<void> {
  if (isScanRunning) {
    vscode.window.showInformationMessage('Broken reference scan is already running.');
    return;
  }

  isScanRunning = true;

  try {
  const registry = loadRegistry();
  if (!registry) {
    return;
  }

  const projectRoots: Array<{ projectName: string; rootPath: string }> = [
    { projectName: 'global', rootPath: registry.globalDocsPath },
    ...registry.projects.map((p) => ({ projectName: p.name, rootPath: p.path }))
  ];

  log('scan-broken-refs', `Scanning ${projectRoots.length} project root(s) for broken references...`);

  const mdByProject = new Map<string, string[]>();
  const filesByProject = new Map<string, string[]>();
  const allFiles: string[] = [];

  for (const proj of projectRoots) {
    const md = walkMdFiles(proj.rootPath);
    const files = walkAllFiles(proj.rootPath);
    mdByProject.set(proj.projectName, md);
    filesByProject.set(proj.projectName, files);
    allFiles.push(...files);
  }

  const findings: Finding[] = [];
  let totalDocsScanned = 0;

  for (const proj of projectRoots) {
    const docs = mdByProject.get(proj.projectName) ?? [];
    totalDocsScanned += docs.length;
    const projectFiles = filesByProject.get(proj.projectName) ?? [];

    for (const docPath of docs) {
      let content: string;
      try {
        content = fs.readFileSync(docPath, 'utf8');
      } catch {
        continue;
      }

      for (const ref of parseRefs(content)) {
        if (ref.target.startsWith('/doc/')) {
          findings.push({
            projectName: proj.projectName,
            filePath: docPath,
            line: ref.line,
            kind: 'doc-id',
            target: ref.target,
            candidates: []
          });
          continue;
        }

        const resolved = path.resolve(path.dirname(docPath), ref.target);
        if (fs.existsSync(resolved)) {
          continue;
        }

        const localCandidates = fileNameCandidates(resolved, projectFiles);
        const candidates = localCandidates.length ? localCandidates : fileNameCandidates(resolved, allFiles);

        findings.push({
          projectName: proj.projectName,
          filePath: docPath,
          line: ref.line,
          kind: ref.kind,
          target: ref.target,
          candidates
        });
      }
    }
  }

  const rollups = buildRollups(findings, projectRoots, mdByProject);
  log('scan-broken-refs', `Scanned ${totalDocsScanned} markdown file(s) across ${projectRoots.length} project(s).`);
  log('scan-broken-refs', `Found ${findings.length} broken reference(s). Results are shown in the Broken References panel.`);
  for (const rollup of rollups.slice().sort((a, b) => b.brokenTotal - a.brokenTotal)) {
    if (rollup.brokenTotal > 0) {
      log('scan-broken-refs', `  ${rollup.projectName}: ${rollup.brokenTotal} broken reference(s)`);
    }
  }

  if (!panel) {
    panel = vscode.window.createWebviewPanel('brokenRefs', 'Broken References', vscode.ViewColumn.One, {
      enableScripts: true,
      retainContextWhenHidden: true
    });
    panel.onDidDispose(() => { panel = undefined; });
    panel.webview.onDidReceiveMessage(async (msg) => {
      if (msg?.type !== 'open' || !msg.path) {
        return;
      }
      const target = String(msg.path);
      if (!fs.existsSync(target)) {
        vscode.window.showWarningMessage(`Path does not exist: ${target}`);
        return;
      }
      const stat = fs.statSync(target);
      if (stat.isDirectory()) {
        await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(target), false);
      } else {
        const doc = await vscode.workspace.openTextDocument(target);
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
      }
    });
  }

  panel.webview.html = buildViewerHtml(findings, totalDocsScanned, rollups);
  panel.reveal(vscode.ViewColumn.One);

  if (findings.length === 0) {
    vscode.window.showInformationMessage('Broken reference scan complete: no issues found.');
  } else {
    vscode.window.showWarningMessage(`Broken reference scan complete: ${findings.length} issue(s) found.`);
  }
  } finally {
    isScanRunning = false;
  }
}

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('cvs.docs.scanBrokenRefs', scanBrokenRefs)
  );
}

export function deactivate(): void {
  // no-op
}
