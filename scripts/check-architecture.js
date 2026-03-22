// check-architecture.js
// Enforces cielovista-tools architecture rules for command registration and file structure.
// Run with: node scripts/check-architecture.js

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '../src');
const FEATURE_DIR = path.join(SRC_DIR, 'features');
const SHARED_DIR = path.join(SRC_DIR, 'shared');
const EXTENSION_FILE = path.join(SRC_DIR, 'extension.ts');

let errors = [];

// Helper: Recursively get all .ts files in a directory
function getAllTsFiles(dir) {
  let results = [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(getAllTsFiles(fullPath));
    } else if (entry.isFile() && fullPath.endsWith('.ts')) {
      results.push(fullPath);
    }
  });
  return results;
}

// 1. No command registration in shared/ or extension.ts
function checkNoCommandRegistrationOutsideFeatures() {
  // Check shared/
  getAllTsFiles(SHARED_DIR).forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    if (/vscode\.commands\.registerCommand/.test(content)) {
      errors.push(`Command registration found in shared/: ${file}`);
    }
  });
  // Check extension.ts
  const extContent = fs.readFileSync(EXTENSION_FILE, 'utf8');
  if (/vscode\.commands\.registerCommand/.test(extContent)) {
    errors.push('Command registration found in extension.ts');
  }
}

// 2. Each feature file registers commands for only one feature
function checkOneJobPerFeatureFile() {
  getAllTsFiles(FEATURE_DIR).forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    const matches = [...content.matchAll(/vscode\.commands\.registerCommand\(['"](cvs\.[^'"]+)['"]/g)];
    const uniqueCommands = new Set(matches.map(m => m[1]));
    if (uniqueCommands.size > 1) {
      errors.push(`Multiple commands registered in one feature file: ${file} (${[...uniqueCommands].join(', ')})`);
    }
  });
}

// 3. No duplicate command IDs across all features
function checkNoDuplicateCommandIds() {
  const commandMap = new Map();
  getAllTsFiles(FEATURE_DIR).forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    const matches = [...content.matchAll(/vscode\.commands\.registerCommand\(['"](cvs\.[^'"]+)['"]/g)];
    matches.forEach(m => {
      const cmd = m[1];
      if (commandMap.has(cmd)) {
        errors.push(`Duplicate command ID: ${cmd} in both ${commandMap.get(cmd)} and ${file}`);
      } else {
        commandMap.set(cmd, file);
      }
    });
  });
}

// 4. shared/ files export pure functions only (no command registration, no side effects)
function checkSharedPureFunctions() {
  getAllTsFiles(SHARED_DIR).forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    if (/vscode\.commands\.registerCommand/.test(content) || /vscode\.window\./.test(content)) {
      errors.push(`Side effect or command registration in shared/: ${file}`);
    }
  });
}

// Run all checks
checkNoCommandRegistrationOutsideFeatures();
checkOneJobPerFeatureFile();
checkNoDuplicateCommandIds();
checkSharedPureFunctions();

if (errors.length === 0) {
  console.log('✅ Architecture checks passed.');
  process.exit(0);
} else {
  console.error('❌ Architecture violations found:');
  errors.forEach(e => console.error(' - ' + e));
  process.exit(1);
}
