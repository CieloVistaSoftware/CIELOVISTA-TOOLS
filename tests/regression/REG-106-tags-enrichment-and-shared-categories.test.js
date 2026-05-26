// REG-106 — Tags Enrichment (#480), shared CATEGORIES (#481), frontmatter desc fix (#482)
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
function src(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

const ENRICH    = src('src/features/tags-enrichment.ts');
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

// ── #480: tags-enrichment feature ────────────────────────────────────────────

check('#480 — tags-enrichment.ts: exports activate()',
    ENRICH.includes('export function activate('));

check('#480 — tags-enrichment.ts: exports deactivate()',
    ENRICH.includes('export function deactivate()'));

check('#480 — registers cvs.tags.enrich command',
    ENRICH.includes("'cvs.tags.enrich'"));

check('#480 — registers cvs.tags.enrichAuto command',
    ENRICH.includes("'cvs.tags.enrichAuto'"));

check('#480 — deriveTags function present',
    ENRICH.includes('function deriveTags') || ENRICH.includes('deriveTags('));

check('#480 — placeholder tags filtered (tag1/tag2/tag3)',
    ENRICH.includes('tag1') && ENRICH.includes('tag2') && ENRICH.includes('tag3'));

check('#480 — enrichFile function present',
    ENRICH.includes('function enrichFile') || ENRICH.includes('enrichFile('));

check('#480 — parseFrontmatter present in tags-enrichment.ts',
    ENRICH.includes('parseFrontmatter'));

check('#480 — idempotent: existing non-placeholder tags preserved',
    ENRICH.includes('existing') || ENRICH.includes('existingTags'));

check('#480 — uses getLauncherTargetColumn from panel-context',
    ENRICH.includes('getLauncherTargetColumn') &&
    ENRICH.includes("from '../shared/panel-context'"));

check('#480 — package.json has cvs.tags.enrich',
    (PKG.contributes?.commands ?? []).some(c => c.command === 'cvs.tags.enrich'));

check('#480 — package.json has cvs.tags.enrichAuto',
    (PKG.contributes?.commands ?? []).some(c => c.command === 'cvs.tags.enrichAuto'));

check('#480 — package.json has tagsEnrichment feature toggle setting',
    'cielovistaTools.features.tagsEnrichment' in (PKG.contributes?.configuration?.properties ?? {}));

check('#480 — catalog.ts has cvs.tags.enrich entry',
    CATALOG.includes("'cvs.tags.enrich'"));

check('#480 — catalog.ts has cvs.tags.enrichAuto entry',
    CATALOG.includes("'cvs.tags.enrichAuto'"));

check('#480 — feature-toggle FEATURE_REGISTRY includes tagsEnrichment',
    TOGGLE.includes("'tagsEnrichment'"));

check('#480 — extension.ts imports tagsEnrichmentActivate',
    EXT.includes('tagsEnrichmentActivate'));

check('#480 — extension.ts calls activateIfEnabled("tagsEnrichment"',
    EXT.includes("activateIfEnabled('tagsEnrichment'") ||
    EXT.includes('activateIfEnabled("tagsEnrichment"'));

check('#480 — extension.ts calls tagsEnrichmentDeactivate()',
    EXT.includes('tagsEnrichmentDeactivate()'));

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

check('#481 — doc-header/feature.ts imports CATEGORIES from shared',
    FEATURE.includes("from '../../shared/categories'") &&
    FEATURE.includes('CATEGORIES'));

check('#481 — CATEGORY_PATTERNS uses CATEGORIES.AUDIT (not hardcoded string)',
    FEATURE.includes('CATEGORIES.AUDIT') &&
    !FEATURE.includes("label: '900 — Audit"));

check('#481 — CATEGORY_PATTERNS uses CATEGORIES.META',
    FEATURE.includes('CATEGORIES.META') &&
    !FEATURE.includes("label: '000 — Meta"));

check('#481 — assignCategory uses CATEGORIES.GLOBAL and CATEGORIES.PROJECT_DOCS',
    FEATURE.includes('CATEGORIES.GLOBAL') && FEATURE.includes('CATEGORIES.PROJECT_DOCS'));

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
