#!/usr/bin/env node

/**
 * audit-test-coverage.js — Test Coverage Audit Tool
 *
 * Analyzes your test suite against the tiered testing strategy:
 *  Tier 1: Static Compliance (linting, type checking)
 *  Tier 2: Unit Tests (isolated functions)
 *  Tier 3: Integration Tests (module interactions)
 *  Tier 4: Functional Tests (E2E features)
 *  Tier 5: Regression Tests (bug fixes)
 *
 * Scans:
 *  - Test files by location and naming pattern
 *  - Feature files in src/features/ for coverage
 *  - Bug registry (if exists) for untested bugs
 *  - Test case counts and tier distribution
 *
 * Outputs:
 *  - Console report with coverage summary
 *  - Datestamped markdown report: docs/_today/test-coverage-audit-YYYY-MM-DD.md
 *
 * Usage:
 *   node scripts/audit-test-coverage.js [--detailed] [--json]
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// CONFIGURATION
// ============================================================================

const config = {
  projectRoot: path.join(__dirname, '..'),
  srcDir: path.join(__dirname, '..', 'src'),
  testsDir: path.join(__dirname, '..', 'tests'),
  bugsFile: path.join(__dirname, '..', 'bug-registry.json'),
  reportsDir: path.join(__dirname, '..', 'docs', '_today'),
};

const TIER_PATTERNS = {
  TIER_1: {
    name: 'Static Compliance',
    dirs: ['compliance', 'linting', 'types', 'validation'],
    description: 'Type checking, linting, schema validation, code quality',
  },
  TIER_2: {
    name: 'Unit Tests',
    dirs: ['unit', 'utils', 'helpers', 'validators'],
    description: 'Isolated functions, business logic, edge cases',
  },
  TIER_3: {
    name: 'Integration Tests',
    dirs: ['integration', 'components', 'modules'],
    description: 'Module interactions, data flow, API mocks',
  },
  TIER_4: {
    name: 'Functional Tests',
    dirs: ['functional', 'e2e', 'ui', 'features'],
    description: 'User workflows, UI rendering, server responses',
  },
  TIER_5: {
    name: 'Regression Tests',
    dirs: ['regression', 'bugfixes', 'bugs'],
    description: 'Specific bug fixes, prevents re-breaking',
  },
};

// ============================================================================
// CORE AUDIT LOGIC
// ============================================================================

/**
 * Recursively scan directory for files matching pattern
 */
