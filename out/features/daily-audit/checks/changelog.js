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
exports.runChangelogCheck = runChangelogCheck;
/** Changelog freshness check — active projects should have recent changelogs. */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const STALE_DAYS = 30;
function runChangelogCheck(projects) {
    const t0 = Date.now();
    const now = Date.now();
    const missing = [];
    const stale = [];
    const fresh = [];
    for (const p of projects) {
        if (!fs.existsSync(p.path)) {
            continue;
        }
        const clPath = path.join(p.path, 'CHANGELOG.md');
        if (!fs.existsSync(clPath)) {
            missing.push(p.name);
            continue;
        }
        const mtime = fs.statSync(clPath).mtimeMs;
        const ageDays = (now - mtime) / (1000 * 60 * 60 * 24);
        if (ageDays > STALE_DAYS) {
            stale.push(p.name);
        }
        else {
            fresh.push(p.name);
        }
    }
    let status;
    let summary;
    let detail;
    if (missing.length > 0) {
        status = 'red';
        summary = `No CHANGELOG in: ${missing.join(', ')}`;
        detail = `${missing.length} project(s) have no CHANGELOG.md: ${missing.join(', ')}\n` +
            (stale.length > 0 ? `${stale.length} project(s) have changelogs not updated in ${STALE_DAYS}+ days: ${stale.join(', ')}` : '');
    }
    else if (stale.length > 0) {
        status = 'yellow';
        summary = `${stale.length} changelog${stale.length > 1 ? 's' : ''} not updated in ${STALE_DAYS}+ days — ${stale.join(', ')}`;
        detail = `These projects have changelogs that haven't been touched in over ${STALE_DAYS} days:\n${stale.join(', ')}`;
    }
    else {
        status = 'green';
        summary = `All ${fresh.length} changelogs up to date`;
        detail = `All project CHANGELOG.md files have been updated within the last ${STALE_DAYS} days.`;
    }
    return {
        checkId: 'changelog',
        category: 'Documentation',
        title: 'Changelog Status',
        status,
        summary,
        detail,
        affectedProjects: [...missing, ...stale],
        affectedFiles: [...missing, ...stale].map(n => path.join(n, 'CHANGELOG.md')),
        action: 'cvs.marketplace.scan',
        actionLabel: missing.length > 0 ? 'Auto-Fix' : 'Review',
        ranAt: new Date().toISOString(),
        durationMs: Date.now() - t0,
    };
}
//# sourceMappingURL=changelog.js.map