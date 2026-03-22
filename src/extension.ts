// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

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
import * as vscode from 'vscode';
import { disposeChannel, log } from './shared/output-channel';
import { isFeatureEnabled } from './features/feature-toggle';
import { showCommandResult, disposeResultViewer } from './shared/result-viewer';

// ── Features ──────────────────────────────────────────────────────────────────
import { activate as featureToggle,          deactivate as deactivateFeatureToggle   } from './features/feature-toggle';
import { activate as copilotRulesEnforcer,   deactivate as deactivateRulesEnforcer   } from './features/copilot-rules-enforcer';
import { activate as copilotOpenSuggested,   deactivate as deactivateOpenSuggested   } from './features/copilot-open-suggested-file';
import { activate as terminalCopyOutput,     deactivate as deactivateCopyOutput      } from './features/terminal-copy-output';
import { activate as terminalSetFolder,      deactivate as deactivateSetFolder       } from './features/terminal-set-folder';
import { activate as terminalFolderTracker,  deactivate as deactivateFolderTracker   } from './features/terminal-folder-tracker';
import { activate as terminalPromptShortener,deactivate as deactivatePromptShortener } from './features/terminal-prompt-shortener';
import { activate as cssClassHover,          deactivate as deactivateCssClassHover   } from './features/css-class-hover';
import { activate as pythonRunner,           deactivate as deactivatePythonRunner    } from './features/python-runner';
import { activate as htmlTemplateDownloader, deactivate as deactivateHtmlTemplates   } from './features/html-template-downloader';
import { activate as openaiChat,             deactivate as deactivateOpenaiChat      } from './features/openai-chat';
import { activate as docsManager,            deactivate as deactivateDocsManager     } from './features/docs-manager';
import { activate as docAuditor,             deactivate as deactivateDocAuditor      } from './features/doc-auditor/index';
import { activate as dailyAudit,             deactivate as deactivateDailyAudit      } from './features/daily-audit/index';
import { activate as docIntelligence,        deactivate as deactivateDocIntelligence  } from './features/doc-intelligence/index';
import { activate as docConsolidator,        deactivate as deactivateDocConsolidator } from './features/doc-consolidator';
import { activate as docCatalog,             deactivate as deactivateDocCatalog      } from './features/doc-catalog/index';
import { activate as readmeCompliance,       deactivate as deactivateReadmeCompliance } from './features/readme-compliance';
import { activate as readmeGenerator,        deactivate as deactivateReadmeGenerator  } from './features/readme-generator';
import { activate as marketplaceCompliance,  deactivate as deactivateMarketplace      } from './features/marketplace-compliance/index';
import { activate as docHeader,              deactivate as deactivateDocHeader         } from './features/doc-header';
import { activate as docHeaderScan,          deactivate as deactivateDocHeaderScan   } from './features/doc-header-scan';
import { activate as projectLauncher,        deactivate as deactivateProjectLauncher  } from './features/project-launcher';
import { activate as cvsCommandLauncher,     deactivate as deactivateCvsCommandLauncher } from './features/cvs-command-launcher/index';
import { activate as projectHomeOpener,      deactivate as deactivateProjectHomeOpener } from './features/project-home-opener';
import { activate as npmCommandLauncher,     deactivate as deactivateNpmCommandLauncher } from './features/npm-command-launcher';
import { activate as mcpServerScaffolder,    deactivate as deactivateMcpServerScaffolder } from './features/mcp-server-scaffolder';
import { activate as openFolderAsRoot,       deactivate as deactivateOpenFolderAsRoot    } from './features/open-folder-as-root';
import { activate as testCoverageAuditor,    deactivate as deactivateTestCoverageAuditor } from './features/test-coverage-auditor';
import { activate as jsErrorAudit,           deactivate as deactivateJsErrorAudit        } from './features/js-error-audit';
import { runLicenseSync     } from './features/license-sync';
import { runCodebaseAudit   } from './features/codebase-auditor';
import { openErrorLogViewer } from './features/error-log-viewer';
import { activate as codeHighlightAudit, deactivate as deactivateCodeHighlightAudit } from './features/code-highlight-audit';
import { activate as bgHealthRunner,     deactivate as deactivateBgHealthRunner     } from './features/background-health-runner';

// Force inclusion of 'diff' in VSIX bundle to fix activation error
import * as _forceDiffBundle from 'diff';

// ─────────────────────────────────────────────────────────────────────────────

