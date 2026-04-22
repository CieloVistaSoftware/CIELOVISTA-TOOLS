// scripts/copy-commandhelp.js
// Copies src/features/CommandHelp to out/features/CommandHelp for npm-based builds

const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '../src/features/CommandHelp');
const dest = path.join(__dirname, '../out/features/CommandHelp');

// Copy static HTML files that TypeScript doesn't touch
const staticFiles = [
    ['src/features/doc-catalog/catalog.html', 'out/features/doc-catalog/catalog.html'],
];
for (const [rel, dest] of staticFiles) {
    const s = path.join(__dirname, '..', rel);
    const d = path.join(__dirname, '..', dest);
    if (fs.existsSync(s)) {
        if (!fs.existsSync(path.dirname(d))) { fs.mkdirSync(path.dirname(d), { recursive: true }); }
        fs.copyFileSync(s, d);
        console.log('Copied', rel);
    } else {
        console.warn('WARNING: missing static file:', rel);
    }
}

function copyDir(srcDir, destDir) {
    if (!fs.existsSync(srcDir)) return;
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
        const srcPath = path.join(srcDir, entry.name);
        const destPath = path.join(destDir, entry.name);
        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

copyDir(src, dest);
