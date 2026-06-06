// REG-114: npm-scripts-tree project selector routes scripts to the correct folder
// Verifies: switchProject handler, collectEntries explicit root param, run cwd, registry loading, HTML picker
'use strict';
const fs   = require('fs');
const path = require('path');

const root    = path.join(__dirname, '../../');
const tsSrc   = fs.readFileSync(path.join(root, 'src/features/npm-scripts-tree.ts'), 'utf8');
const htmlSrc = fs.readFileSync(path.join(root, 'src/features/npm-scripts-tree.html'), 'utf8');

let passed = 0; let failed = 0;
function check(desc, ok) {
    if (ok) { console.log(`  PASS ${desc}`); passed++; }
    else     { console.error(`  FAIL ${desc}`); failed++; }
}

// 1. switchProject message type is handled
check(
    "TS handles 'switchProject' message type",
    tsSrc.includes("case 'switchProject':")
);

// 2. switchProject handler calls collectEntries with msg.projectPath
check(
    'switchProject handler calls collectEntries(msg.projectPath)',
    /case 'switchProject'[\s\S]{0,200}collectEntries\(msg\.projectPath\)/.test(tsSrc)
);

// 3. collectEntries accepts an explicit root parameter
check(
    'collectEntries signature accepts explicitRoot parameter',
    /async function collectEntries\s*\(\s*explicitRoot\s*\?/.test(tsSrc)
);

// 4. collectEntries uses explicitRoot when provided (not only workspaceFolders)
check(
    'collectEntries uses explicitRoot ?? workspace fallback',
    tsSrc.includes('explicitRoot ??')
);

// 5. run handler uses msg.dir as terminal cwd
check(
    "run handler sets terminal cwd to msg.dir",
    /case 'run'[\s\S]{0,800}cwd:\s*msg\.dir/.test(tsSrc)
);

// 6. Registered projects loaded via loadRegistry
check(
    'loadRegistry is imported and called in getRegisteredProjects',
    tsSrc.includes("import { loadRegistry }") && tsSrc.includes('loadRegistry()')
);

// 7. getRegisteredProjects result is sent to webview in ready/refresh handlers
check(
    'init message includes projects from getRegisteredProjects()',
    /getRegisteredProjects\(\)[\s\S]{0,100}projects/.test(tsSrc)
);

// 8. HTML has a project-picker select element
check(
    'HTML has <select id="project-picker">',
    htmlSrc.includes('id="project-picker"') && /<select[^>]+id="project-picker"/.test(htmlSrc)
);

// 9. Picker posts switchProject message on change
check(
    "HTML picker posts { type: 'switchProject', projectPath: picker.value } on change",
    htmlSrc.includes("type: 'switchProject'") &&
    htmlSrc.includes('picker.value') &&
    /picker\.addEventListener\s*\(\s*'change'/.test(htmlSrc)
);

// 10. switchProject uses msg.projectPath (not a fallback/hardcoded path) as the explicit root
check(
    'switchProject passes msg.projectPath directly to collectEntries — no workspace fallback',
    /case 'switchProject':[\s\S]{0,300}collectEntries\(msg\.projectPath\)/.test(tsSrc) &&
    !/case 'switchProject':[\s\S]{0,300}workspaceFolders/.test(tsSrc)
);

console.log(`\nREG-114: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
