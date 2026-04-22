/**
 * install.js
 * Installs the packaged VSIX into VS Code Insiders or VS Code.
 * Tries multiple candidate paths in order until one works.
 * Copyright (c) 2025 CieloVista Software. All rights reserved.
 */
const cp   = require('child_process');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const pkg  = require('./package.json');
const vsix = `${pkg.name}-${pkg.version}.vsix`;
const extId = `${pkg.publisher.toLowerCase()}.${pkg.name}`;
const installedRoot = path.join(os.homedir(), '.vscode-insiders', 'extensions', `${extId}-${pkg.version}`);

function sleep(ms) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function isLockError(err) {
    const code = err && err.code ? String(err.code) : '';
    return code === 'EBUSY' || code === 'EPERM' || code === 'EACCES' || code === 'ENOTEMPTY';
}

if (!fs.existsSync(vsix)) {
    console.error(`VSIX not found: ${vsix}`);
    process.exit(1);
}

function findCodeInsiders() {
    // 1. Use where.exe to find whatever is on PATH first
    try {
        const found = cp.execSync('where.exe code-insiders.cmd 2>nul', { encoding: 'utf8', stdio: 'pipe' }).trim().split('\n')[0].trim();
        if (found && fs.existsSync(found)) { return found; }
    } catch { /* not on PATH */ }
    // 2. Known user-install locations
    const knownPaths = [
        path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Microsoft VS Code Insiders', 'bin', 'code-insiders.cmd'),
        'C:\\Program Files\\Microsoft VS Code Insiders\\bin\\code-insiders.cmd',
    ];
    for (const p of knownPaths) {
        if (fs.existsSync(p)) { return p; }
    }
    return null;
}

const insidersCli = findCodeInsiders();
const candidates = insidersCli ? [insidersCli] : [];

