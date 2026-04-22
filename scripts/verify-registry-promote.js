// Integration test for promoteFolder — the pure core of registry-promote.
// Creates a throwaway folder in %TEMP%, promotes it, asserts:
//   1. entry appended to registry with status=product
//   2. CLAUDE.md created
//   3. README.md created
//   4. second call is idempotent (no duplicate entry, no overwrite)
// Then cleans up both the test folder and the registry entry.
//
// NOTE on the vscode stub:
// promoteFolder transitively imports shared/registry.ts and shared/output-channel.ts,
// both of which `require('vscode')` at the top level. vscode is only available inside
// the extension host. The stub below satisfies Node's module resolver with the minimum
// surface area the loaded modules actually call when running headless. If the feature
// starts calling additional vscode APIs at import time, this script will fail loudly —
// which is the signal to either expand the stub or refactor the IO layer into a
// vscode-free shared/registry-io.ts (option 2 from the session notes).

const Module = require('module');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === 'vscode') { return require.resolve('./__vscode-stub.js'); }
  return originalResolve.call(this, request, parent, ...rest);
};

const path = require('path');
const fs = require('fs');
const os = require('os');

// Write the stub next to this script so the resolver can find it.
const stubPath = path.join(__dirname, '__vscode-stub.js');
fs.writeFileSync(stubPath, `
module.exports = {
  window: {
    showErrorMessage:       () => {},
    showInformationMessage: () => {},
    showWarningMessage:     () => {},
    createOutputChannel:    () => ({
      appendLine: () => {},
      append:     () => {},
      show:       () => {},
      clear:      () => {},
      dispose:    () => {},
      replace:    () => {},
      name:       'stub',
    }),
  },
  commands: { registerCommand: () => ({ dispose: () => {} }) },
  Uri: { file: (p) => ({ fsPath: p, scheme: 'file' }) },
  FileType: { Unknown: 0, File: 1, Directory: 2, SymbolicLink: 64 },
  workspace: {
    getConfiguration: () => ({ get: (_k, d) => d, update: () => Promise.resolve() }),
    workspaceFolders: [],
    fs: { stat: () => Promise.resolve({ type: 2 }) },
  },
  ExtensionContext: class {},
};
`, 'utf8');

// Load compiled helper — same module cielovista-tools loads at runtime.
const promoteModule = require(path.join(__dirname, '..', 'out', 'features', 'registry-promote.js'));
const { promoteFolder } = promoteModule;

const REGISTRY_PATH = 'C:\\Users\\jwpmi\\Downloads\\CieloVistaStandards\\project-registry.json';

function readRegistry() {
  return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
}

function writeRegistry(reg) {
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(reg, null, 2), 'utf8');
}

// ---- Setup ------------------------------------------------------------
const TEST_NAME = '__promote_test_' + Date.now();
const TEST_FOLDER = path.join(os.tmpdir(), TEST_NAME);
fs.mkdirSync(TEST_FOLDER, { recursive: true });

console.log('test folder:', TEST_FOLDER);

const before = readRegistry();
const beforeCount = before.projects.length;

try {
  // ---- First promote: should register and scaffold both files --------
  const r1 = promoteFolder(TEST_FOLDER, TEST_NAME, 'app', 'integration test folder');
  console.log('');
  console.log('FIRST PROMOTE:');
  console.log('  ok:', r1.ok);
  console.log('  alreadyInRegistry:', r1.alreadyInRegistry);
  console.log('  claudeWritten:', r1.claudeWritten);
  console.log('  readmeWritten:', r1.readmeWritten);
  console.log('  message:', r1.message);

  if (!r1.ok) throw new Error('first promote returned ok=false');
  if (r1.alreadyInRegistry) throw new Error('first promote said alreadyInRegistry=true');
  if (!r1.claudeWritten)   throw new Error('first promote did NOT write CLAUDE.md');
  if (!r1.readmeWritten)   throw new Error('first promote did NOT write README.md');

  const afterFirst = readRegistry();
  if (afterFirst.projects.length !== beforeCount + 1) {
    throw new Error(`expected ${beforeCount + 1} entries after first promote, got ${afterFirst.projects.length}`);
  }
  const newEntry = afterFirst.projects.find(p => p.name === TEST_NAME);
  if (!newEntry)                       throw new Error('new entry not found in registry');
  if (newEntry.status !== 'product')   throw new Error(`expected status=product, got ${newEntry.status}`);
  if (newEntry.type   !== 'app')       throw new Error(`expected type=app, got ${newEntry.type}`);
  if (newEntry.path.toLowerCase() !== TEST_FOLDER.toLowerCase()) {
    throw new Error(`expected path=${TEST_FOLDER}, got ${newEntry.path}`);
  }

  if (!fs.existsSync(path.join(TEST_FOLDER, 'CLAUDE.md'))) {
    throw new Error('CLAUDE.md was not created on disk');
  }
  if (!fs.existsSync(path.join(TEST_FOLDER, 'README.md'))) {
    throw new Error('README.md was not created on disk');
  }

  const claudeContent = fs.readFileSync(path.join(TEST_FOLDER, 'CLAUDE.md'), 'utf8');
  if (!claudeContent.includes(TEST_NAME))     throw new Error('CLAUDE.md missing project name');
  if (!claudeContent.includes('**Status:** product')) throw new Error('CLAUDE.md missing status line');

  // ---- Second promote: should be idempotent --------------------------
  const r2 = promoteFolder(TEST_FOLDER, TEST_NAME, 'app', 'integration test folder');
  console.log('');
  console.log('SECOND PROMOTE:');
  console.log('  ok:', r2.ok);
  console.log('  alreadyInRegistry:', r2.alreadyInRegistry);
  console.log('  claudeWritten:', r2.claudeWritten);
  console.log('  readmeWritten:', r2.readmeWritten);
  console.log('  message:', r2.message);

  if (!r2.ok)                   throw new Error('second promote returned ok=false');
  if (!r2.alreadyInRegistry)    throw new Error('second promote should have said alreadyInRegistry=true');
  if (r2.claudeWritten)         throw new Error('second promote should NOT have rewritten CLAUDE.md');
  if (r2.readmeWritten)         throw new Error('second promote should NOT have rewritten README.md');

  const afterSecond = readRegistry();
  if (afterSecond.projects.length !== beforeCount + 1) {
    throw new Error(`expected ${beforeCount + 1} entries after second promote (idempotent), got ${afterSecond.projects.length}`);
  }

  console.log('');
  console.log('ALL CHECKS PASSED');

} catch (err) {
  console.error('');
  console.error('FAIL:', err.message);
  process.exitCode = 1;
} finally {
  // ---- Cleanup: remove entry from registry, wipe test folder ---------
  try {
    const restore = readRegistry();
    restore.projects = restore.projects.filter(p => p.name !== TEST_NAME);
    writeRegistry(restore);
    fs.rmSync(TEST_FOLDER, { recursive: true, force: true });
    fs.unlinkSync(stubPath);
    console.log('cleanup: registry restored, test folder removed, stub deleted');
  } catch (cleanupErr) {
    console.error('CLEANUP FAILED:', cleanupErr.message);
    console.error('MANUAL ACTION NEEDED — inspect registry and ' + TEST_FOLDER);
  }
}
