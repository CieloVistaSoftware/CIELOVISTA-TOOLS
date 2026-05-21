const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');
const featuresDir = path.join(srcDir, 'features');
const features = [];

const files = fs.readdirSync(featuresDir, { withFileTypes: true });
for (const file of files) {
    if (file.isFile() && file.name.endsWith('.ts') && !file.name.endsWith('.README.md')) {
        features.push(file.name.replace('.ts', ''));
    } else if (file.isDirectory()) {
        const indexPath = path.join(featuresDir, file.name, 'index.ts');
        if (fs.existsSync(indexPath)) {
            features.push(file.name);
        }
    }
}

console.log('All features:');
features.sort().forEach((f, i) => console.log(`${i+1}. ${f}`));
console.log(`\nTotal: ${features.length}`);

// Check which test files exist
const testDir = path.join(__dirname, 'tests/unit');
const testFiles = fs.readdirSync(testDir).filter(f => f.endsWith('.test.js'));

const covered = new Set();
features.forEach(feat => {
    const noHyphens = feat.replace(/-/g, '');
    const hasTest = testFiles.some(tf => 
        tf.includes(feat) || tf.includes(noHyphens)
    );
    if (hasTest) {
        covered.add(feat);
    }
});

const uncovered = features.filter(f => !covered.has(f));
console.log(`\nCovered: ${covered.size}/${features.length}`);
console.log(`\nUncovered (${uncovered.length}):`);
uncovered.forEach(f => console.log(`  - ${f}`));
