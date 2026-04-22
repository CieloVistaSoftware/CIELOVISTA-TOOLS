const fs = require('fs');
const path = require('path');

function walk(dir) {
    const results = [];
    for (const f of fs.readdirSync(dir, {withFileTypes: true})) {
        if (f.name === 'node_modules' || f.name === 'out' || f.name === '.git') continue;
        const full = path.join(dir, f.name);
        if (f.isDirectory()) results.push(...walk(full));
        else if (/\.(ts|html|js|json|md)$/.test(f.name)) results.push(full);
    }
    return results;
}

const root = 'C:\\Users\\jwpmi\\Downloads\\VSCode\\projects\\cielovista-tools';
const files = walk(root);
const hits = [];

for (const f of files) {
    try {
        const lines = fs.readFileSync(f, 'utf8').split('\n');
        lines.forEach((line, i) => {
            if (/wb.?demo/i.test(line)) {
                hits.push(`${f.replace(root, '')}:${i+1}: ${line.trim()}`);
            }
        });
    } catch {}
}

console.log(`\nSearching for wb-demo / wbdemo across ${files.length} files:\n`);
if (hits.length === 0) console.log('(no matches found)');
else hits.forEach(h => console.log(h));
