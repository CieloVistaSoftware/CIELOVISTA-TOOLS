// patch-help-docs.js — adds helpDoc to catalog entries that have a .README.md
'use strict';
const fs   = require('fs');
const path = require('path');
const f    = String.raw`C:\Users\jwpmi\Downloads\VSCode\projects\cielovista-tools\src\features\cvs-command-launcher.ts`;

let c = fs.readFileSync(f, 'utf8');

// Map: command-id prefix -> README filename (without .README.md)
// Any command whose id starts with the key gets that helpDoc
const MAPPINGS = [
    ['cvs.catalog.',        'doc-catalog'],        // no README yet — skip for now
    ['cvs.docs.',           'docs-manager'],
    ['cvs.audit.docs',      'doc-auditor'],
    ['cvs.audit.findD',     'doc-auditor'],
    ['cvs.audit.findS',     'doc-auditor'],
    ['cvs.audit.findO',     'doc-auditor'],
    ['cvs.audit.merge',     'doc-auditor'],
    ['cvs.audit.move',      'doc-auditor'],
    ['cvs.audit.open',      'doc-auditor'],
    ['cvs.audit.act',       'doc-auditor'],
    ['cvs.audit.walk',      'doc-auditor'],
    ['cvs.audit.runD',      'doc-auditor'],
    ['cvs.consolidate.',    'doc-consolidator'],
    ['cvs.readme.',         'docs-manager'],        // readme tools share docs-manager README for now
    ['cvs.marketplace.',    'docs-manager'],
    ['cvs.launch.',         'project-launcher'],    // no README yet
    ['cvs.copilotRules.',   'copilot-rules-enforcer'],
    ['cvs.copilot.open',    'copilot-open-suggested-file'],
    ['cvs.terminal.copy',   'terminal-copy-output'],
    ['cvs.terminal.paste',  'terminal-copy-output'],
    ['cvs.terminal.setF',   'terminal-set-folder'],
    ['cvs.terminal.jump',   'terminal-folder-tracker'],
    ['cvs.terminal.toggle', 'terminal-prompt-shortener'],
    ['cvs.cssClassHover.',  'css-class-hover'],
    ['cvs.python.',         'python-runner'],
    ['cvs.openai.',         'openai-chat'],
    ['cvs.npm.',            'npm-command-launcher'],
    ['cvs.project.open',    'project-home-opener'],
    ['cvs.explorer.',       'open-folder-as-root'],
];

// README files that actually exist on disk
const featDir = String.raw`C:\Users\jwpmi\Downloads\VSCode\projects\cielovista-tools\src\features`;
const existing = new Set(
    fs.readdirSync(featDir)
      .filter(n => n.endsWith('.README.md'))
      .map(n => n.replace('.README.md', ''))
);
console.log('README files found:', [...existing].join(', '));

// For each catalog entry line that has a dewey field, inject helpDoc if not already present
// Pattern: lines containing  dewey: '...'  and a command id we can match
let patched = 0;

c = c.replace(/\{ id: '([^']+)',[^\n]+dewey: '[^']+'\s*(?:, auditCheckId: '[^']+')?\s*\}/g, (match, id) => {
    // Skip if already has helpDoc
    if (match.includes('helpDoc:')) { return match; }

    // Find matching README
    let readme = null;
    for (const [prefix, name] of MAPPINGS) {
        if (id.startsWith(prefix) && existing.has(name)) {
            readme = name;
            break;
        }
    }

    if (!readme) { return match; }

    // Inject helpDoc before closing }
    patched++;
    return match.replace(/\s*\}$/, `, helpDoc: README('${readme}') }`);
});

fs.writeFileSync(f, c, 'utf8');
console.log(`Patched ${patched} catalog entries with helpDoc.`);
