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
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { getChannel, log } from '../shared/output-channel';
import { logError } from '../shared/error-log';
import { getNonce } from '../shared/webview-utils';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Tier breakdown with files and test counts
 */
interface TierData {
  tier: string;
  name: string;
  description: string;
  files: number;
  testCases: number;
  present: boolean;
}

interface TierTestFile {
  file: string;
  tests: number;
  bugs: number;
}

interface FeatureCoverageData {
  name: string;
  path: string;
  unitTests: number;
}

/**
 * Audit report structure
 */
interface AuditReport {
  timestamp: string;
  totalTestFiles: number;
  totalTestCases: number;
  featuresCovered: number;
  featuresTotal: number;
  coveragePercent: number;
  tiers: TierData[];
  tierDetails: Record<string, TierTestFile[]>;
  features: FeatureCoverageData[];
  gaps: string[];
  recommendations: { priority: 'HIGH' | 'MEDIUM' | 'LOW'; text: string }[];
  bugsUntested: number;
  bugsTotal: number;
}

function extractBalancedJsonObject(text: string, startIdx: number): string | undefined {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') {
      depth++;
      continue;
    }

    if (ch === '}') {
      depth--;
      if (depth === 0) {
        return text.slice(startIdx, i + 1);
      }
    }
  }

  return undefined;
}

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

let currentWebviewPanel: vscode.WebviewPanel | undefined;
let currentReport: AuditReport | undefined;

// ============================================================================
// AUDIT EXECUTION
// ============================================================================

/**
 * Run the test coverage audit by executing the Node script
 * Returns parsed JSON report
 */
async function runAudit(): Promise<AuditReport> {
  const output = getChannel();
  output.appendLine('🔍 Running test coverage audit...');

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    const err = new Error('No workspace folder open — cannot run audit-test-coverage.js');
    logError('No workspace folder open — cannot run audit-test-coverage.js', err.stack || String(err), { context: 'test-coverage-auditor' });
    throw err;
  }

  const scriptPath = path.join(workspaceRoot, 'scripts', 'audit-test-coverage.js');
  if (!require('fs').existsSync(scriptPath)) {
    const err = new Error(`audit-test-coverage.js not found at: ${scriptPath} — this script only exists in the cielovista-tools project, not in ${path.basename(workspaceRoot)}`);
    logError(`audit-test-coverage.js not found at: ${scriptPath} — this script only exists in the cielovista-tools project, not in ${path.basename(workspaceRoot)}`, err.stack || String(err), { context: 'test-coverage-auditor' });
    throw err;
  }

  let rawOutput = '';
  try {
    const cmd = `node "${scriptPath}" --json`;
    rawOutput = execSync(cmd, { encoding: 'utf8', cwd: workspaceRoot, stdio: 'pipe' });
  } catch (execErr: any) {
    // execSync throws when exit code != 0 — capture stdout/stderr from the error object
    rawOutput = execErr.stdout || '';
    const stderr = execErr.stderr || '';
    if (!rawOutput.trim()) {
      const err = new Error(`audit-test-coverage.js crashed with no output. stderr: ${stderr.slice(0, 300)}`);
      logError(`audit-test-coverage.js crashed with no output. stderr: ${stderr.slice(0, 300)}`, err.stack || String(err), { context: 'test-coverage-auditor' });
      throw err;
    }
  }

  const lines = rawOutput.split('\n').map(l => l.trim()).filter(Boolean);

  let metricsJson: any;
  let parsed = false;

  // Preferred: parse the whole output (works when script emits only JSON).
  const trimmed = rawOutput.trim();
  if (trimmed.startsWith('{')) {
    try {
      metricsJson = JSON.parse(trimmed);
      parsed = true;
    } catch {
      // Fall through to extraction mode below.
    }
  }

  // Fallback: scan for balanced JSON objects and parse the first one with metrics.
  if (!parsed) {
    let sawCandidate = false;
    let lastParseError = '';
    let lastSnippet = '';

    for (let i = 0; i < rawOutput.length; i++) {
      if (rawOutput[i] !== '{') { continue; }
      const candidate = extractBalancedJsonObject(rawOutput, i);
      if (!candidate) { continue; }
      sawCandidate = true;

      try {
        const parsedCandidate = JSON.parse(candidate);
        if (parsedCandidate && typeof parsedCandidate === 'object' && parsedCandidate.metrics) {
          metricsJson = parsedCandidate;
          parsed = true;
          break;
        }
      } catch (parseErr: any) {
        lastParseError = parseErr.message;
        lastSnippet = candidate.slice(0, 200).replace(/\s+/g, ' ');
      }
    }

    if (!parsed && sawCandidate && lastParseError) {
      const err = new Error(`JSON.parse failed on script output. Parse error: ${lastParseError}. Offending payload (first 200 chars): ${lastSnippet}`);
      logError(`JSON.parse failed on script output. Parse error: ${lastParseError}. Offending payload (first 200 chars): ${lastSnippet}`, err.stack || String(err), { context: 'test-coverage-auditor' });
      throw err;
    }
  }

  if (!parsed) {
    const preview = lines.slice(-8).join(' | ');
    const err = new Error(`audit-test-coverage.js produced no parseable JSON output. Last output: ${preview}`);
    logError(`audit-test-coverage.js produced no parseable JSON output. Last output: ${preview}`, err.stack || String(err), { context: 'test-coverage-auditor' });
    throw err;
  }

  output.appendLine(`✅ Audit complete: ${metricsJson.metrics?.totalTestFiles ?? '?'} files, ${metricsJson.metrics?.totalTestCases ?? '?'} tests`);
  return formatAuditReport(metricsJson);
}

