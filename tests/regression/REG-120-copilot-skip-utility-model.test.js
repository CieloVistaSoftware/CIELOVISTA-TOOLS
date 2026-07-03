// REG-120: callCopilot must skip Copilot "utility" models in its fallback (#643)
//
// Under a BYOK Copilot main model, selecting copilot-utility-small throws
// "No utility model is configured for copilot-utility-small". The unfiltered
// selectChatModels() fallback can return that utility model, so callCopilot must
// filter utility models out before picking one.
'use strict';
const fs   = require('fs');
const path = require('path');
const src  = fs.readFileSync(
    path.join(__dirname, '../../src/shared/anthropic-client.ts'), 'utf8');

let passed = 0; let failed = 0;
function check(desc, ok) { if (ok) { console.log(`  PASS ${desc}`); passed++; } else { console.error(`  FAIL ${desc}`); failed++; } }

// The fallback must filter out utility models.
check('defines a utility-model predicate', /isUtilityModel/.test(src));
check('matches "utility" in model id/family', /\/utility\/i\.test/.test(src));
check('filters the unfiltered fallback', /selectChatModels\(\)\)\.filter\(/.test(src));

// The fallback branch must not blindly take an unfiltered selectChatModels() result.
check('no unfiltered selectChatModels() taken directly as fallback',
    !/\?\s*await vscode\.lm\.selectChatModels\(\)\s*:/.test(src));

check('references #643', src.includes('#643'));

console.log(`\nREG-120: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
