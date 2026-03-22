/**
 * install.js
 * Installs the packaged VSIX into VS Code Insiders or VS Code.
 * Tries multiple candidate paths in order until one works.
 * Copyright (c) 2025 CieloVista Software. All rights reserved.
 */
const cp   = require('child_process');
const fs   = require('fs');
const pkg  = require('./package.json');
const vsix = `${pkg.name}-${pkg.version}.vsix`;

if (!fs.existsSync(vsix)) {
    console.error(`VSIX not found: ${vsix}`);
    process.exit(1);
}

const candidates = [
    // PATH-based (works if VS Code CLI is on PATH)
    'code-insiders',
    'code',
    // Insiders — standard user install
    'C:\\Users\\jwpmi\\AppData\\Local\\Programs\\Microsoft VS Code Insiders\\bin\\code-insiders.cmd',
    // Stable — standard user install
    'C:\\Users\\jwpmi\\AppData\\Local\\Programs\\Microsoft VS Code\\bin\\code.cmd',
    // System-wide installs
    'C:\\Program Files\\Microsoft VS Code Insiders\\bin\\code-insiders.cmd',
    'C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd',
];

let installed = false;
for (const code of candidates) {
    try {
        cp.execSync(`"${code}" --install-extension "${vsix}"`, { stdio: ['ignore', 'inherit', 'ignore'], shell: true });
        installed = true;
        break;
    } catch {
        // try next candidate
    }
}

if (!installed) {
    // Last resort: use the VS Code Insiders executable directly with --install-extension
    // This works even when the CLI wrapper isn't on PATH
    const exePaths = [
        'C:\\Users\\jwpmi\\AppData\\Local\\Programs\\Microsoft VS Code Insiders\\Code - Insiders.exe',
        'C:\\Users\\jwpmi\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe',
        'C:\\Program Files\\Microsoft VS Code Insiders\\Code - Insiders.exe',
        'C:\\Program Files\\Microsoft VS Code\\Code.exe',
    ];
    for (const exe of exePaths) {
        if (fs.existsSync(exe)) {
            try {
                cp.execSync(`"${exe}" --install-extension "${vsix}"`, { stdio: 'inherit', shell: true });
                installed = true;
                break;
            } catch {
                // try next
            }
        }
    }
}

if (!installed) {
    console.error('Could not find VS Code CLI. Install manually:');
    console.error(`  code --install-extension ${vsix}`);
    process.exit(1);
}
