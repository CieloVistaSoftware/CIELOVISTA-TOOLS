// REG-106 — Tags Enrichment retired (#480 -> #730), shared CATEGORIES (#481), frontmatter desc fix (#482)
//
// #480 added a Tags Enrichment feature that wrote a `tags:` field into every
// doc's frontmatter. The doc contract (#707/#708) allows three hand-written
// fields -- id, title, description -- and nothing derivable, so #730 retired
// the feature: it could only create violations. The Doc Catalog derives tags
// from file names and headings (doc-catalog/content.ts extractTags).
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
function src(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

const CATEGORIES= src('src/shared/categories.ts');
const FEATURE   = src('src/features/doc-header/feature.ts');
const CONTENT   = src('src/features/doc-catalog/content.ts');
const EXT       = src('src/extension.ts');
const PKG       = JSON.parse(src('package.json'));
const CATALOG   = src('src/features/cvs-command-launcher/catalog.ts');
const TOGGLE    = src('src/features/feature-toggle.ts');

let pass = 0, fail = 0;
function check(desc, cond) {
    if (cond) { console.log(`  ✓ ${desc}`); pass++; }
    else       { console.error(`  ✗ ${desc}`); fail++; }
}

// ── #730: Tags Enrichment is retired ─────────────────────────────────────────

check('#730 — src/features/tags-enrichment.ts no longer exists',
    !fs.existsSync(path.join(ROOT, 'src/features/tags-enrichment.ts')));

check('#730 — no cvs.tags.* command is contributed',
    !(PKG.contributes?.commands ?? []).some(c => /^cvs\.tags\./.test(c.command)));

check('#730 — no tagsEnrichment setting, toggle, wiring or launcher entry',
    !('cielovistaTools.features.tagsEnrichment' in (PKG.contributes?.configuration?.properties ?? {})) &&
    !TOGGLE.includes("'tagsEnrichment'") &&
    !EXT.includes('tagsEnrichment') &&
    !CATALOG.includes("'cvs.tags."));

check('#730 — the Doc Catalog still derives tags itself (extractTags)',
    CONTENT.includes('export function extractTags('));

// ── #481: CATEGORIES shared constants ────────────────────────────────────────

check('#481 — src/shared/categories.ts exists and exports CATEGORIES',
    CATEGORIES.includes('export const CATEGORIES'));

check('#481 — CATEGORIES has all 10 keys',
    CATEGORIES.includes('META') && CATEGORIES.includes('ARCHITECTURE') &&
    CATEGORIES.includes('COMPONENTS') && CATEGORIES.includes('DEV_WORKFLOW') &&
    CATEGORIES.includes('TESTING') && CATEGORIES.includes('API') &&
    CATEGORIES.includes('TOOLS') && CATEGORIES.includes('PROJECT_DOCS') &&
    CATEGORIES.includes('GLOBAL') && CATEGORIES.includes('AUDIT'));

check('#481 — CATEGORIES exports CategoryLabel type',
    CATEGORIES.includes('export type CategoryLabel'));

// doc-header used CATEGORIES to write a `category:` field. The contract has no
// such field (#730), so doc-header no longer assigns one; the Doc Catalog is
// the remaining user of these labels.
check('#730 — doc-header writes no category field any more',
    !FEATURE.includes('CATEGORIES') && !FEATURE.includes('assignCategory'));

check('#481 — the Doc Catalog takes its labels from shared CATEGORIES',
    src('src/features/doc-catalog/commands.ts').includes('categories'));

// ── #482: extractDescription skips bottom frontmatter fields ─────────────────

check('#482 — extractDescription: inBottomFrontmatter flag present',
    CONTENT.includes('inBottomFrontmatter'));

check('#482 — extractDescription: sets inBottomFrontmatter on bare --- line',
    CONTENT.includes("trimmed === '---'") && CONTENT.includes('inBottomFrontmatter = true'));

check('#482 — extractDescription: skips lines when inBottomFrontmatter is true',
    CONTENT.includes('if (inBottomFrontmatter) { continue; }'));

check('#482 — extractDescription: fmKeyValue regex skips key: value lines',
    CONTENT.includes('fmKeyValue') &&
    CONTENT.includes('fmKeyValue.test(trimmed)'));

console.log(`\nREG-106: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
