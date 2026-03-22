#!/usr/bin/env node
// Copyright (c) 2025 CieloVista Software. All rights reserved.
//
// scripts/run-audit.js
//
// Standalone daily audit runner — no VS Code required.
// Run by the Windows scheduled task at 7:45am every morning.
//
// Usage:
//   node scripts/run-audit.js
//   node scripts/run-audit.js --verbose
//
// Output:
//   Writes C:\Users\jwpmi\Downloads\CieloVistaStandards\reports\daily-audit.json
//   Exits 0 on success, 1 on failure.
//
// To install as a Windows Scheduled Task (run once as admin):
//   schtasks /create /tn "CieloVista Daily Audit" /tr "node C:\Users\jwpmi\Downloads\VSCode\projects\cielovista-tools\scripts\run-audit.js" /sc daily /st 07:45 /f
//
// To run it manually right now:
//   node scripts/run-audit.js

'use strict';

const fs   = require('fs');
const path = require('path');

const REGISTRY_PATH  = 'C:\\Users\\jwpmi\\Downloads\\CieloVistaStandards\\project-registry.json';
const REPORT_PATH    = 'C:\\Users\\jwpmi\\Downloads\\CieloVistaStandards\\reports\\daily-audit.json';
const VERBOSE        = process.argv.includes('--verbose');
const STALE_DAYS     = 30;
const OPEN_SRC_LICS  = ['MIT','ISC','Apache-2.0','GPL-2.0','GPL-3.0','BSD-2-Clause','BSD-3-Clause'];

function log(msg) { if (VERBOSE) { console.log('[audit]', msg); } }
function info(msg) { console.log(msg); }

// ─── Registry ─────────────────────────────────────────────────────────────────

function loadRegistry() {
    if (!fs.existsSync(REGISTRY_PATH)) { throw new Error('Registry not found: ' + REGISTRY_PATH); }
    return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
}

// ─── Checks ───────────────────────────────────────────────────────────────────

function checkMarketplace(projects) {
    const t0 = Date.now();
    const red = [], yellow = [], green = [];

    for (const p of projects) {
        if (!fs.existsSync(p.path)) { red.push({ name: p.name, missing: ['folder not found'] }); continue; }
        const missing = [];
        if (!fs.existsSync(path.join(p.path,'LICENSE')) && !fs.existsSync(path.join(p.path,'LICENSE.txt'))) { missing.push('LICENSE'); }
        if (!fs.existsSync(path.join(p.path,'CHANGELOG.md'))) { missing.push('CHANGELOG.md'); }
        if (!fs.existsSync(path.join(p.path,'icon.png')))     { missing.push('icon.png'); }
        const pkgPath = path.join(p.path,'package.json');
        if (!fs.existsSync(pkgPath)) { missing.push('package.json'); }
        else {
            try {
                const pkg = JSON.parse(fs.readFileSync(pkgPath,'utf8'));
                if (!pkg.name?.trim())        { missing.push('package.json:name'); }
                if (!pkg.description?.trim()) { missing.push('package.json:description'); }
                if (!pkg.version?.trim())     { missing.push('package.json:version'); }
                const lic = (pkg.license||'').trim();
                if (!lic) { missing.push('package.json:license'); }
                else if (OPEN_SRC_LICS.includes(lic)) { missing.push('license must be PROPRIETARY'); }
                if (p.type === 'vscode-extension' && !pkg.publisher) { missing.push('package.json:publisher'); }
            } catch { missing.push('package.json:invalid'); }
        }
        const errors   = missing.filter(m => !m.includes('icon')&&!m.includes('CHANGELOG')).length;
        const warnings = missing.filter(m =>  m.includes('icon')||m.includes('CHANGELOG')).length;
        const score    = Math.max(0, 100 - errors*20 - warnings*8);
        if (score < 60)        { red.push({name:p.name, score, missing}); }
        else if (score < 100)  { yellow.push({name:p.name, score, missing}); }
        else                   { green.push({name:p.name, score, missing}); }
    }

    const status  = red.length ? 'red' : yellow.length ? 'yellow' : 'green';
    const issues  = red.flatMap(r => r.missing.slice(0,2).map(m => r.name+': '+m));
    const summary = red.length    ? (issues.slice(0,3).join(', ')+(issues.length>3?` +${issues.length-3} more`:''))
                  : yellow.length ? `${yellow.length} project(s) not fully compliant — ${yellow.map(r=>r.name).join(', ')}`
                  :                 `All ${green.length} projects fully compliant`;

    return { checkId:'marketplace', category:'Marketplace', title:'Marketplace Compliance', status, summary,
        detail: [...red,...yellow].map(r=>`${r.name} (${r.score}/100): ${r.missing.join(', ')}`).join('\n')||summary,
        affectedProjects:[...red,...yellow].map(r=>r.name), affectedFiles:[...red,...yellow].flatMap(r=>r.missing),
        action:'cvs.marketplace.scan', actionLabel: red.length?'Fix Now':yellow.length?'Review':'Open',
        ranAt: new Date().toISOString(), durationMs: Date.now()-t0 };
}

