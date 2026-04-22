#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');

// Create a test markdown file
const testMarkdownDir = path.join(__dirname, '..', 'data');
const testMarkdownFile = path.join(testMarkdownDir, 'test-doc.md');

// Ensure directory exists
if (!fs.existsSync(testMarkdownDir)) {
    fs.mkdirSync(testMarkdownDir, { recursive: true });
}

// Write test markdown
const testMarkdown = `# Test Document

This is a test document with links.

## Links

- [External Link](https://example.com)
- [File Link](../CHANGELOG.md)
- [Email Link](mailto:test@example.com)
- [VS Code Command](vscode:extension:github.copilot)

## Code Example

\`\`\`javascript
const x = 42;
console.log(x);
\`\`\`

## Emphasis

This is **bold** and this is *italic*.
`;

fs.writeFileSync(testMarkdownFile, testMarkdown, 'utf8');

console.log('\n✓ View Doc Integration Test');
console.log('─'.repeat(60));

let testsPassed = 0;
let testsFailed = 0;

// Load the actual compiled View Doc code
try {
    const commandsPath = path.join(__dirname, '..', 'out', 'features', 'doc-catalog', 'commands.js');
    
    if (!fs.existsSync(commandsPath)) {
        throw new Error(`Compiled commands.js not found at ${commandsPath}`);
    }

    const stats = fs.statSync(commandsPath);
    console.log(`\n  ✓ Compiled View Doc commands found (${stats.size} bytes)`);
    testsPassed++;

    // Verify the compiled file contains expected functions
    const compiled = fs.readFileSync(commandsPath, 'utf8');
    
    const checks = [
        { name: 'showViewDocPanel function', pattern: /showViewDocPanel/ },
        { name: 'viewSpecificDoc export', pattern: /viewSpecificDoc/ },
        { name: 'HTTP server creation', pattern: /http\.createServer/ },
        { name: 'openExternal call', pattern: /openExternal/ },
        { name: 'Server localhost binding', pattern: /127\.0\.0\.1/ },
    ];

    checks.forEach(check => {
        if (check.pattern.test(compiled)) {
            console.log(`  ✓ Contains: ${check.name}`);
            testsPassed++;
        } else {
            console.log(`  ✗ Missing: ${check.name}`);
            testsFailed++;
        }
    });

    // Verify output directory structure
    const outDir = path.join(__dirname, '..', 'out');
    const expectedFiles = [
        'extension.js',
        'features/doc-catalog/commands.js',
        'shared/doc-preview.js',
        'shared/output-channel.js',
    ];

    console.log(`\n  Output directory verification:`);
    expectedFiles.forEach(file => {
        const fullPath = path.join(outDir, file);
        if (fs.existsSync(fullPath)) {
            const size = fs.statSync(fullPath).size;
            console.log(`    ✓ ${file} (${size} bytes)`);
            testsPassed++;
        } else {
            console.log(`    ✗ ${file} MISSING`);
            testsFailed++;
        }
    });

} catch (e) {
    console.log(`  ✗ Error: ${e.message}`);
    testsFailed++;
}

// Clean up test file
try {
    fs.unlinkSync(testMarkdownFile);
} catch (_) {}

console.log(`\n────────────────────────────────────────────────────────────`);
console.log(`${testsPassed} passed, ${testsFailed} failed\n`);

if (testsFailed > 0) {
    process.exit(1);
}
