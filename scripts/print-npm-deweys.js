// Print Dewey numbers and script names assigned by npm-command-launcher logic
const path = require('path');
const fs = require('fs');

// Simulate the relevant logic from buildHtml
function getNpmScriptDeweys() {
  const helpDir = path.join(__dirname, '../src/features/CommandHelp');
  let nextDewey = 200.100;
  const usedDeweys = new Set();
  const allHelpFiles = fs.readdirSync(helpDir).filter(f => f.startsWith('npm-catalog.') && f.endsWith('.md'));
  const helpFileByDewey = {};
  for (const f of allHelpFiles) {
    const m = f.match(/npm-catalog\.(\d{3}\.\d{3})\.md/);
    if (m) helpFileByDewey[m[1]] = f;
  }
  // Simulate script entries (read all package.json scripts)
  const glob = require('glob');
  const packageFiles = glob.sync(path.join(__dirname, '../**/package.json'), { ignore: '**/node_modules/**' });
  const entries = [];
  for (const file of packageFiles) {
    try {
      const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (pkg.scripts) {
        for (const [name, cmd] of Object.entries(pkg.scripts)) {
          entries.push({
            packageDir: path.dirname(file),
            scriptName: name,
          });
        }
      }
    } catch {}
  }
  const scriptToDewey = {};
  entries.forEach(e => {
    let foundDewey = undefined;
    for (const [dewey, file] of Object.entries(helpFileByDewey)) {
      if (file.includes(e.scriptName)) {
        foundDewey = dewey;
        break;
      }
    }
    while (!foundDewey || usedDeweys.has(foundDewey)) {
      foundDewey = `${Math.floor(nextDewey/1000)}.${(nextDewey%1000).toString().padStart(3,'0')}`;
      nextDewey++;
    }
    scriptToDewey[e.scriptName] = foundDewey;
    usedDeweys.add(foundDewey);
  });
  return entries.map(e => ({ script: e.scriptName, dewey: scriptToDewey[e.scriptName], folder: e.packageDir }));
}

const results = getNpmScriptDeweys();
console.log('Dewey assignments for NPM scripts:');
results.forEach(({dewey, script, folder}) => {
  console.log(`${dewey}\t${script}\t${folder}`);
});
