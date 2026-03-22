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
exports.runClaudeCoverageCheck = runClaudeCoverageCheck;
/** CLAUDE.md coverage check — every project should have session instructions. */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
function runClaudeCoverageCheck(projects) {
    const t0 = Date.now();
    const missing = projects.filter(p => fs.existsSync(p.path) && !fs.existsSync(path.join(p.path, 'CLAUDE.md')));
    const present = projects.filter(p => fs.existsSync(p.path) && fs.existsSync(path.join(p.path, 'CLAUDE.md')));
    let status;
    let summary;
    let detail;
    if (missing.length > 0) {
        status = 'red';
        summary = `No CLAUDE.md in: ${missing.map(p => p.name).join(', ')}`;
        detail = `${missing.length} project(s) are missing CLAUDE.md session instructions.\n` +
            `Without it Claude starts every session cold with no project context.\n` +
            `Missing: ${missing.map(p => p.name).join(', ')}`;
    }
    else {
        status = 'green';
        summary = `All ${present.length} projects have CLAUDE.md`;
        detail = `Every registered project has CLAUDE.md session instructions.`;
    }
    return {
        checkId: 'claudeCoverage',
        category: 'Session Management',
        title: 'CLAUDE.md Coverage',
        status,
        summary,
        detail,
        affectedProjects: missing.map(p => p.name),
        affectedFiles: missing.map(p => path.join(p.path, 'CLAUDE.md')),
        action: 'cvs.catalog.open',
        actionLabel: missing.length > 0 ? 'Create Missing' : 'Open Catalog',
        ranAt: new Date().toISOString(),
        durationMs: Date.now() - t0,
    };
}
//# sourceMappingURL=claude-coverage.js.map