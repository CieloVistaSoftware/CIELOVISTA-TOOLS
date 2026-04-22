// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * extension.ts — CieloVista Tools root entry point.
 * Imports every feature activate() and calls it via activateIfEnabled().
 */
import * as vscode from 'vscode';
import { disposeChannel, log } from './shared/output-channel';
import { isFeatureEnabled } from './features/feature-toggle';

import { activate as featureToggle,           deactivate as deactivateFeatureToggle    } from './features/feature-toggle';
import { activate as copilotRulesEnforcer,    deactivate as deactivateRulesEnforcer    } from './features/copilot-rules-enforcer';
import { activate as copilotOpenSuggested,    deactivate as deactivateOpenSuggested    } from './features/copilot-open-suggested-file';
import { activate as terminalCopyOutput,      deactivate as deactivateCopyOutput       } from './features/terminal-copy-output';
import { activate as terminalSetFolder,       deactivate as deactivateSetFolder        } from './features/terminal-set-folder';
import { activate as terminalFolderTracker,   deactivate as deactivateFolderTracker    } from './features/terminal-folder-tracker';
import { activate as terminalPromptShortener, deactivate as deactivatePromptShortener  } from './features/terminal-prompt-shortener';
import { activate as cssClassHover,           deactivate as deactivateCssClassHover    } from './features/css-class-hover';
import { activate as pythonRunner,            deactivate as deactivatePythonRunner     } from './features/python-runner';
import { activate as htmlTemplateDownloader,  deactivate as deactivateHtmlTemplates    } from './features/html-template-downloader';
import { activate as openaiChat,              deactivate as deactivateOpenaiChat       } from './features/openai-chat';
import { activate as docsManager,             deactivate as deactivateDocsManager      } from './features/docs-manager';
import { activate as docAuditor,              deactivate as deactivateDocAuditor       } from './features/doc-auditor/index';
import { activate as dailyAudit,              deactivate as deactivateDailyAudit       } from './features/daily-audit/index';
import { activate as docIntelligence,         deactivate as deactivateDocIntelligence  } from './features/doc-intelligence/index';
import { activate as docConsolidator,         deactivate as deactivateDocConsolidator  } from './features/doc-consolidator';
import { activate as docCatalog,              deactivate as deactivateDocCatalog       } from './features/doc-catalog/index';
import { activate as readmeCompliance,        deactivate as deactivateReadmeCompliance } from './features/readme-compliance';
import { activate as readmeGenerator,         deactivate as deactivateReadmeGenerator  } from './features/readme-generator';
import { activate as marketplaceCompliance,   deactivate as deactivateMarketplace      } from './features/marketplace-compliance/index';
import { activate as docHeader,               deactivate as deactivateDocHeader        } from './features/doc-header';
import { activate as docHeaderScan,           deactivate as deactivateDocHeaderScan    } from './features/doc-header-scan';
import { activate as projectLauncher,         deactivate as deactivateProjectLauncher  } from './features/project-launcher';
import { activate as cvsCommandLauncher,      deactivate as deactivateCvsCommandLauncher } from './features/cvs-command-launcher/index';
import { activate as projectHomeOpener,       deactivate as deactivateProjectHomeOpener  } from './features/project-home-opener';
import { activate as npmCommandLauncher,      deactivate as deactivateNpmCommandLauncher } from './features/npm-command-launcher';
import { activate as mcpServerScaffolder,     deactivate as deactivateMcpServerScaffolder } from './features/mcp-server-scaffolder';
import { activate as openFolderAsRoot,        deactivate as deactivateOpenFolderAsRoot    } from './features/open-folder-as-root';
import { activate as testCoverageAuditor,     deactivate as deactivateTestCoverageAuditor } from './features/test-coverage-auditor';
import { activate as jsErrorAudit,            deactivate as deactivateJsErrorAudit        } from './features/js-error-audit';
import { activate as codeHighlightAudit,      deactivate as deactivateCodeHighlightAudit  } from './features/code-highlight-audit';
import { activate as bgHealthRunner,          deactivate as deactivateBgHealthRunner      } from './features/background-health-runner';
import { activate as homePage,                deactivate as deactivateHomePage             } from './features/home-page';
import { initHistory }        from './features/cvs-command-launcher/command-history';
import { initRecentProjects, touchCurrentProject } from './features/cvs-command-launcher/recent-projects';
import { activate as claudeProcessMonitor,    deactivate as deactivateClaudeProcessMonitor } from './features/claude-process-monitor';
import { activate as mcpBuildActivate,        deactivate as mcpBuildDeactivate             } from './features/mcp-build';
import { activate as imageReaderActivate,     deactivate as imageReaderDeactivate          } from './features/image-reader';
import { activate as mcpViewerActivate,       deactivate as mcpViewerDeactivate            } from './features/mcp-viewer';
import { activate as explorerCopyPathToChatActivate, deactivate as explorerCopyPathToChatDeactivate } from './features/explorer-copy-path-to-chat';
import { initMcpServerPath, startMcpServer }                                                   from './features/mcp-server-status';

