"use strict";
/**
 * test-coverage-auditor.ts — Test Coverage Audit Feature
 *
 * Integrates the audit-test-coverage.js script into the CieloVista Tools extension
 * as a webview panel. Provides:
 *  - Visual audit dashboard with tier breakdown and coverage metrics
 *  - Feature coverage matrix (which features tested in which tiers)
 *  - Gap analysis: missing tiers, untested bugs, untested features
 *  - Recommendations with priority levels
 *  - One-click markdown report generation
 *
 * Commands:
 *  - cvs.audit.testCoverage — Open the audit dashboard
 *  - cvs.audit.testCoverage.refresh — Re-run the audit
 *  - cvs.audit.testCoverage.export — Export report as markdown
 */
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
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const child_process_1 = require("child_process");
const output_channel_1 = require("../shared/output-channel");
const error_log_1 = require("../shared/error-log");
// ============================================================================
// CONSTANTS
// ============================================================================
const WEBVIEW_TYPE = 'testCoverageAuditor';
const COMMAND_OPEN = 'cvs.audit.testCoverage';
const COMMAND_REFRESH = 'cvs.audit.testCoverage.refresh';
const COMMAND_EXPORT = 'cvs.audit.testCoverage.export';
// ============================================================================
// GLOBAL STATE
// ============================================================================
let currentWebviewPanel;
let currentReport;
// ============================================================================
// AUDIT EXECUTION
// ============================================================================
/**
 * Run the test coverage audit by executing the Node script
 * Returns parsed JSON report
 */
async function runAudit() {
    const output = (0, output_channel_1.getChannel)();
    output.appendLine('🔍 Running test coverage audit...');
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
        const err = new Error('No workspace folder open — cannot run audit-test-coverage.js');
        (0, error_log_1.logError)('[test-coverage-auditor]', err, { context: 'runAudit' });
        throw err;
    }
    const scriptPath = path.join(workspaceRoot, 'scripts', 'audit-test-coverage.js');
    if (!require('fs').existsSync(scriptPath)) {
        const err = new Error(`audit-test-coverage.js not found at: ${scriptPath} — this script only exists in the cielovista-tools project, not in ${path.basename(workspaceRoot)}`);
        (0, error_log_1.logError)('[test-coverage-auditor]', err, { context: 'runAudit', type: 'FILE_IO_ERROR' });
        throw err;
    }
    let rawOutput = '';
    try {
        const cmd = `node "${scriptPath}" --json`;
        rawOutput = (0, child_process_1.execSync)(cmd, { encoding: 'utf8', cwd: workspaceRoot, stdio: 'pipe' });
    }
    catch (execErr) {
        // execSync throws when exit code != 0 — capture stdout/stderr from the error object
        rawOutput = execErr.stdout || '';
        const stderr = execErr.stderr || '';
        if (!rawOutput.trim()) {
            const err = new Error(`audit-test-coverage.js crashed with no output. stderr: ${stderr.slice(0, 300)}`);
            (0, error_log_1.logError)('[test-coverage-auditor]', err, { context: 'runAudit — execSync failed', type: 'COMMAND_ERROR' });
            throw err;
        }
    }
    // Find the JSON line — it's the last non-empty line starting with '{'
    const lines = rawOutput.split('\n').map(l => l.trim()).filter(Boolean);
    const jsonLine = [...lines].reverse().find(l => l.startsWith('{'));
    if (!jsonLine) {
        const preview = lines.slice(-5).join(' | ');
        const err = new Error(`audit-test-coverage.js produced no JSON output. Last output: ${preview}`);
        (0, error_log_1.logError)('[test-coverage-auditor]', err, { context: 'runAudit — no JSON line found', type: 'AUDIT_ERROR' });
        throw err;
    }
    let metricsJson;
    try {
        metricsJson = JSON.parse(jsonLine);
    }
    catch (parseErr) {
        const snippet = jsonLine.slice(0, 200);
        const err = new Error(`JSON.parse failed on script output. Parse error: ${parseErr.message}. Offending line (first 200 chars): ${snippet}`);
        (0, error_log_1.logError)('[test-coverage-auditor]', err, { context: 'runAudit — JSON.parse', type: 'JSON_PARSE_ERROR' });
        throw err;
    }
    output.appendLine(`✅ Audit complete: ${metricsJson.metrics?.totalTestFiles ?? '?'} files, ${metricsJson.metrics?.totalTestCases ?? '?'} tests`);
    return formatAuditReport(metricsJson);
}
/**
 * Convert raw metrics JSON to AuditReport format
 */
