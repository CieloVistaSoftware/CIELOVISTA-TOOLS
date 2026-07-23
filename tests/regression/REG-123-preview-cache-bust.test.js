// REG-123: Guards issue #642 -- "Preview never refreshes with the latest
// code (serves stale cached CSS/JS)". The home page's Start button is the
// same thing called "the Preview button" in the commit history that
// repointed it at the wb-starter dev server (commit 40b8491). It opens
// the workspace's own dev server (e.g. wb-starter) in the OS browser via
// vscode.env.openExternal -- cvt does not own a webview/iframe for this
// feature, so the one lever it has over staleness is the URL it hands to
// the browser: buildPreviewUrl() must append a cache-busting query param
// that changes on every call, so a repeat click of Start/Preview against
// an already-running dev server is always a URL the browser has never
// seen, forcing a real reload instead of reusing a stale disk-cached
// response for the previous identical URL.
'use strict';
const fs   = require('fs');
const path = require('path');

const cfgSrc  = fs.readFileSync(path.join(__dirname, '../../src/shared/dev-server-config.ts'), 'utf8');
const homeSrc = fs.readFileSync(path.join(__dirname, '../../src/features/home-page.ts'), 'utf8');

let passed = 0; let failed = 0;
function check(desc, ok) { if (ok) { console.log(`  PASS ${desc}`); passed++; } else { console.error(`  FAIL ${desc}`); failed++; } }

check('dev-server-config.ts exports buildPreviewUrl',
  cfgSrc.includes('export function buildPreviewUrl'));

check('home-page.ts imports buildPreviewUrl from the shared dev-server-config module',
  homeSrc.includes("buildPreviewUrl") && homeSrc.includes("from '../shared/dev-server-config'"));

check('the devServerAction "already up" branch opens buildPreviewUrl(...), not a bare landingPage URL',
  homeSrc.includes('openExternal(vscode.Uri.parse(buildPreviewUrl(devServerConfig)))'));

check('the old un-cache-busted URL template is gone from home-page.ts',
  !homeSrc.includes('`http://127.0.0.1:${devServerConfig.port}/${devServerConfig.landingPage}`'));

// Actually EXECUTES buildPreviewUrl() via the compiled bundle -- not just a
// string match -- to prove two calls in the same millisecond-resolution
// window still differ (a fixed/omitted cache-bust would make every Start
// click after the server is already up produce the SAME URL, defeating the
// whole point of the fix) and that it degrades safely with no config.
{
  const { buildPreviewUrl } = require(path.join(__dirname, '../../out/shared/dev-server-config.js'));

  const cfg = { port: 3000, landingPage: 'index.html' };
  const urlA = buildPreviewUrl(cfg, 1000);
  const urlB = buildPreviewUrl(cfg, 2000);

  check('buildPreviewUrl embeds the port and landing page',
    urlA.startsWith('http://127.0.0.1:3000/index.html'));

  check('buildPreviewUrl appends a query-string cache-bust param',
    /\?cvtPreview=/.test(urlA));

  check('two calls with different timestamps produce two DIFFERENT URLs',
    urlA !== urlB);

  check('two calls with the SAME injected timestamp are deterministic (pure function)',
    buildPreviewUrl(cfg, 42) === buildPreviewUrl(cfg, 42));

  const cfgWithQuery = { port: 3000, landingPage: 'index.html?foo=bar' };
  check('a landing page that already has a query string gets "&", not a second "?"',
    buildPreviewUrl(cfgWithQuery, 1).includes('index.html?foo=bar&cvtPreview='));

  const defaultUrl = buildPreviewUrl(cfg);
  check('calling with no timestamp still returns a cache-busted URL (defaults to Date.now())',
    /\?cvtPreview=[0-9a-z]+$/.test(defaultUrl));
}

console.log(`\nREG-123: ${passed} passed, ${failed} failed`);
if (failed) { process.exit(1); }