function generateMarkdownFromReport(report: AuditReport): string {
    const date = new Date(report.timestamp).toLocaleString();
    const tierRows = report.tiers.map(t =>
        `| ${t.tier} | ${t.name} | ${t.present ? '✅' : '❌'} | ${t.files} | ${t.testCases} |`
    ).join('\n');
    const gapLines  = report.gaps.map(g => `- ${g}`).join('\n') || '_None_';
    const recLines  = report.recommendations.map(r => `- **[${r.priority}]** ${r.text}`).join('\n') || '_None_';
    return [
        `# Test Coverage Audit`,
        ``,
        `**Date:** ${date}  **Project:** cielovista-tools  **Strategy:** Tiered Testing (Tiers 1–5)`,
        ``,
        `## Summary`,
        ``,
        `| Metric | Count |`,
        `|--------|-------|`,
        `| Test Files | ${report.totalTestFiles} |`,
        `| Test Cases | ${report.totalTestCases} |`,
        `| Features Covered | ${report.featuresCovered}/${report.featuresTotal} |`,
        `| Coverage % | ${report.coveragePercent}% |`,
        report.bugsTotal > 0 ? `| Bugs (Untested) | ${report.bugsUntested}/${report.bugsTotal} |` : '',
        ``,
        `## Tier Breakdown`,
        ``,
        `| Tier | Name | Present | Files | Test Cases |`,
        `|------|------|---------|-------|------------|`,
        tierRows,
        ``,
        `## Coverage Gaps`,
        ``,
        gapLines,
        ``,
        `## Recommendations`,
        ``,
        recLines,
    ].filter(l => l !== undefined).join('\n');
}

/**
 * Convert raw metrics JSON to AuditReport format
 */
