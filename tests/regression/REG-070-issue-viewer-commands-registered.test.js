/**
 * REG-070 — Issue Viewer commands accessible from command palette
 * Closes: https://github.com/CieloVistaSoftware/cielovista-tools/issues/410
 *
 * Verifies:
 *  1. cvs.issues.openViewer command is registered in package.json
 *  2. cvs.issues.newIssue command is registered in package.json
 *  3. showGithubIssues is called in features/github-issues.ts for cvs.issues.openViewer
 *  4. newIssueForProject is called in features/github-issues.ts for cvs.issues.newIssue
 *     (3 and 4 were registered in extension.ts until #738)
 *  5. Doc Catalog toolbar contains a Report Issue button wired to new-issue message
 *  6. new-issue message handler exists in doc-catalog/commands.ts
 *  7. newIssueForProject is exported from github-issues/view.ts
 */

import { strict as assert } from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../');

const pkgJson    = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const extensionSrc = fs.readFileSync(path.join(root, 'src/extension.ts'), 'utf8');
const featureSrc   = fs.readFileSync(path.join(root, 'src/features/github-issues/feature.ts'), 'utf8');
const issuesViewSrc = fs.readFileSync(path.join(root, 'src/features/github-issues/view.ts'), 'utf8');
const catalogSrc    = fs.readFileSync(path.join(root, 'src/features/doc-catalog/catalog.html'), 'utf8');
const catalogCmdSrc = fs.readFileSync(path.join(root, 'src/features/doc-catalog/commands.ts'), 'utf8');

// 1. cvs.issues.openViewer registered in package.json
const openViewerCmd = pkgJson.contributes.commands.find(c => c.command === 'cvs.issues.openViewer');
assert.ok(openViewerCmd, 'cvs.issues.openViewer not found in package.json contributes.commands');
assert.match(openViewerCmd.title, /issue.*viewer/i, 'cvs.issues.openViewer title should mention Issue Viewer');
console.log('PASS 1: cvs.issues.openViewer in package.json');

// 2. cvs.issues.newIssue registered in package.json
const newIssueCmd = pkgJson.contributes.commands.find(c => c.command === 'cvs.issues.newIssue');
assert.ok(newIssueCmd, 'cvs.issues.newIssue not found in package.json contributes.commands');
assert.match(newIssueCmd.title, /new.*issue/i, 'cvs.issues.newIssue title should mention New Issue');
console.log('PASS 2: cvs.issues.newIssue in package.json');

// 3. showGithubIssues used for cvs.issues.openViewer in features/github-issues.ts
//    (moved out of extension.ts in #738: extension.ts is wiring only; REG-145
//    checks the registration behaviourally)
assert.ok(
    /registerCommand\(\s*['"]cvs\.issues\.openViewer['"]\s*,\s*\(\)\s*=>\s*showGithubIssues\(\)\s*\)/.test(featureSrc),
    'features/github-issues.ts must register cvs.issues.openViewer calling showGithubIssues'
);
assert.ok(extensionSrc.includes("from './features/github-issues'"), 'extension.ts must wire features/github-issues');
console.log('PASS 3: cvs.issues.openViewer → showGithubIssues in features/github-issues.ts');

// 4. newIssueForProject used for cvs.issues.newIssue in features/github-issues.ts
assert.ok(
    /registerCommand\(\s*['"]cvs\.issues\.newIssue['"]\s*,\s*newIssueForCurrentProject\s*\)/.test(featureSrc) &&
    /newIssueForProject\(\s*projName \|\| undefined\s*\)/.test(featureSrc),
    'features/github-issues.ts must register cvs.issues.newIssue calling newIssueForProject'
);
console.log('PASS 4: cvs.issues.newIssue → newIssueForProject in features/github-issues.ts');

// 5. Report Issue button + new-issue message in catalog.html
assert.ok(catalogSrc.includes('btn-report-issue'), 'catalog.html must have #btn-report-issue button');
assert.ok(catalogSrc.includes("command: 'new-issue'"), "catalog.html must post { command: 'new-issue' }");
console.log('PASS 5: Report Issue button wired in catalog.html');

// 6. new-issue handler in doc-catalog/commands.ts
assert.ok(
    catalogCmdSrc.includes("case 'new-issue'"),
    "doc-catalog/commands.ts must handle 'new-issue' message case"
);
console.log("PASS 6: 'new-issue' case in doc-catalog/commands.ts");

// 7. newIssueForProject exported from github-issues/view.ts
assert.ok(
    issuesViewSrc.includes('export function newIssueForProject'),
    'github-issues/view.ts must export newIssueForProject'
);
console.log('PASS 7: newIssueForProject exported from github-issues/view.ts');

console.log('\nAll REG-070 checks passed.');
