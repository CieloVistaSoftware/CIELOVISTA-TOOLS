"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.showConsolidationPlanWebview = showConsolidationPlanWebview;
const vscode = __importStar(require("vscode"));
/**
 * Opens a webview to preview and confirm a consolidation plan.
 * Allows user to check/uncheck actions and view diffs before running.
 * @param plan Array of ConsolidationAction
 * @param onRun Callback to execute with the filtered plan
 */
function showConsolidationPlanWebview(plan, onRun) {
    const panel = vscode.window.createWebviewPanel('consolidationPlan', 'Consolidation Plan Preview', vscode.ViewColumn.Beside, { enableScripts: true });
    // Helper to escape HTML
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // Render plan as HTML table with checkboxes and diff buttons
    const rows = plan.map((action, idx) => {
        let desc = '';
        if (action.type === 'keep')
            desc = `<b>KEEP</b> <code>${esc(action.filePath)}</code> <span style="color:#888">${esc(action.details || '')}</span>`;
        if (action.type === 'delete')
            desc = `<b>DELETE</b> <code>${esc(action.filePath)}</code>`;
        if (action.type === 'update-ref')
            desc = `<b>UPDATE REF</b> <code>${esc(action.filePath)}</code> <span style="color:#888">${esc(action.details || '')}</span>`;
        return `<tr>
      <td><input type="checkbox" id="cb${idx}" ${action.checked !== false ? 'checked' : ''}></td>
      <td>${desc}</td>
      <td>${(action.oldContent || action.newContent) ? `<button data-diff="${idx}">Diff</button>` : ''}</td>
    </tr>`;
    }).join('');
    panel.webview.html = `
    <html>
      <head>
        <style>
          body { font-family: sans-serif; margin: 2em; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #ddd; padding: 8px; }
          th { background: #f6f8fa; }
          button { padding: 2px 10px; }
          .diff-modal { display:none; position:fixed; top:10%; left:10%; width:80%; height:70%; background:#fff; border:2px solid #888; z-index:10; overflow:auto; }
          .diff-modal pre { white-space:pre-wrap; font-size:13px; }
          .diff-modal .close { float:right; cursor:pointer; font-size:18px; }
        </style>
      </head>
      <body>
        <h2>Consolidation Plan Preview</h2>
        <form id="planForm">
        <table>
          <tr><th></th><th>Action</th><th>Diff</th></tr>
          ${rows}
        </table>
        <br>
        <button id="runBtn" type="submit">Run Checked Actions</button>
        </form>
        <div id="diffModal" class="diff-modal">
          <span class="close" onclick="document.getElementById('diffModal').style.display='none'">&times;</span>
          <pre id="diffContent"></pre>
        </div>
        <script>
          const vscode = acquireVsCodeApi();
          document.querySelectorAll('button[data-diff]').forEach(btn => {
            btn.onclick = e => {
              const idx = btn.getAttribute('data-diff');
              vscode.postMessage({ type: 'diff', idx });
            };
          });
          document.getElementById('planForm').onsubmit = e => {
            e.preventDefault();
            const checked = Array.from(document.querySelectorAll('input[type=checkbox]')).map(cb => cb.checked);
            vscode.postMessage({ type: 'run', checked });
          };
          window.addEventListener('message', event => {
            if (event.data.type === 'showDiff') {
              document.getElementById('diffContent').textContent = event.data.diff;
              document.getElementById('diffModal').style.display = 'block';
            }
          });
        </script>
      </body>
    </html>
  `;
    // Handle messages from webview
    panel.webview.onDidReceiveMessage(async (msg) => {
        if (msg.type === 'diff') {
            const action = plan[Number(msg.idx)];
            let diff = '';
            if (action.oldContent !== undefined && action.newContent !== undefined) {
                diff = await getSimpleDiff(action.oldContent, action.newContent);
            }
            else if (action.oldContent !== undefined) {
                diff = action.oldContent;
            }
            else if (action.newContent !== undefined) {
                diff = action.newContent;
            }
            panel.webview.postMessage({ type: 'showDiff', diff });
        }
        if (msg.type === 'run') {
            const checkedPlan = plan.filter((_, i) => msg.checked[i]);
            onRun(checkedPlan);
            panel.dispose();
        }
    });
}
// Simple line-by-line diff (for demo; replace with better diff if needed)
async function getSimpleDiff(a, b) {
    const aLines = a.split('\n');
    const bLines = b.split('\n');
    let diff = '';
    for (let i = 0; i < Math.max(aLines.length, bLines.length); i++) {
        if (aLines[i] !== bLines[i]) {
            diff += `- ${aLines[i] || ''}\n+ ${bLines[i] || ''}\n`;
        }
        else {
            diff += `  ${aLines[i] || ''}\n`;
        }
    }
    return diff;
}
//# sourceMappingURL=consolidation-plan-webview.js.map