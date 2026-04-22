$file = 'C:\Users\jwpmi\Downloads\VSCode\projects\cielovista-tools\src\features\doc-catalog\commands.ts'
$content = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)

$anchor = "// saveRegistry helper`n// ---------------------------------------------------------------------------"

if (-not $content.Contains($anchor)) {
    # Try with dashes search
    $idx = $content.IndexOf('saveRegistry helper')
    Write-Host "saveRegistry helper at: $idx"
    Write-Host "Chars at idx-5 to idx+60: [$($content.Substring($idx-5, 65))]"
    exit 1
}

$rebuildCode = @'
// ---------------------------------------------------------------------------
// rebuildCatalog -- force rescan, show summary webview
// ---------------------------------------------------------------------------
let _rebuildPanel: vscode.WebviewPanel | undefined;

function _rbEsc(s: string): string {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function buildRebuildSummaryHtml(
    cards: CatalogCard[],
    elapsedMs: number,
    projectCounts: Array<{ name: string; count: number; dewey: string }>,
    rebuiltAt: string
): string {
    const totalDocs     = cards.length;
    const totalProjects = projectCounts.length;
    const elapsedSec    = (elapsedMs / 1000).toFixed(2);
    const projectRows   = projectCounts.map(p =>
        `<tr><td class="rb-dw">${_rbEsc(p.dewey)}</td><td class="rb-nm">${_rbEsc(p.name)}</td><td class="rb-ct">${p.count}</td></tr>`
    ).join('');
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--vscode-font-family);font-size:13px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background);padding:20px 24px}
.rb-title{font-size:1.35em;font-weight:800;margin-bottom:4px}.rb-title span{color:var(--vscode-button-background)}
.rb-meta{font-size:11px;color:var(--vscode-descriptionForeground);margin-bottom:18px}
.rb-ok{display:flex;align-items:center;gap:8px;padding:10px 14px;background:rgba(63,185,80,0.08);border:1px solid rgba(63,185,80,0.25);border-radius:4px;margin-bottom:18px;font-size:12px;font-weight:600;color:#3fb950}
.rb-ok::before{content:"";display:inline-block;width:8px;height:8px;border-radius:50%;background:#3fb950;flex-shrink:0}
.rb-stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-bottom:18px}
.rb-stat{background:var(--vscode-textCodeBlock-background);border:1px solid var(--vscode-panel-border);border-radius:4px;padding:10px 14px}
.rb-stat-n{font-size:1.75em;font-weight:800;color:var(--vscode-button-background);line-height:1}
.rb-stat-l{font-size:11px;color:var(--vscode-descriptionForeground);margin-top:3px}
.rb-tbl{margin-bottom:18px;max-height:320px;overflow-y:auto;border:1px solid var(--vscode-panel-border);border-radius:4px}
table{width:100%;border-collapse:collapse}
thead th{position:sticky;top:0;background:var(--vscode-textCodeBlock-background);padding:6px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--vscode-descriptionForeground);border-bottom:1px solid var(--vscode-panel-border)}
tbody tr{border-bottom:1px solid var(--vscode-panel-border)}tbody tr:last-child{border-bottom:none}tbody tr:hover{background:var(--vscode-list-hoverBackground)}
.rb-dw{padding:5px 10px;font-family:monospace;font-size:9px;font-weight:700;color:var(--vscode-textLink-foreground);width:70px}
.rb-nm{padding:5px 10px;font-weight:500;font-size:12px}
.rb-ct{padding:5px 10px;text-align:right;font-family:monospace;font-size:12px;color:var(--vscode-descriptionForeground);width:55px}
.rb-btns{display:flex;gap:8px;flex-wrap:wrap}
.btn-p{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;padding:7px 18px;border-radius:3px;cursor:pointer;font-size:13px;font-weight:600}
.btn-p:hover{background:var(--vscode-button-hoverBackground)}
.btn-s{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:none;padding:7px 18px;border-radius:3px;cursor:pointer;font-size:13px;font-weight:600}
.btn-s:hover{background:var(--vscode-button-secondaryHoverBackground)}
</style></head><body>
<div class="rb-title">&#128201; Doc Catalog <span>Rebuilt</span></div>
<div class="rb-meta">Completed at ${_rbEsc(rebuiltAt)}</div>
<div class="rb-ok">Full rescan complete &mdash; catalog is up to date</div>
<div class="rb-stats">
  <div class="rb-stat"><div class="rb-stat-n">${totalDocs}</div><div class="rb-stat-l">Total docs</div></div>
  <div class="rb-stat"><div class="rb-stat-n">${totalProjects}</div><div class="rb-stat-l">Projects scanned</div></div>
  <div class="rb-stat"><div class="rb-stat-n">${elapsedSec}s</div><div class="rb-stat-l">Time to rebuild</div></div>
