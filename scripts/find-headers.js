const fs = require('fs');
// The one doc walk and skip list (#812): never a worktree copy under .claude/ or a build output.
const { walkDocTree } = require('./lib/doc-walk');

function walk(dir) {
    return walkDocTree(dir, { maxDepth: Infinity, match: (name) => /\.(ts|html|js|json|md)$/.test(name) });
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
