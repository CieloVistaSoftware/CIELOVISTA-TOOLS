"use strict";
// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMarketplaceCheck = runMarketplaceCheck;
/** Marketplace compliance check — LICENSE, CHANGELOG, icon.png, package.json fields. */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const OPEN_SOURCE_LICENSES = ['MIT', 'ISC', 'Apache-2.0', 'GPL-2.0', 'GPL-3.0', 'BSD-2-Clause', 'BSD-3-Clause'];
function checkOne(project) {
    const missing = [];
    if (!fs.existsSync(project.path)) {
        return { name: project.name, score: 0, missing: ['project folder not found'] };
    }
    if (!fs.existsSync(path.join(project.path, 'LICENSE')) &&
        !fs.existsSync(path.join(project.path, 'LICENSE.txt'))) {
        missing.push('LICENSE');
    }
    if (!fs.existsSync(path.join(project.path, 'CHANGELOG.md'))) {
        missing.push('CHANGELOG.md');
    }
    if (!fs.existsSync(path.join(project.path, 'icon.png'))) {
        missing.push('icon.png');
    }
    const pkgPath = path.join(project.path, 'package.json');
    if (!fs.existsSync(pkgPath)) {
        missing.push('package.json');
    }
    else {
        try {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            if (!pkg.name || !pkg.name.trim()) {
                missing.push('package.json:name');
            }
            if (!pkg.description || !pkg.description.trim()) {
                missing.push('package.json:description');
            }
            if (!pkg.version || !pkg.version.trim()) {
                missing.push('package.json:version');
            }
            const lic = (pkg.license ?? '').trim();
            if (!lic) {
                missing.push('package.json:license');
            }
            else if (OPEN_SOURCE_LICENSES.includes(lic)) {
                missing.push(`package.json:license="${lic}" must be PROPRIETARY`);
            }
            if (project.type === 'vscode-extension' && !pkg.publisher) {
                missing.push('package.json:publisher');
            }
        }
        catch {
            missing.push('package.json:invalid JSON');
        }
    }
    const errors = missing.filter(m => !m.includes('icon') && !m.includes('CHANGELOG')).length;
    const warnings = missing.filter(m => m.includes('icon') || m.includes('CHANGELOG')).length;
    const score = Math.max(0, 100 - errors * 20 - warnings * 8);
    return { name: project.name, score, missing };
}
function runMarketplaceCheck(projects) {
    const t0 = Date.now();
    const results = projects.map(p => checkOne(p));
    const red = results.filter(r => r.score < 60);
    const yellow = results.filter(r => r.score >= 60 && r.score < 100);
    const green = results.filter(r => r.score === 100);
    let status;
    let summary;
    let detail;
    if (red.length > 0) {
        status = 'red';
        const issues = red.flatMap(r => r.missing.slice(0, 2).map(m => `${r.name}: ${m}`));
        summary = issues.slice(0, 3).join(', ') + (issues.length > 3 ? ` +${issues.length - 3} more` : '');
        detail = red.map(r => `${r.name} (score ${r.score}/100): ${r.missing.join(', ')}`).join('\n');
    }
    else if (yellow.length > 0) {
        status = 'yellow';
        summary = `${yellow.length} project${yellow.length > 1 ? 's' : ''} not fully compliant — ${yellow.map(r => r.name).join(', ')}`;
        detail = yellow.map(r => `${r.name} (score ${r.score}/100): ${r.missing.join(', ')}`).join('\n');
    }
    else {
        status = 'green';
        summary = `All ${green.length} projects fully compliant`;
        detail = `All projects have LICENSE, CHANGELOG, icon.png, and valid package.json.`;
    }
    return {
        checkId: 'marketplace',
        category: 'Marketplace',
        title: 'Marketplace Compliance',
        status,
        summary,
        detail,
        affectedProjects: [...red, ...yellow].map(r => r.name),
        affectedFiles: [...red, ...yellow].flatMap(r => r.missing),
        action: 'cvs.marketplace.scan',
        actionLabel: red.length > 0 ? 'Fix Now' : yellow.length > 0 ? 'Review' : 'Open',
        ranAt: new Date().toISOString(),
        durationMs: Date.now() - t0,
    };
}
//# sourceMappingURL=marketplace.js.map