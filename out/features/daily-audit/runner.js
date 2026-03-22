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
exports.runDailyAudit = runDailyAudit;
exports.loadLastReport = loadLastReport;
/**
 * runner.ts
 *
 * Orchestrates all daily audit checks and writes daily-audit.json.
 * Called from both VS Code (index.ts) and the standalone Node script
 * (scripts/run-audit.js) for the 7:45am scheduled task.
 *
 * Zero VS Code dependency — pure Node.js so the scheduled task
 * can run this without VS Code being open.
 */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const marketplace_1 = require("./checks/marketplace");
const readme_quality_1 = require("./checks/readme-quality");
const claude_coverage_1 = require("./checks/claude-coverage");
const registry_health_1 = require("./checks/registry-health");
const changelog_1 = require("./checks/changelog");
const test_coverage_1 = require("./checks/test-coverage");
const audit_schema_1 = require("../../shared/audit-schema");
const REGISTRY_PATH = 'C:\\Users\\jwpmi\\Downloads\\CieloVistaStandards\\project-registry.json';
function loadRegistry() {
    if (!fs.existsSync(REGISTRY_PATH)) {
        throw new Error(`Registry not found: ${REGISTRY_PATH}`);
    }
    return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
}
/** Run all checks and write the report to AUDIT_REPORT_PATH. */
async function runDailyAudit() {
    const t0 = Date.now();
    let registry;
    try {
        registry = loadRegistry();
    }
    catch (err) {
        const errMsg = String(err);
        const emptyReport = {
            auditId: new Date().toISOString(),
            generatedAt: new Date().toISOString(),
            durationMs: Date.now() - t0,
            checks: [{
                    checkId: 'registryHealth', category: 'Registry', title: 'Project Registry',
                    status: 'red', summary: 'Registry not found', detail: errMsg,
                    affectedProjects: [], affectedFiles: [REGISTRY_PATH],
                    action: 'cvs.docs.openRegistry', actionLabel: 'Fix Registry',
                    ranAt: new Date().toISOString(), durationMs: 0,
                }],
            summary: { red: 1, yellow: 0, green: 0, grey: 0, total: 1 },
        };
        return { report: emptyReport, written: false, error: errMsg };
    }
    const projects = registry.projects;
    // Run all checks — each is independent, failures don't block others
    const checks = await Promise.all([
        safeRun(() => (0, registry_health_1.runRegistryHealthCheck)(projects)),
        safeRun(() => (0, marketplace_1.runMarketplaceCheck)(projects)),
        safeRun(() => (0, readme_quality_1.runReadmeQualityCheck)(projects)),
        safeRun(() => (0, claude_coverage_1.runClaudeCoverageCheck)(projects)),
        safeRun(() => (0, changelog_1.runChangelogCheck)(projects)),
        safeRun(() => (0, test_coverage_1.runTestCoverageCheck)(projects)),
    ]);
    const summary = {
        red: checks.filter(c => c.status === 'red').length,
        yellow: checks.filter(c => c.status === 'yellow').length,
        green: checks.filter(c => c.status === 'green').length,
        grey: checks.filter(c => c.status === 'grey').length,
        total: checks.length,
    };
    const report = {
        auditId: new Date().toISOString(),
        generatedAt: new Date().toISOString(),
        durationMs: Date.now() - t0,
        checks,
        summary,
    };
    // Ensure reports directory exists
    const reportsDir = path.dirname(audit_schema_1.AUDIT_REPORT_PATH);
    if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
    }
    try {
        fs.writeFileSync(audit_schema_1.AUDIT_REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
        return { report, written: true };
    }
    catch (err) {
        return { report, written: false, error: String(err) };
    }
}
/** Loads the last written report from disk. Returns null if none exists. */
function loadLastReport() {
    try {
        if (!fs.existsSync(audit_schema_1.AUDIT_REPORT_PATH)) {
            return null;
        }
        return JSON.parse(fs.readFileSync(audit_schema_1.AUDIT_REPORT_PATH, 'utf8'));
    }
    catch {
        return null;
    }
}
/** Wraps a check so a single failure doesn't crash the whole audit. */
async function safeRun(fn) {
    try {
        return fn();
    }
    catch (err) {
        return {
            checkId: 'unknown', category: 'Error', title: 'Check Failed',
            status: 'grey',
            summary: `Check threw an error: ${String(err).slice(0, 80)}`,
            detail: String(err),
            affectedProjects: [], affectedFiles: [],
            action: '', actionLabel: '',
            ranAt: new Date().toISOString(), durationMs: 0,
        };
    }
}
//# sourceMappingURL=runner.js.map