function scanDir(dir, pattern = /\.test\.(js|ts)$/, maxDepth = 3, depth = 0) {
  const results = [];
  if (depth > maxDepth || !fs.existsSync(dir)) return results;

  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    if (file.name.startsWith('.')) continue;

    const fullPath = path.join(dir, file.name);
    if (file.isDirectory()) {
      results.push(...scanDir(fullPath, pattern, maxDepth, depth + 1));
    } else if (pattern.test(file.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Categorize test file into tier based on directory pattern
 */
function classifyTier(filePath) {
  const fileName = path.basename(filePath).toLowerCase();
  const relativePath = path.relative(config.testsDir, filePath).toLowerCase();

  // Check for tier in directory patterns first
  for (const [tierKey, tierConfig] of Object.entries(TIER_PATTERNS)) {
    for (const dir of tierConfig.dirs) {
      if (relativePath.includes(dir + path.sep) || relativePath.startsWith(dir + path.sep)) {
        return { tier: tierKey, tierName: tierConfig.name };
      }
    }
  }

  // Fallback: classify by file naming patterns
  if (fileName.includes('regression') || fileName.includes('bug')) {
    return { tier: 'TIER_5', tierName: 'Regression Tests' };
  }
  if (fileName.includes('e2e') || fileName.includes('functional') || fileName.includes('feature')) {
    return { tier: 'TIER_4', tierName: 'Functional Tests' };
  }
  if (fileName.includes('integration')) {
    return { tier: 'TIER_3', tierName: 'Integration Tests' };
  }
  if (fileName.includes('unit') || fileName.includes('utils') || fileName.includes('helper')) {
    return { tier: 'TIER_2', tierName: 'Unit Tests' };
  }
  if (fileName.includes('compliance') || fileName.includes('lint') || fileName.includes('coverage')) {
    return { tier: 'TIER_1', tierName: 'Static Compliance' };
  }

  // Default: classify as Unit Tests (most common default)
  return { tier: 'TIER_2', tierName: 'Unit Tests' };
}

/**
 * Parse test file and extract test case count
 */
function parseTestFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const testCounts = {
    describe: (content.match(/describe\s*\(/g) || []).length,
    it: (content.match(/it\s*\(/g) || []).length,
    test: (content.match(/test\s*\(/g) || []).length,
  };
  const totalTests = testCounts.it + testCounts.test;
  const bugReferences = (content.match(/BUG-\d{4}-\d{2}-\d{2}-\d{3}/g) || []).length;

  return {
    testCounts,
    totalTests,
    bugReferences,
    sizeBytes: fs.statSync(filePath).size,
  };
}

/**
 * Scan feature files in src/features for coverage
 */
function scanFeatures() {
  const features = [];
  if (!fs.existsSync(config.srcDir)) return features;

  const featuresDir = path.join(config.srcDir, 'features');
  if (!fs.existsSync(featuresDir)) return features;

  const files = fs.readdirSync(featuresDir, { withFileTypes: true });
  for (const file of files) {
    if (file.isFile() && file.name.endsWith('.ts') && !file.name.endsWith('.README.md')) {
      features.push({
        name: file.name.replace('.ts', ''),
        path: path.join(featuresDir, file.name),
        hasTests: false,
      });
    } else if (file.isDirectory()) {
      const indexPath = path.join(featuresDir, file.name, 'index.ts');
      if (fs.existsSync(indexPath)) {
        features.push({
          name: file.name,
          path: indexPath,
          hasTests: false,
        });
      }
    }
  }

  return features;
}

/**
 * Load bug registry if it exists
 */
function loadBugRegistry() {
  if (!fs.existsSync(config.bugsFile)) return null;
  try {
    const content = fs.readFileSync(config.bugsFile, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    console.warn(`⚠️  Could not parse bug-registry.json: ${e.message}`);
    return null;
  }
}

/**
 * Calculate coverage metrics
 */
function calculateMetrics(testsByTier, features, bugRegistry) {
  const metrics = {
    totalTestFiles: Object.values(testsByTier).reduce((sum, tests) => sum + tests.length, 0),
    totalTestCases: Object.values(testsByTier).reduce((sum, tests) => {
      return sum + tests.reduce((t, test) => t + test.totalTests, 0);
    }, 0),
    featuresCovered: 0,
    featuresUncovered: 0,
    bugsTotal: bugRegistry ? bugRegistry.length : 0,
    bugsUntested: 0,
    tierCoverage: {},
  };

  // Count features with tests
  const testedFeatureNames = new Set();
  for (const tests of Object.values(testsByTier)) {
    for (const test of tests) {
      for (const feature of features) {
        if (test.filePath.includes(feature.name) || test.filePath.includes(feature.name.replace(/-/g, ''))) {
          testedFeatureNames.add(feature.name);
        }
      }
    }
  }

  metrics.featuresCovered = testedFeatureNames.size;
  metrics.featuresUncovered = features.length - testedFeatureNames.size;

  // Count untested bugs
  if (bugRegistry) {
    metrics.bugsUntested = bugRegistry.filter((bug) => !bug.regressionTests || bug.regressionTests.length === 0).length;
  }

  // Tier coverage percentages
  for (const [tier, tests] of Object.entries(testsByTier)) {
    const tierKey = Object.keys(TIER_PATTERNS).find((k) => k === tier);
    metrics.tierCoverage[tier] = {
      files: tests.length,
      testCases: tests.reduce((sum, t) => sum + t.totalTests, 0),
    };
  }

  return metrics;
}

// ============================================================================
// REPORTING
// ============================================================================

/**
 * Format test results as colored console output
 */
function formatConsoleReport(testsByTier, features, bugRegistry, metrics) {
  const lines = [];

  lines.push('\n╔═══════════════════════════════════════════════════════════════════╗');
  lines.push('║          TEST COVERAGE AUDIT — Tiered Testing Strategy          ║');
  lines.push('╚═══════════════════════════════════════════════════════════════════╝\n');

  // Summary
  lines.push('📊 SUMMARY');
  lines.push(`   Test Files: ${metrics.totalTestFiles}`);
  lines.push(`   Test Cases: ${metrics.totalTestCases}`);
  lines.push(`   Features Covered: ${metrics.featuresCovered}/${features.length}`);
  if (bugRegistry) {
    lines.push(`   Bugs Total: ${metrics.bugsTotal} | Untested: ${metrics.bugsUntested}`);
  }
  lines.push('');

  // Tier breakdown
  lines.push('📋 TIER BREAKDOWN');
  for (const [tierKey, tierConfig] of Object.entries(TIER_PATTERNS)) {
    const tests = testsByTier[tierKey] || [];
    const testCases = tests.reduce((sum, t) => sum + t.totalTests, 0);
    const status = tests.length === 0 ? '❌' : '✅';

    lines.push(`   ${status} ${tierConfig.name}`);
    lines.push(`      Files: ${tests.length} | Test Cases: ${testCases}`);

    if (tests.length > 0) {
      tests.forEach((test) => {
        const bugRef = test.bugReferences > 0 ? ` (${test.bugReferences} bug refs)` : '';
        lines.push(`        • ${path.relative(config.testsDir, test.filePath)}${bugRef}`);
      });
    }
    lines.push('');
  }

  // Coverage gaps
  lines.push('⚠️  COVERAGE GAPS');
  if (metrics.featuresUncovered > 0) {
    lines.push(`   ${metrics.featuresUncovered} features have no tests:`);
    for (const feature of features) {
      const hasTier2 = (testsByTier.TIER_2 || []).some((t) => t.filePath.includes(feature.name));
      if (!hasTier2) {
        lines.push(`     • ${feature.name}`);
      }
    }
    lines.push('');
  }

  if (metrics.bugsUntested > 0) {
    lines.push(`   ${metrics.bugsUntested} bugs without regression tests`);
    lines.push('     Add tests to Tier 5 (tests/regression/) with bugId references\n');
  }

  if (testsByTier.TIER_1 && testsByTier.TIER_1.length === 0) {
    lines.push('   ⚠️  NO TIER 1 (Compliance) tests found');
    lines.push('     Add linting, type checking, or schema validation tests\n');
  }

  lines.push('💡 RECOMMENDATIONS');
  if (metrics.featuresUncovered > features.length * 0.5) {
    lines.push('   Coverage is < 50%. Prioritize adding Tier 2 (unit) tests for each feature.\n');
  }
  if (metrics.bugsUntested > 0) {
    lines.push(`   Add regression tests in tests/regression/ for ${metrics.bugsUntested} bug(s).\n`);
  }
  if (!testsByTier.TIER_1 || testsByTier.TIER_1.length === 0) {
    lines.push('   Create Tier 1 compliance tests: type checking, linting, coverage.\n');
  }
  if (!testsByTier.TIER_3 || testsByTier.TIER_3.length === 0) {
    lines.push('   Add Tier 3 integration tests for module interactions.\n');
  }

  return lines.join('\n');
}

/**
 * Generate markdown report
 */
function formatMarkdownReport(testsByTier, features, bugRegistry, metrics) {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toTimeString().split(' ')[0];


  let md = `# Test Coverage Audit\n\n`;
  md += `**Date:** ${dateStr} ${timeStr}\n`;
  md += `**Project:** cielovista-tools\n`;
  md += `**Strategy:** Tiered Testing (Tiers 1–5)\n\n`;

  // ======= RECOMMENDATIONS AT TOP =======
  // Collect recommendations as before
  const recs = [];
  if (metrics.featuresUncovered > features.length * 0.5) {
    recs.push(
      `**High Priority:** Coverage is < 50%. Prioritize adding Tier 2 (unit) tests for each feature.`
    );
  }
  if (metrics.bugsUntested > 0) {
    recs.push(`Add Tier 5 (regression) tests for ${metrics.bugsUntested} bug(s) in \`tests/regression/\`.`);
  }
  if (!testsByTier.TIER_1 || testsByTier.TIER_1.length === 0) {
    recs.push(
      `Create Tier 1 compliance tests (type checking, linting, coverage) in \`tests/compliance/\`.`
    );
  }
  if (!testsByTier.TIER_3 || testsByTier.TIER_3.length === 0) {
    recs.push(`Add Tier 3 integration tests for module interactions in \`tests/integration/\`.`);
  }
  if (!testsByTier.TIER_4 || testsByTier.TIER_4.length === 0) {
    recs.push(`Add Tier 4 functional tests (E2E) for user-facing workflows in \`tests/functional/\`.`);
  }

  // ======= SUMMARY EXPLANATION =======
  let summaryLine = '';
  if (metrics.featuresCovered === 0) {
    summaryLine = '**🚨 Major Gaps:** No features have full test coverage. Immediate action required!**';
  } else if (metrics.featuresCovered < features.length * 0.5) {
    summaryLine = `**⚠️ Low Coverage:** Only ${metrics.featuresCovered} of ${features.length} features have tests.**`;
  } else {
    summaryLine = `**ℹ️ Coverage Status:** ${metrics.featuresCovered} of ${features.length} features have tests.**`;
  }

  md += `> ${summaryLine}\n\n`;
  if (recs.length > 0) {
    md += `> **💡 Actionable Recommendations:**\n`;
    recs.forEach((rec, idx) => {
      md += `> - [ ] ${rec}\n`;
    });
    md += `\n`;
  }

  // ======= END RECOMMENDATIONS AT TOP =======

  // Summary
  md += `## 📊 Summary\n\n`;
  md += `| Metric | Count |\n`;
  md += `|---|---|\n`;
  md += `| Test Files | ${metrics.totalTestFiles} |\n`;
  md += `| Test Cases | ${metrics.totalTestCases} |\n`;
  md += `| Features Covered | ${metrics.featuresCovered}/${features.length} |\n`;
  if (bugRegistry) {
    md += `| Bugs (Total) | ${metrics.bugsTotal} |\n`;
    md += `| Bugs (Untested) | ${metrics.bugsUntested} |\n`;
  }
  md += `\n`;

  // Tier breakdown
  md += `## 📋 Tier Breakdown\n\n`;
  for (const [tierKey, tierConfig] of Object.entries(TIER_PATTERNS)) {
    const tests = testsByTier[tierKey] || [];
    const testCases = tests.reduce((sum, t) => sum + t.totalTests, 0);
    const status = tests.length === 0 ? '❌ Missing' : '✅ Present';

    md += `### ${tierKey}: ${tierConfig.name} — ${status}\n\n`;
    md += `**Description:** ${tierConfig.description}\n\n`;

    if (tests.length > 0) {
      md += `**Files:** ${tests.length} | **Test Cases:** ${testCases}\n\n`;
      md += `| Test File | Test Cases | Bug Refs |\n`;
      md += `|---|---|---|\n`;
      tests.forEach((test) => {
        const rel = path.relative(config.testsDir, test.filePath);
        const bugs = test.bugReferences > 0 ? test.bugReferences : '—';
        md += `| \`${rel}\` | ${test.totalTests} | ${bugs} |\n`;
      });
      md += `\n`;
    } else {
      md += `**Status:** No tests found in this tier.\n\n`;
    }
  }

  // Features coverage matrix
  md += `## 🎯 Feature Coverage Matrix\n\n`;

  const testedFeaturesByTier = {};
  for (const [tierKey, tests] of Object.entries(testsByTier)) {
    testedFeaturesByTier[tierKey] = new Set();
    for (const test of tests) {
      for (const feature of features) {
        if (
          test.filePath.includes(feature.name) ||
          test.filePath.includes(feature.name.replace(/-/g, ''))
        ) {
          testedFeaturesByTier[tierKey].add(feature.name);
        }
      }
    }
  }

  md += `| Feature | Tier 1 | Tier 2 | Tier 3 | Tier 4 | Tier 5 |\n`;
  md += `|---|---|---|---|---|---|\n`;
  features.forEach((feature) => {
    let row = `| \`${feature.name}\` |`;
    for (const tierKey of Object.keys(TIER_PATTERNS)) {
      const covered = testedFeaturesByTier[tierKey] && testedFeaturesByTier[tierKey].has(feature.name);
      row += ` ${covered ? '✅' : '—'} |`;
    }
    md += `${row}\n`;
  });
  md += `\n`;

  // Gaps
  md += `## ⚠️ Coverage Gaps\n\n`;

  const uncovered = features.filter(
    (f) => !(testedFeaturesByTier.TIER_2 && testedFeaturesByTier.TIER_2.has(f.name))
  );
  if (uncovered.length > 0) {
    md += `### Features Without Unit Tests (Tier 2)\n\n`;
    uncovered.forEach((f) => {
      md += `- \`${f.name}\` — ${path.relative(config.srcDir, f.path)}\n`;
    });
    md += `\n`;
  }

  const missingTiers = [];
  for (const [tierKey, tierConfig] of Object.entries(TIER_PATTERNS)) {
    if (!testsByTier[tierKey] || testsByTier[tierKey].length === 0) {
      missingTiers.push(`${tierKey}: ${tierConfig.name}`);
    }
  }
  if (missingTiers.length > 0) {
    md += `### Missing Tier(s)\n\n`;
    missingTiers.forEach((t) => {
      md += `- ❌ ${t}\n`;
    });
    md += `\n`;
  }

  if (bugRegistry && metrics.bugsUntested > 0) {
    md += `### Bugs Without Regression Tests\n\n`;
    bugRegistry
      .filter((bug) => !bug.regressionTests || bug.regressionTests.length === 0)
      .forEach((bug) => {
        md += `- ${bug.id}: ${bug.title} (Severity: ${bug.severity})\n`;
      });
    md += `\n`;
  }


  // Recommendations section is now at the top; optionally, keep a short section here for reference
  // md += `## 💡 Recommendations (see top)\n\n`;

  // Metadata
  md += `---\n\n`;
  md += `**Generated:** ${new Date().toISOString()}\n`;
  md += `**Command:** \`node scripts/audit-test-coverage.js\`\n`;

  return md;
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

function main() {
  // Parse CLI arguments
  const args = process.argv.slice(2);
  const detailed = args.includes('--detailed');
  const jsonOutput = args.includes('--json');

  // Ensure reports directory exists
  if (!fs.existsSync(config.reportsDir)) {
    fs.mkdirSync(config.reportsDir, { recursive: true });
  }

  // Scan tests
  const allTestFiles = scanDir(config.testsDir, /\.test\.(js|ts)$/);
  const testsByTier = {};

  for (const testFile of allTestFiles) {
    const { tier, tierName } = classifyTier(testFile);
    const parsed = parseTestFile(testFile);

    if (!testsByTier[tier]) testsByTier[tier] = [];
    testsByTier[tier].push({
      filePath: testFile,
      tier,
      tierName,
      ...parsed,
    });
  }

  // Scan features
  const features = scanFeatures();

  // Load bug registry
  const bugRegistry = loadBugRegistry();

  // Calculate metrics
  const metrics = calculateMetrics(testsByTier, features, bugRegistry);

  // Generate reports
  const consoleReport = formatConsoleReport(testsByTier, features, bugRegistry, metrics);
  const markdownReport = formatMarkdownReport(testsByTier, features, bugRegistry, metrics);

  // Write markdown report
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const reportPath = path.join(config.reportsDir, `test-coverage-audit-${dateStr}.md`);
  fs.writeFileSync(reportPath, markdownReport, 'utf8');

  if (jsonOutput) {
    // Only output JSON, suppress all other output
    const jsonReport = {
      timestamp: now.toISOString(),
      metrics: {
        ...metrics,
        featuresTotal: features.length
      },
      testsByTier: Object.entries(testsByTier).reduce((acc, [tier, tests]) => {
        acc[tier] = tests.map((t) => ({
          file: path.relative(config.testsDir, t.filePath),
          tests: t.totalTests,
          bugs: t.bugReferences,
        }));
        return acc;
      }, {}),
      features: features.map((f) => ({
        name: f.name,
        path: path.relative(config.srcDir, f.path),
      })),
    };
    console.log(JSON.stringify(jsonReport, null, 2));
    return;
  }

  // Output console report (only if not --json)
  console.log('🔍 Scanning test files...\n');
  console.log(consoleReport);
  console.log(`\n✅ Report saved: ${path.relative(config.projectRoot, reportPath)}\n`);
}

main();
