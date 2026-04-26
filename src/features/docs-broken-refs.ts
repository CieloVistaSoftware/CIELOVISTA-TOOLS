// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { loadRegistry } from '../shared/registry';

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

let panel: vscode.WebviewPanel | undefined;

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

function buildViewerHtml(findings: Finding[], totalDocsScanned: number): string {
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

  return `<!doctype html><html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';"><style>
body{font-family:var(--vscode-font-family);color:var(--vscode-editor-foreground);background:var(--vscode-editor-background);margin:16px}
h1{margin:0 0 8px 0;font-size:20px}
.meta{color:var(--vscode-descriptionForeground);margin-bottom:16px}
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
${sections || '<p>No broken references found.</p>'}
<script>
const vscode = acquireVsCodeApi();
document.querySelectorAll('button.src').forEach((btn)=>btn.addEventListener('click',()=>vscode.postMessage({type:'open',path:btn.dataset.path})));
document.querySelectorAll('button.cand').forEach((btn)=>btn.addEventListener('click',()=>vscode.postMessage({type:'open',path:btn.dataset.path})));
</script>
</body></html>`;
}

async function scanBrokenRefs(): Promise<void> {
  const registry = loadRegistry();
  if (!registry) {
    return;
  }

  const projectRoots: Array<{ projectName: string; rootPath: string }> = [
    { projectName: 'global', rootPath: registry.globalDocsPath },
    ...registry.projects.map((p) => ({ projectName: p.name, rootPath: p.path }))
  ];

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

  panel.webview.html = buildViewerHtml(findings, totalDocsScanned);
  panel.reveal(vscode.ViewColumn.One);

  if (findings.length === 0) {
    vscode.window.showInformationMessage('Broken reference scan complete: no issues found.');
  } else {
    vscode.window.showWarningMessage(`Broken reference scan complete: ${findings.length} issue(s) found.`);
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
