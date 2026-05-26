// REG-092 — cvs.launch.* commands must be hidden from the VS Code palette via commandPalette when:false
// They are declared in contributes.commands (so VS Code is aware of them and they can be called
// programmatically), but hidden from the quick-picker so they don't pollute the palette.
// They must also be registered at runtime in activate() with actual terminal-launcher implementations.

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '../..');
const PKG       = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'src/features/cvs-command-launcher/index.ts'), 'utf8');

const LAUNCH_COMMANDS = [
    'cvs.launch.pick',
    'cvs.launch.diskcleanup.start',
    'cvs.launch.diskcleanup.console',
    'cvs.launch.diskcleanup.build',
    'cvs.launch.diskcleanup.stop',
    'cvs.launch.snapit.start',
    'cvs.launch.snapit.tray',
    'cvs.launch.snapit.rebuild',
    'cvs.launch.snapit.build',
    'cvs.launch.snapit.stop',
];

const paletteIds = new Set((PKG.contributes?.commands ?? []).map(c => c.command));

// Build a map of commandPalette entries
const paletteDenyMap = new Map();
for (const entry of (PKG.contributes?.menus?.commandPalette ?? [])) {
    paletteDenyMap.set(entry.command, entry.when);
}

// CHECK 1-10: all cvs.launch.* commands must be hidden from the palette via commandPalette when:false
for (const id of LAUNCH_COMMANDS) {
    const whenClause = paletteDenyMap.get(id);
    assert.strictEqual(whenClause, 'false',
        `[REG-092] "${id}" must appear in menus.commandPalette with when:"false" to hide from palette`);
    console.log(`[REG-092] PASS: "${id}" hidden from palette via commandPalette when:false`);
}

// CHECK 11-20: all cvs.launch.* commands must be registered in activate() in index.ts
for (const id of LAUNCH_COMMANDS) {
    assert.ok(INDEX_SRC.includes(`'${id}'`) || INDEX_SRC.includes(`"${id}"`),
        `[REG-092] "${id}" must be registered via registerCommand in index.ts`);
    console.log(`[REG-092] PASS: "${id}" registered in activate()`);
}

// CHECK 21: _launchInTerminal helper must exist
assert.ok(INDEX_SRC.includes('function _launchInTerminal('),
    '[REG-092] _launchInTerminal helper must be defined in index.ts');
console.log('[REG-092] PASS: _launchInTerminal helper defined');

// CHECK 22: project path constants must be present
assert.ok(INDEX_SRC.includes('_DISKCLEANUP_ROOT') && INDEX_SRC.includes('_SNAPIT_ROOT'),
    '[REG-092] Project path constants _DISKCLEANUP_ROOT and _SNAPIT_ROOT must be defined');
console.log('[REG-092] PASS: project path constants defined');

console.log('[REG-092] ALL 22 CHECKS PASSED');
