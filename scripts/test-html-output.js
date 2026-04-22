'use strict';
// Directly extract + render the JS/CSS templates from the TypeScript source
// without needing the compiled vscode-dependent module

const fs   = require('fs');
const path = require('path');

const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'features', 'doc-catalog', 'commands.ts'),
    'utf8'
);

// ── Extract buildViewDocHtml's JS and CSS template literals ────────────────
function extractTemplateLiteral(source, varName) {
    const marker = `const ${varName} = \``;
    const start  = source.indexOf(marker);
    if (start === -1) return null;
    let i = start + marker.length;
    let content = '';
    while (i < source.length) {
        const c = source[i];
        if (c === '`') break;
        if (c === '\\' && source[i+1] === '`') { content += '`'; i += 2; continue; }
        content += c;
        i++;
    }
    return content;
}

// There are two CSS and two JS templates (one in buildCatalogHtml, one in buildViewDocHtml)
// We need the one inside buildViewDocHtml — find the SECOND occurrence
function extractSecondTemplateLiteral(source, varName) {
    const marker = `const ${varName} = \``;
    const first  = source.indexOf(marker);
    if (first === -1) return null;
    const second = source.indexOf(marker, first + marker.length);
    if (second === -1) return extractTemplateLiteral(source, varName); // only one

    let i = second + marker.length;
    let content = '';
    while (i < source.length) {
        const c = source[i];
        if (c === '`') break;
        if (c === '\\' && source[i+1] === '`') { content += '`'; i += 2; continue; }
        content += c;
        i++;
    }
    return content;
}

// Find which is in buildViewDocHtml (look for it after the function declaration)
const viewDocFnStart = src.indexOf('function buildViewDocHtml(');
if (viewDocFnStart === -1) { console.error('Cannot find buildViewDocHtml'); process.exit(1); }

const srcAfterFn = src.slice(viewDocFnStart);

function extractFromScope(scope, varName) {
    const marker = `const ${varName} = \``;
    const start  = scope.indexOf(marker);
    if (start === -1) return null;
    let i = start + marker.length;
    let content = '';
    while (i < scope.length) {
        const c = scope[i];
        if (c === '`') break;
        if (c === '\\' && scope[i+1] === '`') { content += '`'; i += 2; continue; }
        content += c;
        i++;
    }
    return content;
}

const jsTemplate  = extractFromScope(srcAfterFn, 'JS');
const cssTemplate = extractFromScope(srcAfterFn, 'CSS');

if (!jsTemplate) { console.error('Cannot extract JS template'); process.exit(1); }
console.log('JS template length:', jsTemplate.length);
console.log('CSS template length:', cssTemplate ? cssTemplate.length : '(not found)');

// ── Simulate template interpolation with test values ──────────────────────
// Replace TypeScript ${...} interpolations with test values
const totalDocs     = 3;
const totalProjects = 2;

const jsRendered = jsTemplate
    .replace(/\$\{totalDocs\}/g, String(totalDocs))
    .replace(/\$\{totalProjects\}/g, String(totalProjects));

const cssRendered = (cssTemplate || '').replace(/\$\{[^}]+\}/g, '');

// ── Build stub HTML ──────────────────────────────────────────────────────
// Stub cards with tricky content
const stubLinks = [
    { title: 'ReadMe Global',        path: 'C:\\standards\\README.md',    priority: true  },
    { title: '`<aside>` Element',    path: 'C:\\wb-core\\aside.md',       priority: false },
    { title: "Valentine's Day",      path: 'C:\\wb-core\\valentines.md',  priority: false },
    { title: 'Script "test" & more', path: 'C:\\wb-core\\test.md',        priority: false },
];

