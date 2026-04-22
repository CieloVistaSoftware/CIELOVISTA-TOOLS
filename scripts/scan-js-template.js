'use strict';
const fs = require('fs');
const src = fs.readFileSync('src/features/doc-catalog/commands.ts', 'utf8');

// Find the JS template literal (const JS = ` ... `;)
const jsStart = src.indexOf('const JS = `');
if (jsStart === -1) { console.log('ERROR: const JS = ` not found'); process.exit(1); }

let i = jsStart + 12;
let jsContent = '';
while (i < src.length) {
    const c = src[i];
    if (c === '`') break;
    if (c === '\\' && src[i+1] === '`') { jsContent += '`'; i += 2; continue; }
    jsContent += c;
    i++;
}
console.log('JS template length:', jsContent.length);

// Find unescaped backticks
const backticks = [];
for (let j = 0; j < jsContent.length; j++) {
    if (jsContent.charCodeAt(j) === 96) {
        backticks.push({ pos: j, ctx: jsContent.slice(Math.max(0,j-30), j+30) });
    }
}
console.log('Unescaped backticks in JS template:', backticks.length);
backticks.forEach((b,idx) => console.log('  #' + idx + ': ...' + JSON.stringify(b.ctx) + '...'));

// Check for </script>
let scriptCloseCount = 0;
let si = jsContent.indexOf('</script');
while (si !== -1) { scriptCloseCount++; si = jsContent.indexOf('</script', si+1); }
console.log('</script occurrences:', scriptCloseCount);

// Non-ASCII chars
const nonAscii = [];
for (let j = 0; j < jsContent.length; j++) {
    const code = jsContent.charCodeAt(j);
    if (code > 127) {
        nonAscii.push({ pos: j, code: '0x' + code.toString(16), char: jsContent[j], ctx: jsContent.slice(Math.max(0,j-20), j+20) });
    }
}
console.log('Non-ASCII chars in JS template:', nonAscii.length);
nonAscii.slice(0, 15).forEach((c,i) => console.log('  #' + i + ': ' + c.code + " '" + c.char + "' ctx: " + JSON.stringify(c.ctx)));

// CSS template
const cssStart = src.indexOf('const CSS = `');
if (cssStart !== -1) {
    let ci = cssStart + 13;
    let cssContent = '';
    while (ci < src.length) {
        const c = src[ci];
        if (c === '`') break;
        if (c === '\\' && src[ci+1] === '`') { cssContent += '`'; ci += 2; continue; }
        cssContent += c;
        ci++;
    }
    const cssNonAscii = [];
    for (let j = 0; j < cssContent.length; j++) {
        if (cssContent.charCodeAt(j) > 127) {
            cssNonAscii.push({ code: '0x'+cssContent.charCodeAt(j).toString(16), char: cssContent[j] });
        }
    }
    console.log('\nCSS non-ASCII count:', cssNonAscii.length);
    cssNonAscii.slice(0,10).forEach((c,i) => console.log('  #' + i + ': ' + c.code + " '" + c.char + "'"));
}