function runCli(command, args) {
    const isCmdShim = /\.(cmd|bat)$/i.test(command);
    const cmdExists = /^[a-zA-Z]:\\/.test(command) ? fs.existsSync(command) : true;
    if (!cmdExists) {
        return false;
    }

    const quoteArg = (value) => {
        const text = String(value);
        if (/\s|"/.test(text)) {
            return `"${text.replace(/"/g, '\\"')}"`;
        }
        return text;
    };

    const spawnCommand = isCmdShim ? 'cmd.exe' : command;
    const spawnArgs = isCmdShim
        ? ['/d', '/s', '/c', `"${command}" ${args.map(quoteArg).join(' ')}`]
        : args;

    try {
        if (isCmdShim) {
            // execSync handles Windows cmd.exe quoting correctly — spawnSync escapes
            // inner quotes causing \"path\" to be sent literally to cmd.exe.
            const cmdLine = `"${command}" ${args.map(quoteArg).join(' ')}`;
            cp.execSync(cmdLine, { windowsHide: true, encoding: 'utf8', stdio: 'pipe' });
            return true;
        }
        const result = cp.spawnSync(spawnCommand, spawnArgs, {
            windowsHide: true,
            shell: false,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        if (result.status === 0) {
            return true;
        }
        if (result.error) {
            const code = result.error && result.error.code ? String(result.error.code) : '';
            if (code === 'ENOENT' || code === 'EINVAL') {
                return false;
            }
            const msg = result.error && result.error.message ? String(result.error.message) : String(result.error);
            if (msg) {
                console.warn(msg);
            }
        }
        const stderr = (result.stderr || '').trim();
        if (stderr) {
            console.warn(stderr);
        }
        return false;
    } catch (e) {
        const code = e && e.code ? String(e.code) : '';
        if (code === 'ENOENT' || code === 'EINVAL') {
            return false;
        }
        const stderr = (e && e.stderr) ? String(e.stderr).trim() : '';
        if (stderr) {
            console.warn(stderr);
        }
        return false;
    }
}

function verifyInstalledFiles() {
    const installedPkgJson = path.join(installedRoot, 'package.json');
    const installedMainJs  = path.join(installedRoot, 'out', 'extension.js');
    const installedCmdsJs  = path.join(installedRoot, 'out', 'features', 'doc-catalog', 'commands.js');

    if (!fs.existsSync(installedPkgJson) || fs.statSync(installedPkgJson).size <= 1000) { return false; }
    if (!fs.existsSync(installedMainJs)  || fs.statSync(installedMainJs).size <= 1000)   { return false; }
    if (!fs.existsSync(installedCmdsJs)  || fs.statSync(installedCmdsJs).size <= 10000)  { return false; }
    return true;
}

let installed = false;
for (const code of candidates) {
    try {
        // Try uninstall first to avoid stale/half-extracted extension folders.
        runCli(code, ['--uninstall-extension', extId]);

        const ok = runCli(code, ['--install-extension', path.resolve(vsix), '--force']);
        if (!ok) {
            continue;
        }

        // VS Code can finish extracting slightly after CLI returns; wait briefly.
        let verified = false;
        for (let i = 0; i < 10; i++) {
            if (verifyInstalledFiles()) { verified = true; break; }
            sleep(400);
        }

        if (verified) {
            console.log(`Installed via ${code}`);
            installed = true;
            break;
        }

        console.warn(`Install command succeeded but files are incomplete after ${code}; trying next method.`);
    } catch {
        // try next candidate
    }
}

if (!installed) {
    // Fall back: copy compiled output directly to the installed extensions folder
    console.log(`\nCLI install unavailable or incomplete — copying directly to:\n  ${installedRoot}`);
    let copied = 0;

    // Remove partial install first so we don't keep zero-byte placeholders.
    try {
        fs.rmSync(installedRoot, { recursive: true, force: true });
    } catch (err) {
        if (!isLockError(err)) {
            throw err;
        }
        console.warn(`Could not fully remove existing install (locked): ${installedRoot}`);
    }

    let skippedLocked = 0;

    function copyDir(src, dest) {
        if (!fs.existsSync(src)) { return; }
        fs.mkdirSync(dest, { recursive: true });
        for (const e of fs.readdirSync(src, { withFileTypes: true })) {
            const s = path.join(src, e.name);
            const d = path.join(dest, e.name);
            if (e.isDirectory()) {
                copyDir(s, d);
            } else {
                let done = false;
                for (let i = 0; i < 4; i++) {
                    try {
                        fs.copyFileSync(s, d);
                        copied++;
                        done = true;
                        break;
                    } catch (err) {
                        if (!isLockError(err) || i === 3) {
                            if (isLockError(err)) {
                                skippedLocked++;
                                console.warn(`Skipping locked file: ${d}`);
                            } else {
                                throw err;
                            }
                        } else {
                            sleep(250);
                        }
                    }
                }
                if (!done) { continue; }
            }
        }
    }

    for (const f of ['package.json', 'LICENSE', 'icon.png', 'README.md', 'CHANGELOG.md', 'ViewADoc.md', '.vscodeignore']) {
        const s = path.join(__dirname, f);
        if (fs.existsSync(s)) {
            fs.mkdirSync(installedRoot, { recursive: true });
            fs.copyFileSync(s, path.join(installedRoot, f));
            copied++;
        }
    }

    for (const d of ['out', 'node_modules', 'docs', 'mcp-server']) {
        copyDir(path.join(__dirname, d), path.join(installedRoot, d));
    }

    if (verifyInstalledFiles()) {
        console.log(`Direct copy succeeded (${copied} files${skippedLocked ? `, ${skippedLocked} locked skipped` : ''}). Reload VS Code window.`);
        process.exit(0);
    }

    console.error('Direct copy failed verification. Required runtime files are still missing or too small.');
    process.exit(1);
}

if (!verifyInstalledFiles()) {
    console.error('Install finished but verification failed: extension files look incomplete.');
    process.exit(1);
}

console.log('Install verification passed. Reload VS Code window.');
process.exit(0);
