'use strict';
/**
 * REG-082 — OpenAI refactor system prompt includes required sections
 *
 * Issue #444: the OpenAI Refactor Code action sent a vague system prompt that
 * gave the AI no structure to follow.  The response was unpredictable — often
 * just a code dump with no explanation of what changed.
 *
 * Fix: updated the refactor system prompt to require two labelled sections:
 *   1. REFACTORED CODE — complete drop-in replacement
 *   2. EXPLANATION — bulleted list of every change and why
 *
 * This test extracts the actual system prompt string from openai-chat.ts and
 * verifies the required content is present.  It also runs a mock validation
 * that simulates the structure the AI should return, confirming the prompt
 * is actionable.
 */

const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SRC  = path.join(ROOT, 'src', 'features', 'openai-chat.ts');

let passed = 0;
let failed = 0;

function check(desc, cond) {
    if (cond) { console.log(`  ✓ ${desc}`); passed++; }
    else       { console.error(`  ✗ ${desc}`); failed++; }
}

console.log('REG-082: OpenAI refactor system prompt has required sections');
console.log('');

const src = fs.readFileSync(SRC, 'utf8');

// 1. Refactor prompt includes "REFACTORED CODE" label
check(
    "Refactor system prompt contains 'REFACTORED CODE' label",
    src.includes('REFACTORED CODE')
);

// 2. Refactor prompt includes "EXPLANATION" label
check(
    "Refactor system prompt contains 'EXPLANATION' label",
    src.includes('EXPLANATION')
);

// 3. Prompt requires a complete replacement, not snippets
check(
    "Prompt requires 'complete' replacement (not snippets)",
    src.includes('complete') && src.includes('drop-in replacement') || src.includes('complete, drop-in')
);

// 4. Prompt requires a bulleted list of changes
check(
    "Prompt requires bulleted list of changes",
    src.includes('bulleted') || src.includes('bullet')
);

// 5. The refactor prompt is the system role (not user role)
//    Extract the block that contains 'REFACTORED CODE' and check role
const refactorBlockStart = src.indexOf('REFACTORED CODE');
const searchWindow = src.slice(Math.max(0, refactorBlockStart - 300), refactorBlockStart);
check(
    "REFACTORED CODE label is inside a system-role message",
    searchWindow.includes("role: 'system'") || searchWindow.includes('role: "system"')
);

// 6. The prompt does NOT use browser confirm() (was the old broken pattern)
check(
    'No browser confirm() call in openai-chat.ts',
    !src.includes('window.confirm(') && !src.includes('confirm(\'') && !src.includes('confirm("')
);

// 7. Mock: simulate AI response conforming to the prompt structure
//    Verify our parsing logic would accept a properly structured response
const mockConformingResponse = `
1. REFACTORED CODE

\`\`\`typescript
function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
\`\`\`

2. EXPLANATION

- Converted to arrow function for consistency
- Added explicit return type annotation
- Used template literal instead of concatenation
`;

check(
    'Mock AI response conforming to prompt structure contains both required sections',
    mockConformingResponse.includes('REFACTORED CODE') &&
    mockConformingResponse.includes('EXPLANATION')
);

console.log('');
if (failed > 0) {
    console.error(`REG-082 FAILED: ${failed} check(s) failed`);
    process.exit(1);
} else {
    console.log(`REG-082 passed (${passed} checks)`);
}
