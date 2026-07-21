// REG-118: The home page's Start button reflects the CURRENT workspace's own
// dev-server port (.claude/launch.json, default 4000), not the DiskCleanUp
// backend's port 5000. One consolidated "Start" button opens the dev server
// if it's already running, or launches `npm start` if not; a separate
// devserver-badge (green/red) shows live status independent of the DC badge.
'use strict';
const fs   = require('fs');
const path = require('path');
const src  = fs.readFileSync(path.join(__dirname, '../../src/features/home-page.ts'), 'utf8');
const cfgSrc = fs.readFileSync(path.join(__dirname, '../../src/shared/dev-server-config.ts'), 'utf8');

let passed = 0; let failed = 0;
function check(desc, ok) { if (ok) { console.log(`  PASS ${desc}`); passed++; } else { console.error(`  FAIL ${desc}`); failed++; } }

check('dev-server-config.ts reads .claude/launch.json for a port',
  cfgSrc.includes('launch.json') && cfgSrc.includes('port'));

check('dev-server-config.ts falls back to a default port and landing page',
  cfgSrc.includes('DEFAULT_PORT') && cfgSrc.includes('DEFAULT_LANDING_PAGE'));

check('home-page.ts imports getDevServerConfig',
  src.includes("from '../shared/dev-server-config'"));

check('a devserver poller is started, separate from the DC poller',
  src.includes('_startDevServerPoller') && src.includes('_startDcPoller'));

check('devServerAction message handler checks port and opens-or-starts',
  src.includes("msg.type === 'devServerAction'") && src.includes('isPortOpen') && src.includes('openExternal'));

check('devServerStatus message updates a devserver-badge, not the dc-badge',
  src.includes("msg.type === 'devServerStatus'") && src.includes('devserver-badge'));

check('the Start button posts devServerAction, not the old npmStart-only flow',
  src.includes("vsc.postMessage({ type: 'devServerAction' })"));

check('the old separate Restart button/toggle is gone from the header markup',
  !src.includes('id="btn-npm-restart"'));

check('npmRestart message handler still exists (kept for other DC-specific callers)',
  src.includes("msg.type === 'npmRestart'") && src.includes('api/restart'));

console.log(`\nREG-118: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