import { runLicenseSync     } from './features/license-sync';
import { runCodebaseAudit   } from './features/codebase-auditor';
import { openErrorLogViewer } from './features/error-log-viewer';

// Force inclusion of 'diff' in VSIX bundle
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
    // Resolve MCP server path from extension root and start immediately in every workspace.
    initMcpServerPath(context.extensionPath);
    startMcpServer();
    // Initialize history and recents BEFORE home page renders so it gets real data
    initHistory(context);
    initRecentProjects(context);
    touchCurrentProject();
    homePage(context);

    activateIfEnabled('copilotRulesEnforcer',    'Copilot Rules Enforcer',        copilotRulesEnforcer,    context);
    activateIfEnabled('copilotOpenSuggested',    'Copilot Open Suggested File',   copilotOpenSuggested,    context);
    activateIfEnabled('terminalCopyOutput',      'Terminal Copy Output',          terminalCopyOutput,      context);
    activateIfEnabled('terminalSetFolder',       'Terminal Set Folder',           terminalSetFolder,       context);
    activateIfEnabled('terminalFolderTracker',   'Terminal Folder Tracker',       terminalFolderTracker,   context);
    activateIfEnabled('terminalPromptShortener', 'Terminal Prompt Shortener',     terminalPromptShortener, context);
    activateIfEnabled('cssClassHover',           'CSS Class Hover',               cssClassHover,           context);
    activateIfEnabled('pythonRunner',            'Python Runner',                 pythonRunner,            context);
    activateIfEnabled('htmlTemplateDownloader',  'HTML Template Downloader',      htmlTemplateDownloader,  context);
    activateIfEnabled('openaiChat',              'OpenAI Chat',                   openaiChat,              context);
    activateIfEnabled('docsManager',             'Docs Manager',                  docsManager,             context);
    activateIfEnabled('docAuditor',              'Doc Auditor',                   docAuditor,              context);
    activateIfEnabled('dailyAudit',              'Daily Audit',                   dailyAudit,              context);
    activateIfEnabled('docIntelligence',         'Doc Intelligence',              docIntelligence,         context);
    activateIfEnabled('docConsolidator',         'Doc Consolidator',              docConsolidator,         context);
    activateIfEnabled('docCatalog',              'Doc Catalog',                   docCatalog,              context);
    activateIfEnabled('readmeCompliance',        'README Compliance',             readmeCompliance,        context);
    activateIfEnabled('readmeGenerator',         'README Generator',              readmeGenerator,         context);
    activateIfEnabled('marketplaceCompliance',   'Marketplace Compliance',        marketplaceCompliance,   context);
    activateIfEnabled('docHeader',               'Doc Header',                    docHeader,               context);
    activateIfEnabled('docHeaderScan',           'Doc Header Scan',               docHeaderScan,           context);
    activateIfEnabled('projectLauncher',         'Project Launcher',              projectLauncher,         context);
    activateIfEnabled('cvsCommandLauncher',      'CVS Command Launcher',          cvsCommandLauncher,      context);
    activateIfEnabled('projectHomeOpener',       'Project Home Opener',           projectHomeOpener,       context);
    activateIfEnabled('npmCommandLauncher',      'NPM Command Launcher',          npmCommandLauncher,      context);
    activateIfEnabled('mcpServerScaffolder',     'MCP Server Scaffolder',         mcpServerScaffolder,     context);
    activateIfEnabled('openFolderAsRoot',        'Explorer: Open Folder as Root', openFolderAsRoot,        context);
    activateIfEnabled('testCoverageAuditor',     'Test Coverage Auditor',         testCoverageAuditor,     context);
    activateIfEnabled('codeHighlightAudit',      'Code Highlight Audit',          codeHighlightAudit,      context);
    activateIfEnabled('bgHealthRunner',          'Background Health Runner',      bgHealthRunner,          context);
    activateIfEnabled('jsErrorAudit',            'JS Error Audit',                jsErrorAudit,            context);
    activateIfEnabled('claudeProcessMonitor',    'Claude Process Monitor',        claudeProcessMonitor,    context);
    activateIfEnabled('mcpBuild',                'MCP Build',                     mcpBuildActivate,        context);
    activateIfEnabled('imageReader',             'Image Reader',                  imageReaderActivate,     context);
    activateIfEnabled('mcpViewer',               'MCP Endpoint Viewer',           mcpViewerActivate,       context);
    activateIfEnabled('explorerCopyPathToChat',  'Explorer: Copy Path to Copilot Chat', explorerCopyPathToChatActivate, context);

    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.license.sync',   runLicenseSync),
        vscode.commands.registerCommand('cvs.audit.codebase', runCodebaseAudit),
        vscode.commands.registerCommand('cvs.tools.errorLog', openErrorLogViewer),
        vscode.commands.registerCommand('cvs.tools.results',  () => { /* placeholder */ }),
    );
}

export function deactivate(): void {
    deactivateHomePage();
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
    imageReaderDeactivate();
    mcpViewerDeactivate();
    explorerCopyPathToChatDeactivate();
    deactivateDocHeader();
    deactivateProjectLauncher();
    deactivateTestCoverageAuditor();
    disposeChannel();
}
