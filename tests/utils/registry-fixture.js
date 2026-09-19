// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * registry-fixture.js — a temp home folder holding a project registry (#838).
 *
 * The registry path is os.homedir()/Downloads/CieloVistaStandards/
 * project-registry.json, read when a module loads. useRegistryHome() writes a
 * registry naming the given projects under a fresh temp folder and points
 * USERPROFILE and HOME at it, so a module required afterwards reads this
 * registry and never the user's own. Call it before requiring the module.
 *
 *   const fx = useRegistryHome({
 *       'proj-a': { 'README.md': '# A', 'docs/guide.md': '# Guide' },
 *   });
 *   fx.file('proj-a', 'docs/guide.md')   // absolute path
 *   fx.dispose()                          // removes the temp folder
 *
 * A project name may be a path relative to the home folder
 * ('Downloads/VSCode/projects/cielovista-tools'): the project lives there and
 * its registry name is the last segment.
 */
'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');

function useRegistryHome(projects, { globalDocs = { 'standards.md': '# Standards\n' } } = {}) {
    const tmp    = fs.mkdtempSync(path.join(os.tmpdir(), 'cvt-registry-'));
    const home   = path.join(tmp, 'home');
    const global = path.join(tmp, 'global-docs');
    const roots  = {};
    const write  = (root, files) => {
        for (const [rel, content] of Object.entries(files)) {
            const full = path.join(root, rel);
            fs.mkdirSync(path.dirname(full), { recursive: true });
            fs.writeFileSync(full, content, 'utf8');
        }
    };
    fs.mkdirSync(global, { recursive: true });
    write(global, globalDocs);
    for (const [key, files] of Object.entries(projects)) {
        const root = key.includes('/') ? path.join(home, ...key.split('/')) : path.join(tmp, key);
        fs.mkdirSync(root, { recursive: true });
        write(root, files);
        roots[path.basename(root)] = root;
    }
    const regDir = path.join(home, 'Downloads', 'CieloVistaStandards');
    fs.mkdirSync(regDir, { recursive: true });
    fs.writeFileSync(path.join(regDir, 'project-registry.json'), JSON.stringify({
        globalDocsPath: global,
        projects: Object.entries(roots).map(([name, p]) => ({ name, path: p, type: 'app', description: `${name} fixture` })),
    }, null, 2), 'utf8');
    process.env.USERPROFILE = home;
    process.env.HOME        = home;
    return {
        tmp, home, global,
        root: (name) => roots[name],
        file: (name, rel) => path.join(roots[name], ...rel.split('/')),
        dispose: () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ } },
    };
}

module.exports = { useRegistryHome };
