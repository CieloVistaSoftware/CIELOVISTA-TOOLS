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
const extensionsRoot = path.join(os.homedir(), '.vscode-insiders', 'extensions');
const extensionsRegistryPath = path.join(os.homedir(), '.vscode-insiders', 'extensions', 'extensions.json');

function sleep(ms) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function isLockError(err) {
    const code = err && err.code ? String(err.code) : '';
    return code === 'EBUSY' || code === 'EPERM' || code === 'EACCES' || code === 'ENOTEMPTY';
}

function backupFile(filePath) {
    try {
        if (!fs.existsSync(filePath)) { return null; }
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = `${filePath}.bak-${stamp}`;
        fs.copyFileSync(filePath, backupPath);
        return backupPath;
    } catch {
        return null;
    }
}

function isValidRegistryEntry(entry) {
    return !!entry &&
        typeof entry === 'object' &&
        !!entry.identifier &&
        typeof entry.identifier === 'object' &&
        typeof entry.identifier.id === 'string' &&
        entry.identifier.id.length > 0;
}

function getDirSize(dir) {
    let total = 0;
    try {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) { total += getDirSize(full); }
            else if (e.isFile()) { try { total += fs.statSync(full).size; } catch { /* skip */ } }
        }
    } catch { /* skip */ }
    return total;
}

function registerInExtensionsJson() {
    try {
        if (!fs.existsSync(extensionsRegistryPath)) { return; }
        const raw = fs.readFileSync(extensionsRegistryPath, 'utf8').replace(/^\uFEFF/, '');
        let entries;
        try { entries = JSON.parse(raw); } catch { entries = []; }
        if (!Array.isArray(entries)) { entries = []; }

        // Remove any stale entry for this extension
        const filtered = entries.filter(e =>
            !(e && e.identifier && typeof e.identifier.id === 'string' &&
              e.identifier.id.toLowerCase() === extId.toLowerCase())
        );

        const size = fs.existsSync(installedRoot) ? getDirSize(installedRoot) : 0;
        filtered.push({
            identifier: { id: extId },
            version: pkg.version,
            location: {
                $mid: 1,
                path: installedRoot.replace(/\\/g, '/').replace(/^([A-Z]):/, (_, d) => `/${d.toLowerCase()}:`),
                scheme: 'file',
            },
            relativeLocation: path.basename(installedRoot),
            metadata: { installedTimestamp: Date.now(), size, targetPlatform: 'undefined' },
        });
        filtered.sort((a, b) => String(a.identifier.id).localeCompare(String(b.identifier.id)));

        backupFile(extensionsRegistryPath);
        fs.writeFileSync(extensionsRegistryPath, `${JSON.stringify(filtered, null, 2)}\n`, 'utf8');
        console.log(`extensions.json updated: registered ${extId} v${pkg.version}`);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`Could not update extensions.json: ${message}`);
    }
}

function repairExtensionsRegistry() {
    try {
        if (!fs.existsSync(extensionsRegistryPath)) {
            return;
        }

        const raw = fs.readFileSync(extensionsRegistryPath, 'utf8').replace(/^\uFEFF/, '');
        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch {
            const backupPath = backupFile(extensionsRegistryPath);
            fs.writeFileSync(extensionsRegistryPath, '[]\n', 'utf8');
            console.warn(`Repaired invalid extensions registry JSON at ${extensionsRegistryPath}${backupPath ? ` (backup: ${backupPath})` : ''}`);
            return;
        }

        const beforeIsArray = Array.isArray(parsed);
        const entries = (beforeIsArray ? parsed : [parsed]).filter(isValidRegistryEntry);
        const changed = !beforeIsArray || entries.length !== (beforeIsArray ? parsed.length : 1);

        if (!changed) {
            return;
        }

        const backupPath = backupFile(extensionsRegistryPath);
        fs.writeFileSync(extensionsRegistryPath, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
        console.warn(`Normalized extensions registry at ${extensionsRegistryPath}${backupPath ? ` (backup: ${backupPath})` : ''}`);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`Could not validate extensions registry: ${message}`);
    }
}

if (!fs.existsSync(vsix)) {
    console.error(`VSIX not found: ${vsix}`);
    process.exit(1);
}

repairExtensionsRegistry();

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

function removeInstalledRootWithRetry() {
    for (let i = 0; i < 4; i++) {
        try {
            fs.rmSync(installedRoot, { recursive: true, force: true });
            return true;
        } catch (err) {
            if (!isLockError(err) || i === 3) {
                return false;
            }
            sleep(250);
        }
    }
    return false;
}

function cleanupStaleCliTempDirs() {
    if (!fs.existsSync(extensionsRoot)) { return; }
    const tempDirPattern = /^\.[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    for (const entry of fs.readdirSync(extensionsRoot, { withFileTypes: true })) {
        if (!entry.isDirectory() || !tempDirPattern.test(entry.name)) {
            continue;
        }
        const full = path.join(extensionsRoot, entry.name);
        try {
            fs.rmSync(full, { recursive: true, force: true });
        } catch (err) {
            if (!isLockError(err)) {
                console.warn(`Could not remove stale temp extension folder: ${full}`);
            }
        }
    }
}

let installed = false;
for (const code of candidates) {
    try {
        // Try uninstall first to avoid stale/half-extracted extension folders.
        runCli(code, ['--uninstall-extension', extId]);
        removeInstalledRootWithRetry();
        cleanupStaleCliTempDirs();

        let ok = runCli(code, ['--install-extension', path.resolve(vsix), '--force']);
        if (!ok && !verifyInstalledFiles()) {
            // One remediation attempt for transient EPERM rename races in the extension folder.
            runCli(code, ['--uninstall-extension', extId]);
            removeInstalledRootWithRetry();
            cleanupStaleCliTempDirs();
            sleep(300);
            ok = runCli(code, ['--install-extension', path.resolve(vsix), '--force']);
        }

        if (!ok && !verifyInstalledFiles()) {
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
        registerInExtensionsJson();
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