function checkReadmeQuality(projects) {
    const t0 = Date.now();
    const missing=[], stubs=[], ok=[];
    for (const p of projects) {
        if (!fs.existsSync(p.path)) { continue; }
        const rp = path.join(p.path,'README.md');
        if (!fs.existsSync(rp))                                { missing.push(p.name); }
        else if (fs.readFileSync(rp,'utf8').split('\n').length < 20) { stubs.push(p.name); }
        else                                                    { ok.push(p.name); }
    }
    const status  = missing.length?'red':stubs.length?'yellow':'green';
    const summary = missing.length ? `Missing README in: ${missing.join(', ')}`
                  : stubs.length   ? `${stubs.length} stub README(s) — ${stubs.join(', ')}`
                  :                  `All ${ok.length} projects have a README`;
    return { checkId:'readmeQuality', category:'Documentation', title:'README Quality', status, summary,
        detail: summary, affectedProjects:[...missing,...stubs], affectedFiles:[],
        action:'cvs.readme.scan', actionLabel: missing.length?'Generate Now':stubs.length?'Fix Now':'Scan',
        ranAt: new Date().toISOString(), durationMs: Date.now()-t0 };
}

function checkClaudeCoverage(projects) {
    const t0 = Date.now();
    const missing = projects.filter(p => fs.existsSync(p.path) && !fs.existsSync(path.join(p.path,'CLAUDE.md')));
    const status  = missing.length ? 'red' : 'green';
    const summary = missing.length ? `No CLAUDE.md in: ${missing.map(p=>p.name).join(', ')}`
                                   : `All ${projects.filter(p=>fs.existsSync(p.path)).length} projects have CLAUDE.md`;
    return { checkId:'claudeCoverage', category:'Session Management', title:'CLAUDE.md Coverage', status, summary,
        detail: summary, affectedProjects: missing.map(p=>p.name), affectedFiles: missing.map(p=>path.join(p.path,'CLAUDE.md')),
        action:'cvs.catalog.open', actionLabel: missing.length?'Create Missing':'Open Catalog',
        ranAt: new Date().toISOString(), durationMs: Date.now()-t0 };
}

function checkRegistryHealth(projects) {
    const t0    = Date.now();
    const stale = projects.filter(p => !fs.existsSync(p.path));
    const status  = stale.length ? 'red' : 'green';
    const summary = stale.length ? `${stale.length} path(s) not found: ${stale.map(p=>p.name).join(', ')}`
                                 : `All ${projects.length} registered projects found on disk`;
    return { checkId:'registryHealth', category:'Registry', title:'Project Registry', status, summary,
        detail: summary, affectedProjects: stale.map(p=>p.name), affectedFiles: stale.map(p=>p.path),
        action:'cvs.docs.openRegistry', actionLabel: stale.length?'Open Registry':'Open',
        ranAt: new Date().toISOString(), durationMs: Date.now()-t0 };
}

function checkChangelog(projects) {
    const t0  = Date.now();
    const now = Date.now();
    const missing=[], stale=[], fresh=[];
    for (const p of projects) {
        if (!fs.existsSync(p.path)) { continue; }
        const cp = path.join(p.path,'CHANGELOG.md');
        if (!fs.existsSync(cp))                                   { missing.push(p.name); }
        else if ((now - fs.statSync(cp).mtimeMs)/(864e5) > STALE_DAYS) { stale.push(p.name); }
        else                                                       { fresh.push(p.name); }
    }
    const status  = missing.length?'red':stale.length?'yellow':'green';
    const summary = missing.length ? `No CHANGELOG in: ${missing.join(', ')}`
                  : stale.length   ? `${stale.length} changelog(s) not updated in ${STALE_DAYS}+ days — ${stale.join(', ')}`
                  :                  `All ${fresh.length} changelogs up to date`;
    return { checkId:'changelog', category:'Documentation', title:'Changelog Status', status, summary,
        detail: summary, affectedProjects:[...missing,...stale], affectedFiles:[],
        action:'cvs.marketplace.scan', actionLabel: missing.length?'Auto-Fix':'Review',
        ranAt: new Date().toISOString(), durationMs: Date.now()-t0 };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
    const t0 = Date.now();
    info('CieloVista Daily Audit — ' + new Date().toLocaleString());

    let registry;
    try {
        registry = loadRegistry();
        log('Registry loaded: ' + registry.projects.length + ' projects');
    } catch (err) {
        info('ERROR: ' + err.message);
        process.exit(1);
    }

    const projects = registry.projects;
    const checks   = [
        checkRegistryHealth(projects),
        checkMarketplace(projects),
        checkReadmeQuality(projects),
        checkClaudeCoverage(projects),
        checkChangelog(projects),
    ];

    const summary = {
        red:    checks.filter(c=>c.status==='red').length,
        yellow: checks.filter(c=>c.status==='yellow').length,
        green:  checks.filter(c=>c.status==='green').length,
        grey:   checks.filter(c=>c.status==='grey').length,
        total:  checks.length,
    };

    const report = {
        auditId:     new Date().toISOString(),
        generatedAt: new Date().toISOString(),
        durationMs:  Date.now() - t0,
        checks,
        summary,
    };

    // Ensure reports dir exists
    const reportsDir = require('path').dirname(REPORT_PATH);
    if (!fs.existsSync(reportsDir)) { fs.mkdirSync(reportsDir, { recursive: true }); }

    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');

    // Print summary
    info('');
    info('Results:');
    for (const c of checks) {
        const dot = c.status==='red'?'🔴':c.status==='yellow'?'🟡':c.status==='green'?'🟢':'⚪';
        info(`  ${dot} ${c.title}: ${c.summary}`);
    }
    info('');
    info(`Summary: 🔴 ${summary.red}  🟡 ${summary.yellow}  🟢 ${summary.green}  — took ${report.durationMs}ms`);
    info(`Written: ${REPORT_PATH}`);

    process.exit(summary.red > 0 ? 1 : 0);
}

main();
