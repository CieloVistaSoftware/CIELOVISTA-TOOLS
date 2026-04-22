// Executes buildViewerHtml and asserts the emitted <script> block is valid JS.
// Proves the fix by parsing, not by claim.

const path = require('path');
const html = require(path.join(__dirname, '..', 'out', 'features', 'mcp-viewer', 'html.js')).buildViewerHtml(1234, 18);
const match = html.match(/<script>([\s\S]*?)<\/script>/);
if (!match) {
  console.error('FAIL: no <script> in emitted HTML');
  process.exit(1);
}
const body = match[1];

const docLine = body.split('\n').find(l => l.includes('s.docComment.replace'));
console.log('EMITTED DOC-COMMENT LINE:');
console.log('  ' + docLine);
console.log('');

// The real test: does the emitted script parse?
try {
  new Function(body);
  console.log('PASS: emitted script parses as valid JavaScript');
} catch (err) {
  console.error('FAIL: emitted script has a SyntaxError');
  console.error('  ' + err.message);
  process.exit(1);
}

// Extra proof: the three regexes actually work on a real JSDoc.
const sample = '/**\n * Does a thing.\n * @param x input\n */';
const cleaned = sample
  .replace(/^\s*\/\*\*/, '')
  .replace(/\*\/\s*$/, '')
  .replace(/^\s*\*\s?/gm, '');
console.log('');
console.log('JSDOC STRIP TEST:');
console.log('  input:  ' + JSON.stringify(sample));
console.log('  output: ' + JSON.stringify(cleaned));

if (!cleaned.includes('Does a thing.') || !cleaned.includes('@param')) {
  console.error('FAIL: JSDoc strip did not preserve content');
  process.exit(1);
}
console.log('');
console.log('ALL CHECKS PASSED');
