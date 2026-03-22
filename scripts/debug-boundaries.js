const fs = require('fs');
const raw = fs.readFileSync('C:\\Users\\jwpmi\\Downloads\\VSCode\\projects\\cielovista-tools\\src\\features\\cvs-command-launcher\\html.ts', 'utf8');
const lines = raw.split('\n');

// Show lines 269-278
for (let i = 268; i <= 278; i++) {
    console.log(`Line ${i+1}: ${JSON.stringify(lines[i])}`);
}

// Check the done handler
const doneIdx = raw.indexOf("msg.type === 'done'");
console.log('\nDone handler context:');
console.log(JSON.stringify(raw.slice(doneIdx - 50, doneIdx + 150)));