function formatAuditReport(metricsJson) {
    const metrics = metricsJson.metrics;
    const coveragePercent = metrics.featuresTotal > 0 ? Math.round((metrics.featuresCovered / metrics.featuresTotal) * 100) : 0;
    // Map tiers
    const tierMap = {
        TIER_1: 'Static Compliance',
        TIER_2: 'Unit Tests',
        TIER_3: 'Integration Tests',
        TIER_4: 'Functional Tests',
        TIER_5: 'Regression Tests',
    };
    const descriptions = {
        TIER_1: 'Type checking, linting, schema validation',
        TIER_2: 'Isolated functions, business logic, edge cases',
        TIER_3: 'Module interactions, data flow, API mocks',
        TIER_4: 'User workflows, UI rendering, server responses',
        TIER_5: 'Bug fixes, prevents re-breaking',
    };
    const tiers = ['TIER_1', 'TIER_2', 'TIER_3', 'TIER_4', 'TIER_5'].map((tierKey) => {
        const tierTests = metricsJson.testsByTier[tierKey] || [];
        const testCases = tierTests.reduce((sum, t) => sum + (t.tests || 0), 0);
        return {
            tier: tierKey,
            name: tierMap[tierKey],
            description: descriptions[tierKey],
            files: tierTests.length,
            testCases,
            present: tierTests.length > 0,
        };
    });
    // Build gaps list
    const gaps = [];
    if (metrics.featuresUncovered > 0) {
        gaps.push(`${metrics.featuresUncovered} features without unit tests`);
    }
    tiers.forEach((t) => {
        if (!t.present) {
            gaps.push(`Missing ${t.tier}: ${t.name}`);
        }
    });
    if (metrics.bugsUntested > 0) {
        gaps.push(`${metrics.bugsUntested} bugs without regression tests`);
    }
    // Build recommendations
    const recommendations = [];
    if (coveragePercent < 50) {
        recommendations.push({
            priority: 'HIGH',
            text: `Coverage is ${coveragePercent}%. Prioritize adding Tier 2 (unit) tests for each feature.`,
        });
    }
    if (metrics.bugsUntested > 0) {
        recommendations.push({
            priority: 'HIGH',
            text: `Add Tier 5 (regression) tests for ${metrics.bugsUntested} bug(s) in tests/regression/.`,
        });
    }
    if (!tiers.find((t) => t.tier === 'TIER_1')?.present) {
        recommendations.push({
            priority: 'MEDIUM',
            text: 'Create Tier 1 compliance tests (type checking, linting, coverage).',
        });
    }
    if (!tiers.find((t) => t.tier === 'TIER_3')?.present) {
        recommendations.push({
            priority: 'MEDIUM',
            text: 'Add Tier 3 integration tests for module interactions.',
        });
    }
    return {
        timestamp: new Date().toISOString(),
        totalTestFiles: metrics.totalTestFiles,
        totalTestCases: metrics.totalTestCases,
        featuresCovered: metrics.featuresCovered,
        featuresTotal: metrics.featuresTotal,
        coveragePercent,
        tiers,
        gaps,
        recommendations,
        bugsUntested: metrics.bugsUntested,
        bugsTotal: metrics.bugsTotal,
    };
}
// ============================================================================
// WEBVIEW UI
// ============================================================================
/**
 * Generate HTML content for the webview panel
 */
