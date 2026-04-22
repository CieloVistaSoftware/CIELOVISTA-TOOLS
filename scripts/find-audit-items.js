const {execSync} = require('child_process');
const fs = require('fs');
const path = require('path');

function walk(dir) {
    const results = [];
    for (const f of fs.readdirSync(dir, {withFileTypes: true})) {
        if (f.name === 'node_modules') continue;
        const full = path.join(dir, f.name);
        if (f.isDirectory()) results.push(...walk(full));
        else if (/\.(ts|html)$/.test(f.name)) results.push(full);
    }
    return results;
}

const files = walk('C:\\Users\\jwpmi\\Downloads\\VSCode\\projects\\cielovista-tools\\src');
const alertMatches = [];
const inlineMatches = [];

for (const f of files) {
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    lines.forEach((line, i) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//')) return;
        if (/\balert\(/.test(line)) alertMatches.push(`${f}:${i+1}: ${trimmed}`);
        if (/\b(oninput|onclick|onchange|onsubmit|onfocus|onblur)\s*=/.test(line)) {
            inlineMatches.push(`${f}:${i+1}: ${trimmed}`);
        }
    });
}

console.log('\n=== alert() calls ===');
if (alertMatches.length) alertMatches.forEach(m => console.log(m));
else console.log('(none found)');

console.log('\n=== Inline event handlers (oninput/onclick/etc) ===');
if (inlineMatches.length) inlineMatches.forEach(m => console.log(m));
else console.log('(none found)');