function formatAuditReport(metricsJson: any): AuditReport {
  const metrics = metricsJson.metrics;
  const coveragePercent = metrics.featuresTotal > 0 ? Math.round((metrics.featuresCovered / metrics.featuresTotal) * 100) : 0;
  const tierDetails: Record<string, TierTestFile[]> = metricsJson.testsByTier || {};

  // Map tiers
  const tierMap: { [key: string]: string } = {
    TIER_1: 'Static Compliance',
    TIER_2: 'Unit Tests',
    TIER_3: 'Integration Tests',
    TIER_4: 'Functional Tests',
    TIER_5: 'Regression Tests',
  };

  const descriptions: { [key: string]: string } = {
    TIER_1: 'Type checking, linting, schema validation',
    TIER_2: 'Isolated functions, business logic, edge cases',
    TIER_3: 'Module interactions, data flow, API mocks',
    TIER_4: 'User workflows, UI rendering, server responses',
    TIER_5: 'Bug fixes, prevents re-breaking',
  };

  const tiers: TierData[] = ['TIER_1', 'TIER_2', 'TIER_3', 'TIER_4', 'TIER_5'].map((tierKey) => {
    const tierTests = tierDetails[tierKey] || [];
    const testCases = tierTests.reduce((sum: number, t: any) => sum + (t.tests || 0), 0);

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
  const gaps: string[] = [];
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
  const recommendations: { priority: 'HIGH' | 'MEDIUM' | 'LOW'; text: string }[] = [];
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

  const features: FeatureCoverageData[] = (metricsJson.features || []).map((feature: any) => {
    const name = String(feature.name || '');
    const normalizedName = name.toLowerCase().replace(/[-_]/g, '');
    const unitTests = (tierDetails.TIER_2 || []).reduce((sum: number, testFile: TierTestFile) => {
      const filePath = String(testFile.file || '').toLowerCase();
      const matched = filePath.includes(name.toLowerCase()) || filePath.includes(normalizedName);
      return matched ? sum + (testFile.tests || 0) : sum;
    }, 0);

    return {
      name,
      path: String(feature.path || ''),
      unitTests,
    };
  });

  return {
    timestamp: new Date().toISOString(),
    totalTestFiles: metrics.totalTestFiles,
    totalTestCases: metrics.totalTestCases,
    featuresCovered: metrics.featuresCovered,
    featuresTotal: metrics.featuresTotal,
    coveragePercent,
    tiers,
    tierDetails,
    features,
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
function safeJson(value: unknown): string {
  // JSON.stringify does not escape </script>, which causes document.write() to
  // break when VS Code's webview framework wraps the HTML. Replace it so the
  // script tag can never be prematurely closed by data embedded in the JSON.
  return JSON.stringify(value).replace(/<\/script>/gi, '<\\/script>');
}

function getWebviewHtml(webview: vscode.Webview, report: AuditReport, mdContent: string): string {
  const nonce = getNonce();

  // Determine coverage color
  const coverageColor = report.coveragePercent >= 70 ? '#4CAF50' : report.coveragePercent >= 40 ? '#FFC107' : '#F44336';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
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
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease;
  }

  .tier:hover {
    border-left-color: #64B5F6;
    background: rgba(100, 181, 246, 0.12);
  }

  .tier.active {
    border-left-color: #64B5F6;
    box-shadow: inset 0 0 0 1px rgba(100, 181, 246, 0.35);
  }
  
  .tier.present {
    border-left-color: #4CAF50;
    background: rgba(76, 175, 80, 0.1);
  }

  .tier.missing {
    border-left-color: #F44336;
    background: rgba(244, 67, 54, 0.1);
  }

  .tier.present.active,
  .tier.missing.active {
    border-left-color: #64B5F6;
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

  .tier-cta {
    font-size: 11px;
    color: #90CAF9;
    margin-top: 6px;
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

  .details-card {
    background: #252526;
    border: 1px solid #3E3E42;
    border-radius: 6px;
    padding: 12px;
    margin-top: 12px;
  }

  .details-title {
    font-size: 13px;
    color: #fff;
    font-weight: 600;
    margin-bottom: 10px;
  }

  table.details-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }

  table.details-table th,
  table.details-table td {
    border-bottom: 1px solid #333;
    padding: 8px;
    text-align: left;
  }

  table.details-table th {
    color: #90CAF9;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .empty-state {
    color: #aaa;
    font-size: 12px;
  }
</style>
</head>
<body>

<h1>📊 Test Coverage Audit</h1>

<div class="button-group">
  <button id="btn-refresh">🔄 Refresh Audit</button>
  <button id="btn-export" class="secondary">📄 Export as Markdown</button>
  <button id="btn-copy-md" class="secondary">📋 Copy to Clipboard</button>
  <button id="btn-copy-chat" class="secondary">💬 Copy to GitHub Chat</button>
  <button id="btn-generate" style="background: #F44336;">📝 Generate Unit Tests</button>
</div>
<div id="copy-toast" style="display:none;position:fixed;bottom:20px;right:20px;background:#4CAF50;color:#fff;padding:8px 16px;border-radius:4px;font-size:13px;z-index:999">✅ Copied!</div>

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
  ${
    report.bugsTotal > 0
      ? `<div class="metric">
    <div class="metric-label">Bugs (Untested)</div>
    <div class="metric-value">${report.bugsUntested}/${report.bugsTotal}</div>
  </div>`
      : ''
  }
</div>

<h2>📋 Tier Breakdown</h2>
${report.tiers
  .map(
    (tier) => `
<div class="tier ${tier.present ? 'present' : 'missing'}" data-tier="${tier.tier}">
  <div class="tier-left">
    <div class="tier-name">${tier.present ? '✅' : '❌'} ${tier.name}</div>
    <div class="tier-desc">${tier.description}</div>
    ${tier.present ? `<div class="tier-stats">${tier.files} files • ${tier.testCases} test cases</div>` : '<div class="tier-stats">No tests found</div>'}
    <div class="tier-cta">Click to view all test files and test-case counts</div>
  </div>
</div>
`
  )
  .join('')}

<div class="details-card" id="tier-details-panel">
  <div class="details-title" id="tier-details-title">Select a tier row to view all test cases.</div>
  <div id="tier-details-body" class="empty-state">No tier selected.</div>
</div>

<h2>🧩 Features Missing Unit Tests</h2>
<div class="details-card">
  <table class="details-table">
    <thead>
      <tr>
        <th>Feature</th>
        <th>Path</th>
        <th>Unit Test Cases</th>
      </tr>
    </thead>
    <tbody>
      ${report.features
        .filter((f) => f.unitTests === 0)
        .map(
          (f) => `
      <tr>
        <td>${f.name}</td>
        <td>${f.path}</td>
        <td>0</td>
      </tr>
      `
        )
        .join('') || '<tr><td colspan="3">All features currently have unit test coverage.</td></tr>'}
    </tbody>
  </table>
</div>

${
  report.gaps.length > 0
    ? `
<h2>⚠️ Coverage Gaps</h2>
${report.gaps.map((gap) => `<div class="gap">• ${gap}</div>`).join('')}
`
    : ''
}

${
  report.recommendations.length > 0
    ? `
<h2>💡 Recommendations</h2>
${report.recommendations
  .map(
    (rec) => `
<div class="recommendation ${rec.priority.toLowerCase()}">
  <span class="rec-priority ${rec.priority.toLowerCase()}">${rec.priority}</span>
  ${rec.text}
</div>
`
  )
  .join('')}
`
    : ''
}

<div class="timestamp">
Generated: ${new Date(report.timestamp).toLocaleString()}
</div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const MD_CONTENT = ${safeJson(mdContent)};
  const REPORT_DATA = ${safeJson(report)};
  let selectedTierKey = '';

  function refresh() { vscode.postMessage({ command: 'refresh' }); }
  function exportReport() { vscode.postMessage({ command: 'export' }); }
  function generateTests() {
    const confirmed = confirm('Generate unit test skeleton files for features without tests?');
    if (confirmed) { vscode.postMessage({ command: 'generate' }); }
  }

  function showToast(msg) {
    var t = document.getElementById('copy-toast');
    t.textContent = msg;
    t.style.display = 'block';
    setTimeout(function(){ t.style.display = 'none'; }, 2000);
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(function(){
      showToast('✅ Copied to clipboard!');
    }).catch(function(){
      vscode.postMessage({ command: 'copyFallback', text: text });
    });
  }

  function escHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;');
  }

  function formatTierMarkdown(tierKey) {
    if (!tierKey) {
      return '';
    }

    const tier = (REPORT_DATA.tiers || []).find(function(t) { return t.tier === tierKey; });
    const rows = (REPORT_DATA.tierDetails && REPORT_DATA.tierDetails[tierKey]) || [];
    if (!tier) {
      return '';
    }

    const header = '### Selected Tier: ' + tier.name + ' (' + tier.tier + ')\n\n';
    if (!rows.length) {
      return header + '_No test files found in this tier._';
    }

    const tableRows = rows.map(function(row) {
      return '| ' + row.file + ' | ' + (row.tests || 0) + ' | ' + (row.bugs || 0) + ' |';
    }).join('\n');

    return header +
      '| Test File | Test Cases | Bug Refs |\n' +
      '|---|---:|---:|\n' +
      tableRows;
  }

  function buildChatPayload() {
    const tierSection = formatTierMarkdown(selectedTierKey);
    const suffix = tierSection ? ('\n\n' + tierSection) : '';
    return '@workspace Here is the current Test Coverage Audit dashboard for cielovista-tools:\n\n' + MD_CONTENT + suffix;
  }

  function renderTierDetails(tierKey) {
    selectedTierKey = tierKey;
    const tiers = REPORT_DATA.tiers || [];
    const tier = tiers.find(function(t) { return t.tier === tierKey; });
    const titleEl = document.getElementById('tier-details-title');
    const bodyEl = document.getElementById('tier-details-body');

    document.querySelectorAll('.tier').forEach(function(el) {
      if (el.getAttribute('data-tier') === tierKey) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });

    if (!tier) {
      titleEl.textContent = 'Select a tier row to view all test cases.';
      bodyEl.innerHTML = '<div class="empty-state">No tier selected.</div>';
      return;
    }

    const rows = (REPORT_DATA.tierDetails && REPORT_DATA.tierDetails[tierKey]) || [];
    titleEl.textContent = tier.name + ' (' + tier.tier + ')';

    if (!rows.length) {
      bodyEl.innerHTML = '<div class="empty-state">No tests found in this tier.</div>';
      return;
    }

    const rowHtml = rows.map(function(row) {
      return '<tr>' +
        '<td>' + escHtml(row.file) + '</td>' +
        '<td>' + (row.tests || 0) + '</td>' +
        '<td>' + (row.bugs || 0) + '</td>' +
      '</tr>';
    }).join('');

    bodyEl.innerHTML = '' +
      '<table class="details-table">' +
      '  <thead>' +
      '    <tr><th>Test File</th><th>Test Cases</th><th>Bug Refs</th></tr>' +
      '  </thead>' +
      '  <tbody>' + rowHtml + '</tbody>' +
      '</table>';
  }

  document.getElementById('btn-refresh').addEventListener('click', refresh);
  document.getElementById('btn-export').addEventListener('click', exportReport);
  document.getElementById('btn-generate').addEventListener('click', generateTests);
  document.getElementById('btn-copy-md').addEventListener('click', function(){
    copyToClipboard(MD_CONTENT);
  });
  document.getElementById('btn-copy-chat').addEventListener('click', function(){
    copyToClipboard(buildChatPayload());
    showToast('✅ Copied for GitHub Chat!');
  });

  document.querySelectorAll('.tier').forEach(function(rowEl){
    rowEl.addEventListener('click', function(){
      const tierKey = rowEl.getAttribute('data-tier') || '';
      renderTierDetails(tierKey);
    });
  });

  const initialTier = (REPORT_DATA.tiers || []).find(function(t) { return t.present; }) || (REPORT_DATA.tiers || [])[0];
  if (initialTier) {
    renderTierDetails(initialTier.tier);
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
async function generateMissingTests(): Promise<void> {
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
    const generatedFiles: string[] = [];

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
  } catch (err: any) {
    vscode.window.showErrorMessage(`Failed to generate tests: ${err.message}`);
  }
}

/**
 * Generate a skeleton test file for a feature
 */
function generateTestSkeleton(featureName: string): string {
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
async function openAuditPanel(context: vscode.ExtensionContext): Promise<void> {
  const output = getChannel();

  try {
    // Run audit to get fresh data
    const output = getChannel();
    try {
      // Run audit to get fresh data
      const report = await runAudit();
      currentReport = report;

      const mdContent = generateMarkdownFromReport(report);

      if (currentWebviewPanel) {
        // Panel exists, update it
        currentWebviewPanel.webview.html = getWebviewHtml(currentWebviewPanel.webview, report, mdContent);
        currentWebviewPanel.reveal(vscode.ViewColumn.One);
        vscode.window.showInformationMessage('Test Coverage Dashboard updated.');
      } else {
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

        currentWebviewPanel.webview.html = getWebviewHtml(currentWebviewPanel.webview, report, mdContent);
        vscode.window.showInformationMessage('Test Coverage Dashboard opened.');

        // Register message handler once at panel creation — survives HTML replacements.
        // Do NOT re-register in the refresh/update path or messages will be dropped.
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
              case 'copyFallback':
                await vscode.env.clipboard.writeText(message.text ?? '');
                vscode.window.showInformationMessage('✅ Copied to clipboard!');
                break;
            }
          } catch (err: any) {
            vscode.window.showErrorMessage(`Test Coverage Dashboard error: ${err.message}`);
          }
        }, undefined, context.subscriptions);

        // Clean up on close
        currentWebviewPanel.onDidDispose(() => {
          currentWebviewPanel = undefined;
        }, undefined, context.subscriptions);
      }
    } catch (err: any) {
      vscode.window.showErrorMessage(`Audit failed: ${err && err.message ? err.message : err}`);
      output.appendLine(`❌ Audit error: ${err && err.message ? err.message : err}`);
    }
  } catch (err: any) {
    vscode.window.showErrorMessage(`Audit failed: ${err && err.message ? err.message : err}`);
    output.appendLine(`❌ Audit error: ${err && err.message ? err.message : err}`);
  }
}

/**
 * Export the current report as a markdown file
 */
async function exportReportAsMarkdown(): Promise<void> {
  const output = getChannel();

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
    execSync(cmd, { cwd: workspaceRoot.uri.fsPath });

    // Find the generated report
    const reportsDir = path.join(workspaceRoot.uri.fsPath, 'docs', '_today');
    const files = fs.readdirSync(reportsDir).filter((f) => f.startsWith('test-coverage-audit-') && f.endsWith('.md'));

    if (files.length > 0) {
      const latestReport = files.sort().pop();
      const reportUri = vscode.Uri.file(path.join(reportsDir, latestReport!));

      // Open the report
      const doc = await vscode.workspace.openTextDocument(reportUri);
      vscode.window.showTextDocument(doc, { preview: false });

      vscode.window.showInformationMessage(`✅ Report exported: ${latestReport}`);
      output.appendLine(`✅ Report exported to: ${reportUri.fsPath}`);
    }
  } catch (err: any) {
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
export function activate(context: vscode.ExtensionContext): void {
  const output = getChannel();
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
export function deactivate(): void {
  const output = getChannel();
  output.appendLine('✅ Test Coverage Auditor deactivated');

  if (currentWebviewPanel) {
    currentWebviewPanel.dispose();
  }
}