function getWebviewHtml(webview, report) {
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, 'resources', 'webview.css'));
    // Determine coverage color
    const coverageColor = report.coveragePercent >= 70 ? '#4CAF50' : report.coveragePercent >= 40 ? '#FFC107' : '#F44336';
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Test Coverage Audit</title>
<style>
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #e0e0e0;
    background: #1e1e1e;
    margin: 0;
    padding: 16px;
    line-height: 1.6;
  }
  
  h1, h2, h3 {
    margin: 0;
    padding: 0;
  }
  
  h1 {
    font-size: 24px;
    margin-bottom: 24px;
    color: #fff;
  }
  
  h2 {
    font-size: 16px;
    margin: 20px 0 12px 0;
    color: #64B5F6;
    border-bottom: 1px solid #333;
    padding-bottom: 8px;
  }
  
  h3 {
    font-size: 14px;
    margin: 12px 0 8px 0;
    color: #90CAF9;
  }
  
  .metric {
    display: inline-block;
    background: #252526;
    border: 1px solid #3E3E42;
    border-radius: 4px;
    padding: 12px 16px;
    margin: 8px 16px 8px 0;
    min-width: 120px;
  }
  
  .metric-label {
    font-size: 11px;
    color: #888;
    text-transform: uppercase;
    margin-bottom: 4px;
  }
  
  .metric-value {
    font-size: 18px;
    font-weight: bold;
    color: #fff;
  }
  
  .metric-value.coverage {
    color: ${coverageColor};
  }
  
  .tier {
    background: #252526;
    border-left: 4px solid #3E3E42;
    border-radius: 4px;
    padding: 12px;
    margin: 8px 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .tier.present {
    border-left-color: #4CAF50;
    background: rgba(76, 175, 80, 0.1);
  }
  
  .tier.missing {
    border-left-color: #F44336;
    background: rgba(244, 67, 54, 0.1);
  }
  
  .tier-left {
    flex: 1;
  }
  
  .tier-name {
    font-weight: bold;
    color: #fff;
    margin-bottom: 4px;
  }
  
  .tier-desc {
    font-size: 12px;
    color: #888;
  }
  
  .tier-stats {
    font-size: 12px;
    color: #aaa;
    margin-top: 4px;
  }
  
  .tier-icon {
    font-size: 20px;
    margin-left: 16px;
  }
  
  .gap {
    background: rgba(244, 67, 54, 0.1);
    border-left: 4px solid #F44336;
    border-radius: 4px;
    padding: 8px 12px;
    margin: 8px 0;
    font-size: 13px;
  }
  
  .recommendation {
    background: #252526;
    border-left: 4px solid #3E3E42;
    border-radius: 4px;
    padding: 12px;
    margin: 8px 0;
  }
  
  .recommendation.high {
    border-left-color: #F44336;
    background: rgba(244, 67, 54, 0.1);
  }
  
  .recommendation.medium {
    border-left-color: #FFC107;
    background: rgba(255, 193, 7, 0.1);
  }
  
  .rec-priority {
    display: inline-block;
    font-size: 10px;
    font-weight: bold;
    padding: 2px 6px;
    border-radius: 3px;
    margin-right: 8px;
    text-transform: uppercase;
  }
  
  .rec-priority.high {
    background: #F44336;
    color: white;
  }
  
  .rec-priority.medium {
    background: #FFC107;
    color: #000;
  }
  
  .rec-priority.low {
    background: #2196F3;
    color: white;
  }
  
  .button-group {
    margin: 20px 0;
    display: flex;
    gap: 8px;
  }
  
  button {
    background: #0E639C;
    color: white;
    border: none;
    border-radius: 4px;
    padding: 8px 16px;
    font-size: 13px;
    cursor: pointer;
    font-weight: 500;
  }
  
  button:hover {
    background: #1177BB;
  }
  
  button.secondary {
    background: #3E3E42;
    color: #e0e0e0;
  }
  
  button.secondary:hover {
    background: #454546;
  }
  
  .timestamp {
    font-size: 11px;
    color: #666;
    margin-top: 20px;
    padding-top: 12px;
    border-top: 1px solid #333;
  }
</style>
</head>
<body>

<h1>📊 Test Coverage Audit</h1>

<div class="button-group">
  <button onclick="refresh()">🔄 Refresh Audit</button>
  <button class="secondary" onclick="exportReport()">📄 Export as Markdown</button>
  <button style="background: #F44336;" onclick="generateTests()">📝 Generate Unit Tests</button>
</div>

<h2>📈 Metrics</h2>
<div>
  <div class="metric">
    <div class="metric-label">Test Files</div>
    <div class="metric-value">${report.totalTestFiles}</div>
  </div>
  <div class="metric">
    <div class="metric-label">Test Cases</div>
    <div class="metric-value">${report.totalTestCases}</div>
  </div>
  <div class="metric">
    <div class="metric-label">Feature Coverage</div>
    <div class="metric-value">${report.featuresCovered}/${report.featuresTotal}</div>
  </div>
  <div class="metric">
    <div class="metric-label">Coverage %</div>
    <div class="metric-value coverage">${report.coveragePercent}%</div>
  </div>
  ${report.bugsTotal > 0
        ? `<div class="metric">
    <div class="metric-label">Bugs (Untested)</div>
    <div class="metric-value">${report.bugsUntested}/${report.bugsTotal}</div>
  </div>`
        : ''}
</div>

<h2>📋 Tier Breakdown</h2>
${report.tiers
        .map((tier) => `
<div class="tier ${tier.present ? 'present' : 'missing'}">
  <div class="tier-left">
    <div class="tier-name">${tier.present ? '✅' : '❌'} ${tier.name}</div>
    <div class="tier-desc">${tier.description}</div>
    ${tier.present ? `<div class="tier-stats">${tier.files} files • ${tier.testCases} test cases</div>` : '<div class="tier-stats">No tests found</div>'}
  </div>
</div>
`)
        .join('')}

${report.gaps.length > 0
        ? `
<h2>⚠️ Coverage Gaps</h2>
${report.gaps.map((gap) => `<div class="gap">• ${gap}</div>`).join('')}
`
        : ''}

${report.recommendations.length > 0
        ? `
<h2>💡 Recommendations</h2>
${report.recommendations
            .map((rec) => `
<div class="recommendation ${rec.priority.toLowerCase()}">
  <span class="rec-priority ${rec.priority.toLowerCase()}">${rec.priority}</span>
  ${rec.text}
</div>
`)
            .join('')}
`
        : ''}

<div class="timestamp">
Generated: ${new Date(report.timestamp).toLocaleString()}
</div>

<script>
  const vscode = acquireVsCodeApi();
  
  function refresh() {
    vscode.postMessage({ command: 'refresh' });
  }
  
  function exportReport() {
    vscode.postMessage({ command: 'export' });
  }
  
  function generateTests() {
    const confirmed = confirm('Generate unit test skeleton files for features without tests?');
    if (confirmed) {
      vscode.postMessage({ command: 'generate' });
    }
  }
</script>

</body>
</html>`;
}
// ============================================================================
// TEST GENERATION & AUTO-FIX
// ============================================================================
/**
 * Generate unit test skeleton files for features without tests
 */
async function generateMissingTests() {
    try {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceRoot) {
            throw new Error('No workspace folder open');
        }
        // Create tests/unit directory if it doesn't exist
        const unitTestsDir = path.join(workspaceRoot.uri.fsPath, 'tests', 'unit');
        if (!fs.existsSync(unitTestsDir)) {
            fs.mkdirSync(unitTestsDir, { recursive: true });
        }
        // Find features in src/features directory
        const featuresDir = path.join(workspaceRoot.uri.fsPath, 'src', 'features');
        if (!fs.existsSync(featuresDir)) {
            throw new Error('src/features directory not found');
        }
        const files = fs.readdirSync(featuresDir, { withFileTypes: true });
        const generatedFiles = [];
        // Generate test files for features without tests
        for (const file of files) {
            const featureName = file.isDirectory() ? file.name : file.name.replace('.ts', '');
            const testFile = path.join(unitTestsDir, `${featureName}.test.ts`);
            // Skip if already has test file
            if (fs.existsSync(testFile)) {
                continue;
            }
            // Generate skeleton test file
            const testContent = generateTestSkeleton(featureName);
            fs.writeFileSync(testFile, testContent, 'utf8');
            generatedFiles.push(featureName);
        }
        if (generatedFiles.length === 0) {
            vscode.window.showInformationMessage('✅ All features already have unit test files.');
            return;
        }
        // Show success message
        vscode.window.showInformationMessage(`✅ Generated ${generatedFiles.length} unit test file(s): ${generatedFiles.join(', ')}`);
        // Open first generated test file
        const firstTestFile = path.join(unitTestsDir, `${generatedFiles[0]}.test.ts`);
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(firstTestFile));
        vscode.window.showTextDocument(doc, { preview: false });
    }
    catch (err) {
        vscode.window.showErrorMessage(`Failed to generate tests: ${err.message}`);
    }
}
/**
 * Generate a skeleton test file for a feature
 */
function generateTestSkeleton(featureName) {
    const humanName = featureName
        .replace(/-/g, ' ')
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    return `/**
 * ${featureName}.test.ts — Unit tests for ${humanName}
 *
 * Tier 2: Unit Tests
 * Tests isolated functions, business logic, and edge cases.
 *
 * TODO: Replace placeholder tests with real tests for each exported function.
 */

import { describe, it, expect } from '@jest/globals';

// Import the feature module here
// import { someFunction } from '../../src/features/${featureName}';

describe('${humanName}', () => {
  describe('initialization', () => {
    it('should define the module', () => {
      // Replace with actual test
      expect(true).toBe(true);
    });
  });

  describe('core functionality', () => {
    it('TODO: test main function behavior', () => {
      // Example structure:
      // const result = someFunction({ input: 'test' });
      // expect(result).toEqual(expectedOutput);
    });

    it('TODO: test error handling', () => {
      // Test edge cases and error scenarios
    });

    it('TODO: test integration with VS Code API if applicable', () => {
      // Mock vscode module if needed
    });
  });

  describe('edge cases', () => {
    it('TODO: handle missing inputs gracefully', () => {
      // 
    });

    it('TODO: handle invalid data types', () => {
      // 
    });
  });
});

/**
 * Test Coverage Checklist:
 * - [ ] All exported functions have at least one test
 * - [ ] Edge cases are covered (null, undefined, empty, etc.)
 * - [ ] Error handling is tested
 * - [ ] Integration points are mocked or tested
 * 
 * Running Tests:
 *   npm run test              # Run all tests
 *   npm test -- \${featureName}  # Run this file only
 *   npm test -- --watch       # Watch mode for development
 */
`;
}
// ============================================================================
/**
 * Open or show the audit webview panel
 */
async function openAuditPanel(context) {
    const output = (0, output_channel_1.getChannel)();
    try {
        // Run audit to get fresh data
        const output = (0, output_channel_1.getChannel)();
        try {
            // Run audit to get fresh data
            const report = await runAudit();
            currentReport = report;
            if (currentWebviewPanel) {
                // Panel exists, update it
                currentWebviewPanel.webview.html = getWebviewHtml(currentWebviewPanel.webview, report);
                currentWebviewPanel.reveal(vscode.ViewColumn.One);
                vscode.window.showInformationMessage('Test Coverage Dashboard updated.');
            }
            else {
                // Create new panel
                const workspaceRoot = vscode.workspace.workspaceFolders?.[0];
                if (!workspaceRoot) {
                    vscode.window.showErrorMessage('No workspace folder open. Cannot show test coverage dashboard.');
                    return;
                }
                currentWebviewPanel = vscode.window.createWebviewPanel(WEBVIEW_TYPE, 'Test Coverage Audit', vscode.ViewColumn.One, {
                    enableScripts: true,
                    enableForms: true,
                });
                currentWebviewPanel.webview.html = getWebviewHtml(currentWebviewPanel.webview, report);
                vscode.window.showInformationMessage('Test Coverage Dashboard opened.');
                // Handle webview messages
                currentWebviewPanel.webview.onDidReceiveMessage(async (message) => {
                    try {
                        switch (message.command) {
                            case 'refresh':
                                await openAuditPanel(context);
                                break;
                            case 'export':
                                await exportReportAsMarkdown();
                                break;
                            case 'generate':
                                await generateMissingTests();
                                await openAuditPanel(context);
                                break;
                        }
                    }
                    catch (err) {
                        vscode.window.showErrorMessage(`Test Coverage Dashboard error: ${err.message}`);
                    }
                });
                // Clean up on close
                currentWebviewPanel.onDidDispose(() => {
                    currentWebviewPanel = undefined;
                });
            }
        }
        catch (err) {
            vscode.window.showErrorMessage(`Audit failed: ${err && err.message ? err.message : err}`);
            output.appendLine(`❌ Audit error: ${err && err.message ? err.message : err}`);
        }
    }
    catch (err) {
        vscode.window.showErrorMessage(`Audit failed: ${err && err.message ? err.message : err}`);
        output.appendLine(`❌ Audit error: ${err && err.message ? err.message : err}`);
    }
}
/**
 * Export the current report as a markdown file
 */
async function exportReportAsMarkdown() {
    const output = (0, output_channel_1.getChannel)();
    try {
        if (!currentReport) {
            vscode.window.showErrorMessage('No audit report available');
            return;
        }
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceRoot) {
            throw new Error('No workspace folder');
        }
        // Run the audit script to generate the markdown report
        const cmd = `node "${path.join(workspaceRoot.uri.fsPath, 'scripts', 'audit-test-coverage.js')}"`;
        (0, child_process_1.execSync)(cmd, { cwd: workspaceRoot.uri.fsPath });
        // Find the generated report
        const reportsDir = path.join(workspaceRoot.uri.fsPath, 'docs', '_today');
        const files = fs.readdirSync(reportsDir).filter((f) => f.startsWith('test-coverage-audit-') && f.endsWith('.md'));
        if (files.length > 0) {
            const latestReport = files.sort().pop();
            const reportUri = vscode.Uri.file(path.join(reportsDir, latestReport));
            // Open the report
            const doc = await vscode.workspace.openTextDocument(reportUri);
            vscode.window.showTextDocument(doc, { preview: false });
            vscode.window.showInformationMessage(`✅ Report exported: ${latestReport}`);
            output.appendLine(`✅ Report exported to: ${reportUri.fsPath}`);
        }
    }
    catch (err) {
        vscode.window.showErrorMessage(`Export failed: ${err.message}`);
        output.appendLine(`❌ Export error: ${err.message}`);
    }
}
// ============================================================================
// FEATURE ACTIVATION/DEACTIVATION
// ============================================================================
/**
 * Activate the test coverage auditor feature
 */
function activate(context) {
    const output = (0, output_channel_1.getChannel)();
    output.appendLine('✅ Test Coverage Auditor activated');
    // Register commands
    const openCmd = vscode.commands.registerCommand(COMMAND_OPEN, () => openAuditPanel(context));
    const refreshCmd = vscode.commands.registerCommand(COMMAND_REFRESH, () => openAuditPanel(context));
    const exportCmd = vscode.commands.registerCommand(COMMAND_EXPORT, exportReportAsMarkdown);
    context.subscriptions.push(openCmd, refreshCmd, exportCmd);
}
/**
 * Deactivate the test coverage auditor feature
 */
function deactivate() {
    const output = (0, output_channel_1.getChannel)();
    output.appendLine('✅ Test Coverage Auditor deactivated');
    if (currentWebviewPanel) {
        currentWebviewPanel.dispose();
    }
}
//# sourceMappingURL=test-coverage-auditor.js.map