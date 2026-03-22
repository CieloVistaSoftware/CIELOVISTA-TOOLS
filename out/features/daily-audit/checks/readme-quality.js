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
exports.runReadmeQualityCheck = runReadmeQualityCheck;
/** README quality check — does each project have a README? Is it big enough to matter? */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
function checkOne(project) {
    const readmePath = path.join(project.path, 'README.md');
    if (!fs.existsSync(readmePath)) {
        return { name: project.name, status: 'missing', lines: 0 };
    }
    const content = fs.readFileSync(readmePath, 'utf8');
    const lines = content.split('\n').length;
    return { name: project.name, status: lines < 20 ? 'stub' : 'ok', lines };
}
function runReadmeQualityCheck(projects) {
    const t0 = Date.now();
    const results = projects.map(p => checkOne(p));
    const missing = results.filter(r => r.status === 'missing');
    const stubs = results.filter(r => r.status === 'stub');
    const ok = results.filter(r => r.status === 'ok');
    let status;
    let summary;
    let detail;
    if (missing.length > 0) {
        status = 'red';
        summary = `Missing README in: ${missing.map(r => r.name).join(', ')}`;
        detail = `${missing.length} project(s) have no README.md at all: ${missing.map(r => r.name).join(', ')}` +
            (stubs.length > 0 ? `\n${stubs.length} project(s) have stub READMEs under 20 lines: ${stubs.map(r => r.name).join(', ')}` : '');
    }
    else if (stubs.length > 0) {
        status = 'yellow';
        summary = `${stubs.length} project${stubs.length > 1 ? 's have' : ' has'} stub README${stubs.length > 1 ? 's' : ''} — ${stubs.map(r => r.name).join(', ')}`;
        detail = stubs.map(r => `${r.name}: README.md is only ${r.lines} lines`).join('\n');
    }
    else {
        status = 'green';
        summary = `All ${ok.length} projects have a README`;
        detail = `All project READMEs are present and have sufficient content.`;
    }
    return {
        checkId: 'readmeQuality',
        category: 'Documentation',
        title: 'README Quality',
        status,
        summary,
        detail,
        affectedProjects: [...missing, ...stubs].map(r => r.name),
        affectedFiles: [...missing].map(r => path.join(r.name, 'README.md')),
        action: 'cvs.readme.scan',
        actionLabel: missing.length > 0 ? 'Generate Now' : stubs.length > 0 ? 'Fix Now' : 'Scan',
        ranAt: new Date().toISOString(),
        durationMs: Date.now() - t0,
    };
}
//# sourceMappingURL=readme-quality.js.map