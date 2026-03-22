"use strict";
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
exports.fixProject = fixProject;
// Copyright (c) 2025 CieloVista Software. All rights reserved.
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const output_channel_1 = require("../../shared/output-channel");
const file_generators_1 = require("./file-generators");
const png_generator_1 = require("./png-generator");
function fixProject(compliance) {
    const fixed = [];
    const { project, issues, packageJson } = compliance;
    let pkg = packageJson ? { ...packageJson } : null;
    for (const issue of issues) {
        if (!issue.fixable) {
            continue;
        }
        try {
            if (issue.fixKey === 'create:license') {
                fs.writeFileSync(path.join(project.path, 'LICENSE'), (0, file_generators_1.licenseContent)(project.name), 'utf8');
                fixed.push('LICENSE');
            }
            if (issue.fixKey === 'create:changelog') {
                const version = pkg?.['version'] ?? '1.0.0';
                fs.writeFileSync(path.join(project.path, 'CHANGELOG.md'), (0, file_generators_1.changelogContent)(project.name, version), 'utf8');
                fixed.push('CHANGELOG.md');
            }
            if (issue.fixKey === 'create:icon') {
                fs.writeFileSync(path.join(project.path, 'icon.png'), (0, png_generator_1.createBlueStarPng)());
                fixed.push('icon.png');
                if (pkg) {
                    pkg['icon'] = 'icon.png';
                }
            }
            if (issue.fixKey === 'pkg:license' && pkg) {
                pkg['license'] = 'PROPRIETARY';
            }
            if (issue.fixKey === 'pkg:icon' && pkg) {
                pkg['icon'] = 'icon.png';
            }
            if (issue.fixKey === 'pkg:publisher' && pkg) {
                pkg['publisher'] = 'CieloVistaSoftware';
            }
        }
        catch (err) {
            (0, output_channel_1.logError)('marketplace-compliance', `Fix failed: ${issue.fixKey} in ${project.name}`, err);
        }
    }
    if (pkg && packageJson) {
        const pkgPath = path.join(project.path, 'package.json');
        try {
            fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
            if (JSON.stringify(pkg) !== JSON.stringify(packageJson)) {
                fixed.push('package.json');
            }
        }
        catch (err) {
            (0, output_channel_1.logError)('marketplace-compliance', `Failed to write package.json for ${project.name}`, err);
        }
    }
    return fixed;
}
//# sourceMappingURL=fixer.js.map