function escV(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const links = stubLinks.map(l =>
    `<a class="doc-link${l.priority?' doc-link-priority':''}" href="#" data-path="${escV(l.path)}">${escV(l.title)}</a>`
).join('');

const tableRows = `<tr>
  <td class="folder-cell"><span class="dewey">000</span><span class="folder-name">global</span><span class="doc-count">1</span></td>
  <td class="links-cell">${links.slice(0, links.indexOf('</a>') + 4)}</td>
</tr>
<tr>
  <td class="folder-cell"><span class="dewey">100</span><span class="folder-name">wb-core</span><span class="doc-count">3</span></td>
  <td class="links-cell">${links.slice(links.indexOf('</a>') + 4)}</td>
</tr>`;

const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${cssRendered}</style></head><body>
<div id="toolbar">
  <h1>&#128196; View a Doc</h1>
  <input id="search" type="text" placeholder="Search docs, folders\u2026" autocomplete="off">
  <span id="stat">${totalDocs} docs across ${totalProjects} projects</span>
</div>
<div id="content">
  <table>
    <thead><tr><th>Folder</th><th>Documents</th></tr></thead>
    <tbody>${tableRows}</tbody>
  </table>
  <div id="empty">No docs match your search.</div>
</div>
<div id="copy-toast"></div>
<script>${jsRendered}</script>
</body></html>`;

// ── Check generated HTML for issues ───────────────────────────────────────
console.log('\nHTML length:', html.length);

const issues = [];

// 1. NUL bytes
if (html.includes('\0')) issues.push('CRITICAL: NUL byte in HTML');

// 2. Control chars (except tab, LF, CR)
let ctrlCount = 0;
for (let i = 0; i < html.length; i++) {
    const c = html.charCodeAt(i);
    if (c < 32 && c !== 9 && c !== 10 && c !== 13) {
        ctrlCount++;
        if (ctrlCount <= 5) issues.push('Control char 0x' + c.toString(16) + ' at pos ' + i + ': ' + JSON.stringify(html.slice(Math.max(0,i-10),i+10)));
    }
}
if (ctrlCount > 0) console.log('Control chars found:', ctrlCount);

// 3. </script> outside of script tags
const htmlWithoutScript = html.replace(/<script>[\s\S]*?<\/script>/gi, '');
if (htmlWithoutScript.includes('</script>')) {
    issues.push('</script> found OUTSIDE script tags — this would break rendering');
}

// 4. Unclosed script tag (</script> inside script tag content)
const scriptTagMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (scriptTagMatch) {
    const jsInScript = scriptTagMatch[1];
    // Check if there's a premature </script> inside the JS
    if (jsInScript.match(/<\/script\s*>/i)) {
        issues.push('CRITICAL: </script> found INSIDE script tag content — breaks HTML parser');
    }
    console.log('JS in script tag length:', jsInScript.length);

    // Try parsing as JS (basic check)
    try {
        new Function(jsInScript);
        console.log('JS syntax check: PASSED (new Function succeeded)');
    } catch(e) {
        issues.push('JS SYNTAX ERROR: ' + e.message);
        // Find approximate location
        const lineNo = e.message.match(/line (\d+)/i);
        if (lineNo) {
            const lines = jsInScript.split('\n');
            const ln = parseInt(lineNo[1]) - 1;
            console.log('Error near line', lineNo[1] + ':');
            for (let j = Math.max(0, ln-2); j <= Math.min(lines.length-1, ln+2); j++) {
                console.log('  L' + (j+1) + ': ' + lines[j]);
            }
        }
    }
} else {
    issues.push('No <script> tag found in HTML');
}

// 5. data-path attribute values
const pathMatches = [...html.matchAll(/data-path="([^"]+)"/g)];
console.log('\ndata-path values:');
pathMatches.forEach((m, i) => console.log('  [' + i + ']: ' + JSON.stringify(m[1])));

// 6. Check that title text with backticks survives
console.log('\nLink texts with special chars:');
const linkMatches = [...html.matchAll(/class="doc-link[^"]*"[^>]*>([^<]+)</g)];
linkMatches.forEach((m, i) => {
    if (/[`'"<>&]/.test(m[1])) {
        console.log('  [' + i + ']: ' + JSON.stringify(m[1]));
    }
});

// ── Final verdict ─────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(60));
if (issues.length === 0) {
    console.log('RESULT: No issues found. Template HTML looks clean.');
} else {
    console.log('RESULT: ISSUES FOUND:');
    issues.forEach((issue, i) => console.log('  [' + i + '] ' + issue));
    process.exit(1);
}
