const fs = require('fs');
const path = require('path');
const data = fs.readFileSync(path.join(__dirname, '..', 'data', 'fixes.json'), 'utf8');
try {
  const parsed = JSON.parse(data);
  console.log('valid JSON,', parsed.length, 'entries');
  console.log('last entry:', parsed[parsed.length - 1].id, '-', parsed[parsed.length - 1].title);
} catch (err) {
  console.error('INVALID JSON:', err.message);
  process.exit(1);
}