function activateIfEnabled(
    key: string,
    label: string,
    activateFn: (ctx: vscode.ExtensionContext) => void,
    context: vscode.ExtensionContext
): void {
    if (isFeatureEnabled(key)) {
        activateFn(context);
    } else {
        log('extension', `Skipped (disabled): ${label}`);
    }
}

export function activate(context: vscode.ExtensionContext): void {
    featureToggle(context);

    activateIfEnabled('copilotRulesEnforcer',   'Copilot Rules Enforcer',      copilotRulesEnforcer,   context);
    activateIfEnabled('copilotOpenSuggested',   'Copilot Open Suggested File', copilotOpenSuggested,   context);
    activateIfEnabled('terminalCopyOutput',     'Terminal Copy Output',        terminalCopyOutput,     context);
    activateIfEnabled('terminalSetFolder',      'Terminal Set Folder',         terminalSetFolder,      context);
    activateIfEnabled('terminalFolderTracker',  'Terminal Folder Tracker',     terminalFolderTracker,  context);
    activateIfEnabled('terminalPromptShortener','Terminal Prompt Shortener',   terminalPromptShortener,context);
    activateIfEnabled('cssClassHover',          'CSS Class Hover',             cssClassHover,          context);
    activateIfEnabled('pythonRunner',           'Python Runner',               pythonRunner,           context);
    activateIfEnabled('htmlTemplateDownloader', 'HTML Template Downloader',    htmlTemplateDownloader, context);
    activateIfEnabled('openaiChat',             'OpenAI Chat',                 openaiChat,             context);
    activateIfEnabled('cvsCommandLauncher',     'CVS Command Launcher',        cvsCommandLauncher,     context);
    activateIfEnabled('projectHomeOpener',      'Project Home Opener',         projectHomeOpener,      context);
    activateIfEnabled('npmCommandLauncher',     'NPM Command Launcher',        npmCommandLauncher,     context);
    activateIfEnabled('mcpServerScaffolder',    'MCP Server Scaffolder',       mcpServerScaffolder,    context);
    activateIfEnabled('openFolderAsRoot',       'Explorer: Open Folder as Root', openFolderAsRoot,     context);

    docsManager(context);
    docAuditor(context);
    dailyAudit(context);
    docIntelligence(context);
    docConsolidator(context);
    docCatalog(context);
    readmeCompliance(context);
    readmeGenerator(context);
    marketplaceCompliance(context);
    docHeader(context);
    docHeaderScan(context);
    projectLauncher(context);
    testCoverageAuditor(context);
    codeHighlightAudit(context);
    bgHealthRunner(context);
    jsErrorAudit(context);

    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.license.sync',       runLicenseSync),
        vscode.commands.registerCommand('cvs.audit.codebase',     runCodebaseAudit),
        vscode.commands.registerCommand('cvs.tools.errorLog',     openErrorLogViewer),

        // Open the result viewer panel — re-opens it if closed
        vscode.commands.registerCommand('cvs.tools.results', () => {
            showCommandResult({
                rc:        0,
                commandId: 'cvs.tools.results',
                title:     'Results Viewer',
                summary:   'Panel opened — run any command to see results here',
            });
        }),
    );
}

export function deactivate(): void {
    disposeResultViewer();
    deactivateJsErrorAudit();
    deactivateBgHealthRunner();
    deactivateCodeHighlightAudit();
    deactivateOpenFolderAsRoot();
    deactivateMcpServerScaffolder();
    deactivateNpmCommandLauncher();
    deactivateProjectHomeOpener();
    deactivateCvsCommandLauncher();
    deactivateOpenaiChat();
    deactivateHtmlTemplates();
    deactivatePythonRunner();
    deactivateCssClassHover();
    deactivatePromptShortener();
    deactivateFolderTracker();
    deactivateSetFolder();
    deactivateCopyOutput();
    deactivateOpenSuggested();
    deactivateRulesEnforcer();
    deactivateFeatureToggle();
    deactivateDocsManager();
    deactivateDocAuditor();
    deactivateDailyAudit();
    deactivateDocIntelligence();
    deactivateDocConsolidator();
    deactivateDocCatalog();
    deactivateReadmeCompliance();
    deactivateReadmeGenerator();
    deactivateMarketplace();
    deactivateDocHeader();
    deactivateProjectLauncher();
    deactivateTestCoverageAuditor();
    disposeChannel();
}
