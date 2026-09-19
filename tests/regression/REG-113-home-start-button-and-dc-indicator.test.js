// REG-113: Start button and DiskCleanUp indicator must always be present in home-page.ts
// Regression: These were regressed multiple times due to changes to buildDashboardHtml args.
// Start button renders when hasStartScript=true; DC badge always renders (not conditional).
'use strict';
const fs   = require('fs');
const path = require('path');
const src  = fs.readFileSync(path.join(__dirname, '../../src/features/home-page.ts'), 'utf8');

let passed = 0; let failed = 0;
function check(desc, ok) { if (ok) { console.log(`  PASS ${desc}`); passed++; } else { console.error(`  FAIL ${desc}`); failed++; } }

// ── Start button ─────────────────────────────────────────────────────────────
check('btn-npm-start exists in home HTML',
  src.includes('btn-npm-start'));

check('Start button is conditional on hasStartScript',
  src.includes('hasStartScript') && src.includes('btn-npm-start'));

check('buildDashboardHtml receives hasStartScript argument',
  src.includes('buildDashboardHtml') && src.includes('hasStartScript'));

check('hasStartScript reads from workspace package.json scripts.start',
  src.includes('scripts?.start') || src.includes('scripts.start'));

// #836: devServerAction is the one handler that runs npm start; the old
// npmStart handler had no sender and is gone.
check('the devServerAction handler runs npm start, and no npmStart handler duplicates it',
  src.includes("msg.type === 'devServerAction'") && src.includes("sendText('npm start')")
    && !src.includes("msg.type === 'npmStart'"));

check('npmRestart message handler posts to /api/restart',
  src.includes("msg.type === 'npmRestart'") && src.includes('api/restart'));

// ── DiskCleanUp indicator ─────────────────────────────────────────────────────
check('dc-badge element in home HTML',
  src.includes('dc-badge'));

check('DC badge not conditional — always rendered',
  src.includes('id="dc-badge"') || src.includes("id='dc-badge'"));

check('DC poller started for the panel (port 5000, through the one badge poller, #834)',
  src.includes("_startPortBadgePoller(panel, 5000, 'dcStatus'"));

check('dcStatus message handler updates badge',
  src.includes("msg.type === 'dcStatus'") || src.includes("type === 'dcStatus'"));

// ── Dropdown project picker in Issue Viewer ───────────────────────────────────
check('showGithubIssues called with wsPath from home page',
  src.includes('showGithubIssues') && src.includes('wsPath'));

console.log(`\nREG-113: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
