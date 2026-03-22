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
exports.runRegistryHealthCheck = runRegistryHealthCheck;
/** Registry health check — are all registered project paths still valid? */
const fs = __importStar(require("fs"));
function runRegistryHealthCheck(projects) {
    const t0 = Date.now();
    const stale = projects.filter(p => !fs.existsSync(p.path));
    const active = projects.filter(p => fs.existsSync(p.path));
    let status;
    let summary;
    let detail;
    if (stale.length > 0) {
        status = 'red';
        summary = `${stale.length} registered path${stale.length > 1 ? 's' : ''} not found: ${stale.map(p => p.name).join(', ')}`;
        detail = `The following projects are in the registry but their folders no longer exist:\n` +
            stale.map(p => `  ${p.name}: ${p.path}`).join('\n') +
            `\n\nUpdate project-registry.json to remove or fix these entries.`;
    }
    else {
        status = 'green';
        summary = `All ${active.length} registered projects found on disk`;
        detail = `Registry is clean — all ${active.length} project paths are valid.`;
    }
    return {
        checkId: 'registryHealth',
        category: 'Registry',
        title: 'Project Registry',
        status,
        summary,
        detail,
        affectedProjects: stale.map(p => p.name),
        affectedFiles: stale.map(p => p.path),
        action: 'cvs.docs.openRegistry',
        actionLabel: stale.length > 0 ? 'Open Registry' : 'Open',
        ranAt: new Date().toISOString(),
        durationMs: Date.now() - t0,
    };
}
//# sourceMappingURL=registry-health.js.map