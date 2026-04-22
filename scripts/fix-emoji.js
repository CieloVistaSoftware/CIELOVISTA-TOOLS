const fs = require('fs');
let c = fs.readFileSync('src/features/cvs-command-launcher/index.ts', 'utf8');
// The backtick-chat line has unescaped ``` inside the template literal — escape them
const bad  = "  var text = '**' + ${JSON.stringify(title)} + '**\\\\n\\\\n```\\\\n' + getOutputText() + '\\\\n```';";
const good = "  var text = '**' + ${JSON.stringify(title)} + '**\\\\n\\\\n\\`\\`\\`\\\\n' + getOutputText() + '\\\\n\\`\\`\\`';";
if (c.includes(bad)) {
    c = c.replace(bad, good);
    fs.writeFileSync('src/features/cvs-command-launcher/index.ts', c, 'utf8');
    console.log('Fixed backticks');
} else {
    // Try to find and show the actual line
    const lines = c.split('\n');
    const idx = lines.findIndex(l => l.includes('var text') && l.includes('JSON.stringify'));
    console.log('NOT FOUND. Actual line:', JSON.stringify(lines[idx]));
}
