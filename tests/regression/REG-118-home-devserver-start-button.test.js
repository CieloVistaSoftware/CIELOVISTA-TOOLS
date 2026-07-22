// REG-118: The home page's Start button reflects the CURRENT workspace's own
// dev-server port (.claude/launch.json, default 4000), not the DiskCleanUp
// backend's port 5000. One consolidated "Start" button opens the dev server
// if it's already running, or launches `npm start` if not; a separate
// devserver-badge (green/red) shows live status independent of the DC badge.
'use strict';
const fs   = require('fs');
const os   = require('os');
const path = require('path');
const src  = fs.readFileSync(path.join(__dirname, '../../src/features/home-page.ts'), 'utf8');
const cfgSrc = fs.readFileSync(path.join(__dirname, '../../src/shared/dev-server-config.ts'), 'utf8');

let passed = 0; let failed = 0;
function check(desc, ok) { if (ok) { console.log(`  PASS ${desc}`); passed++; } else { console.error(`  FAIL ${desc}`); failed++; } }

check('dev-server-config.ts reads .claude/launch.json for a port',
  cfgSrc.includes('launch.json') && cfgSrc.includes('port'));

check('dev-server-config.ts falls back to a default port and landing page',
  cfgSrc.includes('DEFAULT_PORT') && cfgSrc.includes('DEFAULT_LANDING_PAGE'));

// Actually EXECUTES getDevServerConfig() against real fixture launch.json
// files (via the standalone esbuild bundle, esbuild.mjs), not just a
// string-match on the source -- a reviewer flagged that an out-of-range or
// non-integer port (e.g. 70000 or 4000.5) was accepted as-is and later
// crashes net.createConnection with ERR_SOCKET_BAD_PORT instead of falling
// back to DEFAULT_PORT.
{
  const { getDevServerConfig } = require(path.join(__dirname, '../../out/shared/dev-server-config.js'));

  function withLaunchJson(portValue, fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reg118-'));
    fs.mkdirSync(path.join(dir, '.claude'));
    const body = portValue === undefined
      ? '{ "configurations": [{}] }'
      : `{ "configurations": [{ "port": ${JSON.stringify(portValue)} }] }`;
    fs.writeFileSync(path.join(dir, '.claude', 'launch.json'), body, 'utf8');
    try { fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }

  withLaunchJson(3000, (dir) => {
    check('a valid in-range integer port is used as-is',
      getDevServerConfig(dir).port === 3000);
  });

  withLaunchJson(70000, (dir) => {
    check('an out-of-range port (70000) falls back to DEFAULT_PORT',
      getDevServerConfig(dir).port === 4000);
  });

  withLaunchJson(4000.5, (dir) => {
    check('a non-integer port (4000.5) falls back to DEFAULT_PORT',
      getDevServerConfig(dir).port === 4000);
  });

  withLaunchJson(-1, (dir) => {
    check('a negative port (-1) falls back to DEFAULT_PORT',
      getDevServerConfig(dir).port === 4000);
  });

  withLaunchJson('4000', (dir) => {
    check('a string port ("4000") falls back to DEFAULT_PORT',
      getDevServerConfig(dir).port === 4000);
  });

  withLaunchJson(undefined, (dir) => {
    check('a missing port field falls back to DEFAULT_PORT',
      getDevServerConfig(dir).port === 4000);
  });

  check('a missing .claude/launch.json entirely falls back to DEFAULT_PORT',
    getDevServerConfig(fs.mkdtempSync(path.join(os.tmpdir(), 'reg118-nolaunch-'))).port === 4000);
}

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
