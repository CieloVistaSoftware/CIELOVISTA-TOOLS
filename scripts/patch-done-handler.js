const fs = require('fs');
const file = 'C:\\Users\\jwpmi\\Downloads\\VSCode\\projects\\cielovista-tools\\src\\features\\cvs-command-launcher\\html.ts';
let src = fs.readFileSync(file, 'utf8');

// Find and replace the done/error handler block
const OLD = `  if (msg.type === 'done')  { runStatusTxt.textContent = '\\\\u2705 Done:';  runStatusCmd.textContent = msg.title || '';   setTimeout(function() { runStatus.classList.remove('visible'); }, 2000); }
  if (msg.type === 'error') { runStatusTxt.textContent = '\\\\u274c Failed:'; runStatusCmd.textContent = msg.message || msg.title || ''; setTimeout(function() { runStatus.classList.remove('visible'); }, 4000); }`;

const NEW = `  if (msg.type === 'done') {
    runStatusTxt.textContent = '\\\\u2705 Done:';
    runStatusCmd.textContent = msg.title || '';
    var existingNext = document.getElementById('run-status-next');
    if (existingNext) { existingNext.remove(); }
    var nextEntry = msg.nextAction ? CATALOG.find(function(c) { return c.id === msg.nextAction; }) : null;
    if (nextEntry) {
      var nb = document.createElement('button');
      nb.id = 'run-status-next';
      nb.textContent = nextEntry.title + ' \\\\u2192';
      nb.style.cssText = 'margin-left:auto;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;padding:3px 12px;border-radius:3px;cursor:pointer;font-size:11px;font-weight:600;white-space:nowrap';
      nb.addEventListener('click', function() {
        runStatus.classList.remove('visible');
        nb.remove();
        vscode.postMessage({ command: 'run', id: msg.nextAction });
      });
      runStatus.appendChild(nb);
    }
    setTimeout(function() {
      runStatus.classList.remove('visible');
      var b = document.getElementById('run-status-next'); if (b) { b.remove(); }
    }, nextEntry ? 8000 : 2500);
  }
  if (msg.type === 'error') {
    runStatusTxt.textContent = '\\\\u274c Failed:';
    runStatusCmd.textContent = msg.message || msg.title || '';
    var eb = document.getElementById('run-status-next'); if (eb) { eb.remove(); }
    setTimeout(function() { runStatus.classList.remove('visible'); }, 4000);
  }`;

// The actual strings in the file use single-backslash \u sequences inside template literals
// Search for the pattern directly
const searchFor = "if (msg.type === 'done')  { runStatusTxt";
const idx = src.indexOf(searchFor);
if (idx === -1) { console.error('NOT FOUND'); process.exit(1); }

// Find the end of the two-line block
const lineEnd = src.indexOf('\n', src.indexOf('\n', idx) + 1);
const block = src.slice(idx, lineEnd + 1);
console.log('Found block:');
console.log(JSON.stringify(block));
