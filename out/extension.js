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
exports.activate = activate;
exports.deactivate = deactivate;
/**
 * extension.ts
 * CieloVista Tools — root entry point.
 *
 * This file does ONE thing: import every feature's activate() function
 * and call it — but only if the user hasn't disabled it via settings.
 * Each feature is gated on `cielovistaTools.features.<key>` (default: true).
 * The feature-toggle feature itself always activates so users can change
 * settings even if everything else is disabled.
 *
 * Deactivate order is the reverse of activate order.
 */
const vscode = __importStar(require("vscode"));
const output_channel_1 = require("./shared/output-channel");
const feature_toggle_1 = require("./features/feature-toggle");
const result_viewer_1 = require("./shared/result-viewer");
// ── Features ──────────────────────────────────────────────────────────────────
const feature_toggle_2 = require("./features/feature-toggle");
const copilot_rules_enforcer_1 = require("./features/copilot-rules-enforcer");
const copilot_open_suggested_file_1 = require("./features/copilot-open-suggested-file");
const terminal_copy_output_1 = require("./features/terminal-copy-output");
const terminal_set_folder_1 = require("./features/terminal-set-folder");
const terminal_folder_tracker_1 = require("./features/terminal-folder-tracker");
const terminal_prompt_shortener_1 = require("./features/terminal-prompt-shortener");
const css_class_hover_1 = require("./features/css-class-hover");
const python_runner_1 = require("./features/python-runner");
const html_template_downloader_1 = require("./features/html-template-downloader");
const openai_chat_1 = require("./features/openai-chat");
const docs_manager_1 = require("./features/docs-manager");
const index_1 = require("./features/doc-auditor/index");
const index_2 = require("./features/daily-audit/index");
const index_3 = require("./features/doc-intelligence/index");
const doc_consolidator_1 = require("./features/doc-consolidator");
const index_4 = require("./features/doc-catalog/index");
const readme_compliance_1 = require("./features/readme-compliance");
const readme_generator_1 = require("./features/readme-generator");
const index_5 = require("./features/marketplace-compliance/index");
const doc_header_1 = require("./features/doc-header");
const doc_header_scan_1 = require("./features/doc-header-scan");
const project_launcher_1 = require("./features/project-launcher");
const index_6 = require("./features/cvs-command-launcher/index");
const project_home_opener_1 = require("./features/project-home-opener");
const npm_command_launcher_1 = require("./features/npm-command-launcher");
const mcp_server_scaffolder_1 = require("./features/mcp-server-scaffolder");
const open_folder_as_root_1 = require("./features/open-folder-as-root");
const test_coverage_auditor_1 = require("./features/test-coverage-auditor");
const js_error_audit_1 = require("./features/js-error-audit");
const license_sync_1 = require("./features/license-sync");
const codebase_auditor_1 = require("./features/codebase-auditor");
const error_log_viewer_1 = require("./features/error-log-viewer");
const code_highlight_audit_1 = require("./features/code-highlight-audit");
const background_health_runner_1 = require("./features/background-health-runner");
// ─────────────────────────────────────────────────────────────────────────────
function activateIfEnabled(key, label, activateFn, context) {
    if ((0, feature_toggle_1.isFeatureEnabled)(key)) {
        activateFn(context);
    }
    else {
        (0, output_channel_1.log)('extension', `Skipped (disabled): ${label}`);
    }
}
function activate(context) {
    (0, feature_toggle_2.activate)(context);
    activateIfEnabled('copilotRulesEnforcer', 'Copilot Rules Enforcer', copilot_rules_enforcer_1.activate, context);
    activateIfEnabled('copilotOpenSuggested', 'Copilot Open Suggested File', copilot_open_suggested_file_1.activate, context);
    activateIfEnabled('terminalCopyOutput', 'Terminal Copy Output', terminal_copy_output_1.activate, context);
    activateIfEnabled('terminalSetFolder', 'Terminal Set Folder', terminal_set_folder_1.activate, context);
    activateIfEnabled('terminalFolderTracker', 'Terminal Folder Tracker', terminal_folder_tracker_1.activate, context);
    activateIfEnabled('terminalPromptShortener', 'Terminal Prompt Shortener', terminal_prompt_shortener_1.activate, context);
    activateIfEnabled('cssClassHover', 'CSS Class Hover', css_class_hover_1.activate, context);
    activateIfEnabled('pythonRunner', 'Python Runner', python_runner_1.activate, context);
    activateIfEnabled('htmlTemplateDownloader', 'HTML Template Downloader', html_template_downloader_1.activate, context);
    activateIfEnabled('openaiChat', 'OpenAI Chat', openai_chat_1.activate, context);
    activateIfEnabled('cvsCommandLauncher', 'CVS Command Launcher', index_6.activate, context);
    activateIfEnabled('projectHomeOpener', 'Project Home Opener', project_home_opener_1.activate, context);
    activateIfEnabled('npmCommandLauncher', 'NPM Command Launcher', npm_command_launcher_1.activate, context);
    activateIfEnabled('mcpServerScaffolder', 'MCP Server Scaffolder', mcp_server_scaffolder_1.activate, context);
    activateIfEnabled('openFolderAsRoot', 'Explorer: Open Folder as Root', open_folder_as_root_1.activate, context);
    (0, docs_manager_1.activate)(context);
    (0, index_1.activate)(context);
    (0, index_2.activate)(context);
    (0, index_3.activate)(context);
    (0, doc_consolidator_1.activate)(context);
    (0, index_4.activate)(context);
    (0, readme_compliance_1.activate)(context);
    (0, readme_generator_1.activate)(context);
    (0, index_5.activate)(context);
    (0, doc_header_1.activate)(context);
    (0, doc_header_scan_1.activate)(context);
    (0, project_launcher_1.activate)(context);
    (0, test_coverage_auditor_1.activate)(context);
    (0, code_highlight_audit_1.activate)(context);
    (0, background_health_runner_1.activate)(context);
    (0, js_error_audit_1.activate)(context);
    context.subscriptions.push(vscode.commands.registerCommand('cvs.license.sync', license_sync_1.runLicenseSync), vscode.commands.registerCommand('cvs.audit.codebase', codebase_auditor_1.runCodebaseAudit), vscode.commands.registerCommand('cvs.tools.errorLog', error_log_viewer_1.openErrorLogViewer), 
    // Open the result viewer panel — re-opens it if closed
    vscode.commands.registerCommand('cvs.tools.results', () => {
        (0, result_viewer_1.showCommandResult)({
            rc: 0,
            commandId: 'cvs.tools.results',
            title: 'Results Viewer',
            summary: 'Panel opened — run any command to see results here',
        });
    }));
}
function deactivate() {
    (0, result_viewer_1.disposeResultViewer)();
    (0, js_error_audit_1.deactivate)();
    (0, background_health_runner_1.deactivate)();
    (0, code_highlight_audit_1.deactivate)();
    (0, open_folder_as_root_1.deactivate)();
    (0, mcp_server_scaffolder_1.deactivate)();
    (0, npm_command_launcher_1.deactivate)();
    (0, project_home_opener_1.deactivate)();
    (0, index_6.deactivate)();
    (0, openai_chat_1.deactivate)();
    (0, html_template_downloader_1.deactivate)();
    (0, python_runner_1.deactivate)();
    (0, css_class_hover_1.deactivate)();
    (0, terminal_prompt_shortener_1.deactivate)();
    (0, terminal_folder_tracker_1.deactivate)();
    (0, terminal_set_folder_1.deactivate)();
    (0, terminal_copy_output_1.deactivate)();
    (0, copilot_open_suggested_file_1.deactivate)();
    (0, copilot_rules_enforcer_1.deactivate)();
    (0, feature_toggle_2.deactivate)();
    (0, docs_manager_1.deactivate)();
    (0, index_1.deactivate)();
    (0, index_2.deactivate)();
    (0, index_3.deactivate)();
    (0, doc_consolidator_1.deactivate)();
    (0, index_4.deactivate)();
    (0, readme_compliance_1.deactivate)();
    (0, readme_generator_1.deactivate)();
    (0, index_5.deactivate)();
    (0, doc_header_1.deactivate)();
    (0, project_launcher_1.deactivate)();
    (0, test_coverage_auditor_1.deactivate)();
    (0, output_channel_1.disposeChannel)();
}
//# sourceMappingURL=extension.js.map