</div>
<div class="rb-tbl"><table>
  <thead><tr><th>Dewey</th><th>Project</th><th style="text-align:right">Docs</th></tr></thead>
  <tbody>${projectRows}</tbody>
</table></div>
<div class="rb-btns">
  <button class="btn-p" id="btn-open">&#128218; Open Doc Catalog</button>
  <button class="btn-s" id="btn-again">&#8635; Rebuild Again</button>
</div>
<script>(function(){
var vs=acquireVsCodeApi();
document.getElementById('btn-open').addEventListener('click',function(){vs.postMessage({command:'open-catalog'});});
document.getElementById('btn-again').addEventListener('click',function(){vs.postMessage({command:'rebuild-again'});});
})();</script></body></html>`;
}

export async function rebuildCatalog(): Promise<void> {
    clearCachedCards();
    const registry = loadRegistry();
    if (!registry) { vscode.window.showWarningMessage('No registry found.'); return; }

    const startMs = Date.now();
    const cards   = await buildCatalog(true);
    const elapsed = Date.now() - startMs;
    if (!cards?.length) { vscode.window.showWarningMessage('Rebuild found no docs.'); return; }

    const projectMap = new Map<string, { count: number; dewey: string }>();
    for (const card of cards) {
        const existing = projectMap.get(card.projectName);
        const dewey    = String(card.categoryNum).padStart(3, '0');
        if (existing) { existing.count++; }
        else          { projectMap.set(card.projectName, { count: 1, dewey }); }
    }
    const projectCounts = [...projectMap.entries()]
        .sort((a, b) => Number(a[1].dewey) - Number(b[1].dewey))
        .map(([name, { count, dewey }]) => ({ name, count, dewey }));

    const html  = buildRebuildSummaryHtml(cards, elapsed, projectCounts, new Date().toLocaleTimeString());
    const title = '\u{1F4CA} Catalog Rebuilt';

    if (_rebuildPanel) {
        _rebuildPanel.title        = title;
        _rebuildPanel.webview.html = html;
        _rebuildPanel.reveal(vscode.ViewColumn.Beside, true);
    } else {
        _rebuildPanel = vscode.window.createWebviewPanel(
            'catalogRebuild', title,
            { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
            { enableScripts: true, retainContextWhenHidden: false }
        );
        _rebuildPanel.webview.html = html;
        _rebuildPanel.onDidDispose(() => { _rebuildPanel = undefined; });
    }
    _rebuildPanel.webview.onDidReceiveMessage(async msg => {
        if (msg.command === 'open-catalog')  { await openCatalog(false); }
        if (msg.command === 'rebuild-again') { await rebuildCatalog(); }
    });
    log(FEATURE, `Catalog rebuilt: ${cards.length} cards in ${elapsed}ms`);
}

'@

$newContent = $content.Replace($anchor, $rebuildCode + $anchor)
if ($newContent -eq $content) { Write-Host "ERROR: replace had no effect"; exit 1 }
[System.IO.File]::WriteAllText($file, $newContent, [System.Text.Encoding]::UTF8)
Write-Host "OK. New length: $($newContent.Length) (was $($content.Length))"
