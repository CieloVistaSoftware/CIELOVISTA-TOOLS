"use strict";
// Copyright (c) Cielo Vista Software. All rights reserved.
// src/shared/registry.ts — Project registry path and loader
//
// Exports the canonical REGISTRY_PATH and loadRegistry() utility for all features.
// Ensures single source of truth for project registry location and loading logic.
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
exports.REGISTRY_PATH = void 0;
exports.loadRegistry = loadRegistry;
const fs = __importStar(require("fs"));
const vscode = __importStar(require("vscode"));
// Path to the canonical project registry JSON file
exports.REGISTRY_PATH = 'C:\\Users\\jwpmi\\Downloads\\CieloVistaStandards\\project-registry.json';
/**
 * Loads the project registry from REGISTRY_PATH.
 * Returns the parsed registry object, or undefined if not found or invalid.
 */
function loadRegistry() {
    if (!fs.existsSync(exports.REGISTRY_PATH)) {
        vscode.window.showErrorMessage(`Project registry not found: ${exports.REGISTRY_PATH}`);
        return undefined;
    }
    try {
        return JSON.parse(fs.readFileSync(exports.REGISTRY_PATH, 'utf8'));
    }
    catch (err) {
        vscode.window.showErrorMessage(`Failed to parse project registry: ${err}`);
        return undefined;
    }
}
//# sourceMappingURL=registry.js.map