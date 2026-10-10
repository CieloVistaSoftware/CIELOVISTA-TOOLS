---
id: current-status
title: Current status
description: The live parking lot: what the last session did and what to do next.
---

# CURRENT-STATUS.md — cielovista-tools

## 🅿️ PARKING LOT

**Parked 2026-10-10, 2:40 PM CDT.** This follows the 2026-10-09 12:25 AM entry below; all work was in wb-starter.
- **Merged since then** (each issue closed with its fields filled):
  - [wb-starter#1808](https://github.com/CieloVistaSoftware/wb-starter/pull/1808):
    the new `x-cart` behavior (#463). Add to Cart clicks are remembered, counted
    and listed, and the Shop Now demo has a cart.
  - [wb-starter#1812](https://github.com/CieloVistaSoftware/wb-starter/pull/1812):
    the playground editor behaves like an editor (#265). Tab indents, and a
    completion popup offers tags, behaviors and attributes
    (`src/lib/html-editor-assist.js`).
  - [wb-starter#1820](https://github.com/CieloVistaSoftware/wb-starter/pull/1820):
    the nightly failure #1818, which #1812 caused. The editor loaded the schema
    index at page load, racing the stagelight demo's navigation. It now loads it
    on demand. Server smoke was cancelled by GitHub's artifact upload, not by the
    test (its health check passed), and a re-run was refused with 403. That is
    said on the PR.
- **Open:** [wb-starter#1827](https://github.com/CieloVistaSoftware/wb-starter/pull/1827),
  behavior schemas declare `kind` element or decorator (#835).
  - 28 schemas are elements, each naming its `element` selector, and 149 are
    decorators.
  - A gate keeps `kind` in step with `nativeMap`.
  - The Behaviors page header reads `article → card`.
  - It was waiting on CI at parking time, with a check-in armed.
- **Files touched (#1827):** 177 `src/wb-models/*.schema.json`,
  `src/wb-models/schema.schema.json`, `scripts/build-schema-index.mjs`,
  `data/schema-index.json`, `pages/behaviors.html`,
  `tests/compliance/schemas-declare-kind.spec.ts`,
  `tests/regression/behaviors-header-says-what-an-element-becomes.spec.ts`,
  `docs/claude/SCHEMAS-GUIDE.md`, `docs/_today/CURRENT-STATUS.md`.
- **Last action:** opened #1827 and subscribed to it.
- **Next step:**
  - Merge #1827 when it is green, then fill #835's fields.
  - Then continue the open issues. Other sessions hold #294, #1096 and #831.
    #1239 is waiting on John (paid tier), and #1517 on the npm 2FA key.
- **Lessons:**
  - Anything a page loads at startup can race a test that navigates. Load
    helper data when it is first needed.
  - A docs change needs an entry in wb-starter `docs/_today/CURRENT-STATUS.md`,
    or the `check:today-updated` job fails.
- **Open questions:** none.

**Parked 2026-10-09, 12:25 AM CDT.** This follows the 7:20 PM entry below; all work was in wb-starter.
- **Merged since 7:20 PM** (each issue closed with its fields filled):
  - [wb-starter#1781](https://github.com/CieloVistaSoftware/wb-starter/pull/1781):
    glass cards on the S21 (#832 point 3). #832 is now closed.
  - [wb-starter#1787](https://github.com/CieloVistaSoftware/wb-starter/pull/1787):
    each behavior on the Behaviors page shows a one-line description (#286).
  - [wb-starter#1791](https://github.com/CieloVistaSoftware/wb-starter/pull/1791):
    the hero's eyebrow pill uses real `x-glass`, and a new spec checks the glass
    text reads at 4.5:1 or better (#1236). Card and badge glass stay their own
    designs.
  - [wb-starter#1800](https://github.com/CieloVistaSoftware/wb-starter/pull/1800):
    every one of the 273 `.md` docs fits a 375px screen (#295). The new sweep
    found demo items, pagination, `x-audio`, masonry articles, `x-figure`, and the
    button and stats cards spilling, and all of them are fixed. The PR also
    carries main's stale `data/schema-index.json`, regenerated.
  - #1014 needed no work: the last 5 `!important` in `normalize.css` stay, and
    John agreed.
- **Open:** [wb-starter#1808](https://github.com/CieloVistaSoftware/wb-starter/pull/1808),
  the new `x-cart` behavior (#463). Add to Cart clicks are kept in `localStorage`,
  counted and listed, and the Shop Now demo has a cart. It was waiting on CI at
  parking time.
- **Files touched:**
  - **#1800:** `src/styles/behaviors/{demo,pagination,audio,article,image,mdhtml,cardbutton,cardstats}.css`,
    `tests/regression/every-doc-fits-a-phone.spec.ts`, `data/schema-index.json`.
  - **#1808:** `src/wb-viewmodels/cart.js`, `src/wb-models/cart.schema.json`,
    `src/styles/behaviors/cart.css`, `docs/behaviors/cart.md`, `src/core/tag-map.js`,
    `src/wb-viewmodels/index.js`, `src/styles/behavior-css-manifest.js`,
    `demos/site/shop-now.html`, `tests/regression/x-cart-remembers-add-to-cart.spec.ts`.
- **Last action:** opened #1808 and subscribed to it.
- **Next step:**
  - Merge #1808 when it is green, then fill #463's fields.
  - Then pick from the 20 open issues; #1244, #1239 and #477 are the next candidates.
- **Lessons:**
  - A doc-wide sweep has to wait for every behavior host to report `x-ready`.
    Measuring mid-render produced both false spills and false passes.
  - `no-new-fixed-sleeps` holds new specs to zero sleeps: open the doc in a
    viewport as tall as the doc instead of scrolling with pauses.
  - Auto-inject rewrites any `<details>` a behavior builds. Mark it `x-ignore`.
  - Main's `data/schema-index.json` keeps going stale, and
    `schema-index-stays-current` now catches it. Regenerate it in any PR that
    touches schemas.
- **Open questions:** none.

**Parked 2026-10-08, 7:20 PM CDT.** This follows the 4:35 PM entry below; all work was in wb-starter.
- **Merged since 4:35 PM:**
  - [wb-starter#1777](https://github.com/CieloVistaSoftware/wb-starter/pull/1777):
    the pill nav option (#828, closed with its fields filled).
    - `x-sidebar itemstyle="pill"` and `navigationLayout.navigationItemStyle`.
    - A new `sidebar.schema.json`, and R4 ratcheted to 30.
    - `resize-min`/`resize-max` now bound the width at all times.
    - `x-dl striped` now works on vertical lists. #1776 had added `dl.schema.json`
      without regenerating `data/schema-index.json`.
  - [wb-starter#1778](https://github.com/CieloVistaSoftware/wb-starter/pull/1778):
    glass cards read as glass (#832 points 1 and 2). #832 stays open for point 3,
    the S21 test.
- **Files touched:**
  - **#1777:** `src/wb-viewmodels/navigation.js`, `src/core/site-engine.js`,
    `src/styles/site.css`, `src/styles/behaviors/navigation.css`,
    `src/wb-models/sidebar.schema.json`, `src/wb-viewmodels/semantics/dl.js`,
    `src/wb-models/dl.schema.json`, `tests/compliance/attributes-comply.spec.ts`.
  - **#1778:** `src/styles/behaviors/card.css`, `src/styles/behaviors/demo.css`.
- **Last action:** merged #1778 and commented on #832. No PRs of mine are open in
  wb-starter.
- **Next step:**
  - #286: add a one-line "what it does", from the schema `description`, to each
    behavior on the Behaviors page.
    - A single-option row can take it as a third grid line.
    - A collapsed group's header is built by `x-details` from its `summary`
      attribute, so the description needs a layout decision there.
    - Ask John, or try appending it to the summary text and running the behaviors
      page specs.
  - Watch for another session merging a schema without regenerating
    `data/schema-index.json`; #1776 did, and it hid a broken variant.
- **Open questions for John:**
  - #832: does the glass card read as glass on the S21 now? If not, try it once
    without `transform: translateZ(0)`.
  - #670: remove `x-cardfile` as first decided, or keep it as the download control?
  - npm publishing is still blocked (#1517). main's Release run failed with E404
    publishing 1.0.400 on 2026-10-08.

**Parked 2026-10-08, 4:35 PM CDT.** All of today's work was in wb-starter.
- **Task:** work wb-starter's open issues, merging each PR when CI is green.
- **Merged:**
  - [wb-starter#1755](https://github.com/CieloVistaSoftware/wb-starter/pull/1755):
    schema-declared events now fire (#344). x-carddraggable drags through
    x-draggable, which also fixed draggable's `bounds`.
  - [wb-starter#1771](https://github.com/CieloVistaSoftware/wb-starter/pull/1771):
    no effect injects its own `<style>`; all effect CSS is in `effects.css`, and
    stagelight's default variables are in `themes.css`. Themes can opt into a heading
    glow with `--wb-glow-spread` (#817, closed with its fields filled).
- **Closed without merging:** [wb-starter#1768](https://github.com/CieloVistaSoftware/wb-starter/pull/1768),
  a #1759 fix that another session's #1767 had already made. Two #1759 fixes then
  merged together (#1767 and #1769) and broke `demo.js` on main (duplicate
  `let committed`). #1770 fixed it, and #1771 carried that fix until #1770 merged.
- **Open:** [wb-starter#1777](https://github.com/CieloVistaSoftware/wb-starter/pull/1777),
  the pill nav option (#828).
  - `x-sidebar itemstyle="pill"` and `navigationLayout.navigationItemStyle`.
  - `--text-on-accent` replaces the literal `white`.
  - A new `sidebar.schema.json`; the R4 ceiling drops from 37 to 35.
  - The branch is `claude/ecstatic-newton-1g1f17`.
- **Ready, not pushed:** #832 (glass card reads as glass) is commit `50d93fd0` on
  local branch `next-832`, in a worktree under the session scratchpad.
  - A glass card's demo stands on theme-coloured discs, so the blur shows.
  - Under reduced motion, glass keeps a static tint, edge and highlight.
  - Its spec is `tests/regression/glass-card-reads-as-glass.spec.ts`.
- **Files touched:** wb-starter only.
  - **#817:** `src/styles/behaviors/effects.css`, `src/styles/themes.css`, and in
    `src/wb-viewmodels/`: `effects.js`, `ripple.js`, `sticky.js`, `stagelight.js`.
  - **#828:** `src/wb-viewmodels/navigation.js`, `src/core/site-engine.js`,
    `src/styles/site.css`, `src/styles/behaviors/navigation.css` and
    `src/wb-models/sidebar.schema.json`.
  - **#832:** `src/styles/behaviors/card.css`, `src/styles/behaviors/demo.css`.
- **Last action:** opened #1777 and subscribed to it.
- **Next step:**
  1. Merge #1777 when green, then fill #828's closing fields.
  2. Push #832 on the restarted branch: cherry-pick `50d93fd0` onto main if the
     worktree is gone. Then open its PR.
  3. #832 point 3 needs John's S21: does `transform: translateZ(0)` on the glass
     element stop the blur? Load `demos/site/cards.html` with and without it.
- **Open questions for John:**
  - #670: remove `x-cardfile` as first decided, or keep it? It is now the tested
    download control the issue asked for, and removal touches 87 files.
  - The Codex and Greptile review bots are out of quota or trial on wb-starter.
  - Testing note: the offline Playwright fixture ignores
    `test.use({ reducedMotion })`; use `page.emulateMedia()`.

**Parked 2026-10-07, 2:05 PM CDT.** All of today's work was in wb-starter.
- **Task:** work wb-starter's open issues and cut a release (John chose 1.0.400).
- **Files touched:** wb-starter only, through these PRs, all merged:
  - [wb-starter#1660](https://github.com/CieloVistaSoftware/wb-starter/pull/1660):
    behavior docs' Values column says what each attribute accepts (#749).
  - [wb-starter#1674](https://github.com/CieloVistaSoftware/wb-starter/pull/1674):
    examples and catalogues use remote photos of their subjects (#1187).
  - [wb-starter#1707](https://github.com/CieloVistaSoftware/wb-starter/pull/1707):
    release **1.0.400**, plus a fix in `scripts/lib/push-count.mjs`,
    `scripts/release-versions.mjs` and `scripts/release-entry.mjs`. Without it, a
    release merged through a PR is renumbered by the stamp workflow, which also drops
    the release's entry from the Releases page.
  - [wb-starter#1711](https://github.com/CieloVistaSoftware/wb-starter/pull/1711):
    the attribute gate's ceilings drop to today's counts (#879).
- **Closed:** #749, #878 (already fixed by #992), #1187. #462 was already closed, and it
  keeps `baseClass` on purpose.
- **Last action:** merged #1711 and posted #879's status. The v1.0.400 tag and GitHub
  release exist, and the next push stamped 1.0.401 as intended.
- **Next step:**
  - #879: the 90 R4 attributes, read by code but declared by no schema. Most are
    namespaced host attributes (`toast-message`, `tooltip-delay`) that wait on #354.
  - #286: may be superseded by the searchable Behaviors page (#664).
- **Open questions for John:**
  - npm publish still fails with E404 until the npm account's 2FA is recovered (#1517).
  - Release PRs race main. Every push to main restamps `version.js`, the `?v=` keys and
    the top of `releases.json`, and CI takes about 20 minutes. So a release branch
    conflicts before it goes green. 1.0.400 merged on a rebuild whose identical
    content had passed CI twice. A pause on merges while a release is cut would avoid
    this.

**Parked 2026-10-06, 6:55 PM CDT.** All of today's work was in wb-starter.
- **Task:** work wb-starter's open issues, merging each PR when CI is green.
- **Files touched:** wb-starter only, through these PRs, all merged:
  - [wb-starter#1639](https://github.com/CieloVistaSoftware/wb-starter/pull/1639):
    real page paths (#1001), generated showcase pages (#1530), camelCase options
    (#1125, #1526), card classes and body (#969, #945).
  - [wb-starter#1657](https://github.com/CieloVistaSoftware/wb-starter/pull/1657):
    x-span renamed to x-status (#1105), live doc examples (#307), card part ids (#940),
    and the conflict markers removed from `pages/themes.html`.
  - [wb-starter#1658](https://github.com/CieloVistaSoftware/wb-starter/pull/1658):
    card vocabulary, one word per placement (#968).
  - [wb-starter#1659](https://github.com/CieloVistaSoftware/wb-starter/pull/1659):
    `WB.isReady()` on both runtimes (#1094), and the layout schema descriptions (#749,
    in part).
- **Closed:** #1001, #969, #945, #1105, #307, #940, #968, #967, #1094.
- **Last action:** merged #1659 and commented on #749 with what is left.
- **Next step:** finish #749. In 86 docs, 316 attribute rows show the bare type `string`
  in the Values column; they need a value set or a shape, plus a gate. Several
  attributes look mistyped (`controls`, `scrollable` and `showLineNumbers` as string,
  `colors` as JSON). Then #1187: 107 `images/placeholder.svg` refs in 35 files. Some are
  deliberate (the image fallback, the subpath tests, the line-art spec).
- **Open questions for John:**
  - #462: rename every schema's `baseClass` key to `rootClass`? It appears 620 times
    in 204 files.
  - #878: should clicking a sample on the behaviors page scroll its preview into view in
    the side-by-side layout? #728 rejected always aligning to the top.
- **Out of scope, noted on #968:** drawers and popovers still read `description` as
  their panel text.

**Parked 2026-10-05, 10:15 PM CDT.** Tonight's work was all in wb-starter; its parking
lot (`docs/_today/CURRENT-STATUS.md` there) has the detail.
- **Task:** work wb-starter's open issues; make every date and time US Central (John:
  "make all datetime use cst").
- **Files touched:** wb-starter only (see its parking lot).
- **Last action:** wb-starter PRs #1532, #1559 and #1582 merged; #1601 (real paths,
  #1001/#957) pushed as a draft with known spec fallout.
- **Next step:** finish wb-starter#1601.
- **Open questions:** wb-starter #827 (wire up or delete the list modules) and #969
  (typed-card class refactor: now or later).
- **Rule recorded in wb-starter:** times for John are US Central, never UTC.

**Session 2026-10-05 (signature blocks).** John: "why are you still creating issues with no
signature block".
- **Task:** find out why issues were filed unsigned, sign the recent ones, and fix the rule.
- **Files touched:** `CLAUDE.md` ("Signature Block on Everything Posted to GitHub", merged as
  [#857](https://github.com/CieloVistaSoftware/CIELOVISTA-TOOLS/pull/857),
  [#858](https://github.com/CieloVistaSoftware/CIELOVISTA-TOOLS/pull/858),
  [#859](https://github.com/CieloVistaSoftware/CIELOVISTA-TOOLS/pull/859)),
  `docs/status/current-status.md`; CieloVistaStandards `issue-filing-rules.md` (Rule 8, v1.2.0),
  `.github/workflows/pr-checks.yml` (new), `doc-contract.schema.json`, and the front matter of
  13 docs there.
- **Last action:** cause found and fixed. The GitHub connector deletes
  `_Generated by [Claude Code](...)_` from issue bodies and edited PR descriptions, adds nothing
  back, and still reports success. Those now end with `_Filed by [Claude Code](...)_`, which
  survives. Issues #716–#847 (75) were signed that way. CieloVistaStandards had no CI on pull
  requests; [CieloVistaStandards#5](https://github.com/CieloVistaSoftware/CieloVistaStandards/pull/5)
  added a Jekyll build and a JSON parse check. John chose `dewey` as the doc-contract key;
  [CieloVistaStandards#8](https://github.com/CieloVistaSoftware/CieloVistaStandards/pull/8)
  made the schema require it, fixed the docs so all 19 pass, and added a front-matter check
  (it reads values as strings, since YAML turns `dewey: 000.4` into 0.4).
- **Next step:** none queued.
- **Open questions:** none for this work. REG-024 fails in cloud sessions because `~/Downloads/CieloVistaStandards/project-registry.json`
  exists only on John's machine; it passes locally.

**Session 2026-10-05 (error log viewer).** John: "There are multiple errors in error log viewer."
- **Task:** fix the Error Log Viewer's bugs.
- **Files touched:** `src/shared/error-log-adapter.ts`, `src/features/error-log-viewer.ts`,
  `src/features/error-log-viewer.README.md`, `src/features/cvs-command-launcher/index.ts`,
  `tests/error-log-adapter.test.js`, `tests/regression/REG-038-error-log-unresolved-count.test.js`,
  `tests/regression/REG-038-error-log-refresh-button.test.js`,
  `tests/regression/REG-039-error-log-active-count.test.js`.
- **Last action:** fixed six bugs: (1) solved entries counted as active errors; (2) the legacy log
  showed one card per occurrence; (3) a utils id in both the workspace and data logs showed twice;
  (4) one malformed log line crashed `getErrors()`, so the viewer would not open; (5) legacy and utils
  numeric ids could collide, and filing a legacy error patched only its first occurrence; (6) closing
  the panel mid-filing threw on `_panel!`, and handler failures were silent. Opened a PR on branch
  `claude/sweet-johnson-nyiahv`.
- **Next step:** merge the PR when CI is green. Then confirm in the real extension: the red badge
  drops by the solved bg-health entries.
- **Open questions:** none.

**Session 2026-10-05.** New rule: Claude merges its own PRs once CI is green (John:
"don't wait on me to merge, rather allow tests to tell you").
- **Task:** record the rule where every session reads it, and tidy the 2026-10-03 notes.
- **Files touched:** `CLAUDE.md` ("Merging Pull Requests", merged as
  [#853](https://github.com/CieloVistaSoftware/CIELOVISTA-TOOLS/pull/853)),
  `docs/status/current-status.md`; CieloVistaStandards `git_workflow.md` ("Who Merges",
  v1.3.0); wb-starter `docs/_today/CURRENT-STATUS.md`.
- **Last action:** opened
  [CieloVistaStandards#1](https://github.com/CieloVistaSoftware/CieloVistaStandards/pull/1)
  and [wb-starter#1506](https://github.com/CieloVistaSoftware/wb-starter/pull/1506); each
  is merged by Claude once its CI is green.
- **Next step:** none queued. The 2026-10-04 next steps below still stand.
- **Open questions:** none. John chose to drop the `required_reviews: 2` example from
  `git_workflow.md`
  ([CieloVistaStandards#2](https://github.com/CieloVistaSoftware/CieloVistaStandards/pull/2),
  v1.3.1). The flaky nav-scroll test was already fixed by
  [wb-starter#1520](https://github.com/CieloVistaSoftware/wb-starter/pull/1520) (#1462
  closed); 70 of 70 stress runs passed on the iPhone profile.

**Session 2026-10-04 (worked in wb-starter, not cvt).** No cvt code changed. In
wb-starter, about 40 issues were closed through merged PRs, each with its
validating test logged on the issue. Most were CI flakes traced to their
cause: boot-aware `wbIdle()`
([wb-starter#1466](https://github.com/CieloVistaSoftware/wb-starter/issues/1466),
[wb-starter#1490](https://github.com/CieloVistaSoftware/wb-starter/issues/1490)),
a stale doc panel
([wb-starter#1488](https://github.com/CieloVistaSoftware/wb-starter/issues/1488)),
and a test server that live-reloaded pages mid-test
([wb-starter#1311](https://github.com/CieloVistaSoftware/wb-starter/issues/1311)).
- **Task:** wb-starter backlog and CI flake root-causing.
- **Files touched:** wb-starter worktrees under `C:\Users\jwpmi\Downloads\AI\wb-NNNN`;
  in cvt, only this file.
- **Last action:** opened
  [wb-starter#1500](https://github.com/CieloVistaSoftware/wb-starter/pull/1500)
  (cardproduct compact,
  [wb-starter#1465](https://github.com/CieloVistaSoftware/wb-starter/issues/1465)),
  waiting on CI.
- **Next step:** merge #1500 when green and log #1465. Remaining open from this
  session:
  [#1442](https://github.com/CieloVistaSoftware/wb-starter/issues/1442) (left open
  on purpose until CI has stayed clean),
  [#1447](https://github.com/CieloVistaSoftware/wb-starter/issues/1447),
  [#1462](https://github.com/CieloVistaSoftware/wb-starter/issues/1462),
  [#1464](https://github.com/CieloVistaSoftware/wb-starter/issues/1464),
  [#1468](https://github.com/CieloVistaSoftware/wb-starter/issues/1468),
  [#1472](https://github.com/CieloVistaSoftware/wb-starter/issues/1472),
  [#1493](https://github.com/CieloVistaSoftware/wb-starter/issues/1493),
  [#1499](https://github.com/CieloVistaSoftware/wb-starter/issues/1499).
  Then clean up the merged `wb-NNNN` worktrees with
  `scratchpad/cleanup-worktrees.sh`. Unlink the node_modules junction first.
- **Open questions:** [#1447](https://github.com/CieloVistaSoftware/wb-starter/issues/1447):
  delete or revive `data/templates.json`? Its reader (the Builder) is gone.
- **Process slips this session:** deleted two `data/test-single/*.json`
  status files my own temp diagnostic specs had made. They were not logs, but
  the rule says never delete. Stopped.

**Session 2026-10-03 (worked in wb-starter, not cvt).** No cvt code changed. John asked
why `<figure>` and `<img>` could not set width/height, with no examples on the behaviors
page. Merged as
[wb-starter#1324](https://github.com/CieloVistaSoftware/wb-starter/pull/1324)
(merge commit `af651f5`).
- **Task:** width/height for the img and figure behaviors, plus docs and examples.
- **Cause:** `img { height: auto }` (normalize.css, site.css) overrode the `height`
  attribute; `<figure>` has no native width; neither schema listed the attributes, so
  the behaviors page (built from the schemas) had no rows for them.
- **Files touched (wb-starter):** `src/wb-viewmodels/semantics/img.js`,
  `src/wb-viewmodels/semantics/figure.js`, `src/wb-models/img.schema.json`,
  `src/wb-models/figure.schema.json`, `data/schema-index.json`,
  `data/behavior-examples.json`, `docs/behaviors/img.md`, `docs/behaviors/figure.md`,
  `docs/_today/CURRENT-STATUS.md`, `tests/behaviors/img-figure-width-height.spec.ts` (new),
  `tests/regression/img-doc-size-examples.spec.ts`. In cvt, only this file.
- **Last action:** merged #1324 with all 14 checks green.
- **Next step:** none. The wb-starter `docs/_today/CURRENT-STATUS.md` entry for #1324
  is corrected in
  [wb-starter#1506](https://github.com/CieloVistaSoftware/wb-starter/pull/1506).
- **Open questions:** none.
- **Watch out for:** an `<img>` with both `width` and `height` is now cropped to that
  shape. Before, a mismatched `height` was ignored. Only `docs/behaviors/img.md` had
  both at merge time. `variants-render-differently.spec.ts` fails any two showcase rows
  that render alike, so schema `examples` must look different (`20rem` is 320px).

**Updated 2026-09-24.** No open issues, no open PRs. `main` is at 911e303 ([#848](https://github.com/CieloVistaSoftware/CIELOVISTA-TOOLS/pull/848)).

**Task:** none in progress. The backlog is empty.

**Done since the last update:** [#787](https://github.com/CieloVistaSoftware/CIELOVISTA-TOOLS/issues/787) merged as [#805](https://github.com/CieloVistaSoftware/CIELOVISTA-TOOLS/pull/805) (the command launcher's
Dewey numbers are retired; REG-159 holds it). Then 19 PRs, [#809](https://github.com/CieloVistaSoftware/CIELOVISTA-TOOLS/pull/809) through [#848](https://github.com/CieloVistaSoftware/CIELOVISTA-TOOLS/pull/848),
all merged 2026-09-18:
- **Tests run the real code.** Unit and regression tests load the real module or page
  instead of a copy or its source text ([#819](https://github.com/CieloVistaSoftware/CIELOVISTA-TOOLS/issues/819), [#823](https://github.com/CieloVistaSoftware/CIELOVISTA-TOOLS/issues/823), [#828](https://github.com/CieloVistaSoftware/CIELOVISTA-TOOLS/issues/828), [#832](https://github.com/CieloVistaSoftware/CIELOVISTA-TOOLS/issues/832), [#838](https://github.com/CieloVistaSoftware/CIELOVISTA-TOOLS/issues/838));
  REG-179 holds every test directory to it. Every webview page's delivered script
  compiles and runs (REG-186, [#846](https://github.com/CieloVistaSoftware/CIELOVISTA-TOOLS/issues/846), [#847](https://github.com/CieloVistaSoftware/CIELOVISTA-TOOLS/issues/847)).
- **One of each.** One doc collector ([#802](https://github.com/CieloVistaSoftware/CIELOVISTA-TOOLS/issues/802)), one markdown walk and skip list
  ([#812](https://github.com/CieloVistaSoftware/CIELOVISTA-TOOLS/issues/812)), one esbuild config ([#813](https://github.com/CieloVistaSoftware/CIELOVISTA-TOOLS/issues/813)), one Browse All builder ([#831](https://github.com/CieloVistaSoftware/CIELOVISTA-TOOLS/issues/831)), one port
  check and poller ([#834](https://github.com/CieloVistaSoftware/CIELOVISTA-TOOLS/issues/834)), one fence rule ([#799](https://github.com/CieloVistaSoftware/CIELOVISTA-TOOLS/issues/799), [#811](https://github.com/CieloVistaSoftware/CIELOVISTA-TOOLS/issues/811)).
- **Test isolation.** One test run per checkout ([#818](https://github.com/CieloVistaSoftware/CIELOVISTA-TOOLS/issues/818)); every test process gets its
  own data directory ([#825](https://github.com/CieloVistaSoftware/CIELOVISTA-TOOLS/issues/825)); no test writes into out/ or out-test/.
- **Features.** README Generator writes only reviewed READMEs and never overwrites one
  ([#798](https://github.com/CieloVistaSoftware/CIELOVISTA-TOOLS/issues/798), [#807](https://github.com/CieloVistaSoftware/CIELOVISTA-TOOLS/issues/807)); Dead Monolith, Missing README and Dead File checks can fire
  ([#833](https://github.com/CieloVistaSoftware/CIELOVISTA-TOOLS/issues/833)); dead tooling deleted ([#801](https://github.com/CieloVistaSoftware/CIELOVISTA-TOOLS/issues/801), [#803](https://github.com/CieloVistaSoftware/CIELOVISTA-TOOLS/issues/803), [#808](https://github.com/CieloVistaSoftware/CIELOVISTA-TOOLS/issues/808)).

**Baseline, 2026-09-24, clean cloud checkout:** `CI=1 node scripts/run-regression-tests.js`:
all 192 regression tests and the packaging checks pass.

**Files touched:** `docs/status/current-status.md` only.

**Next step:** on John's machine, `npm run rebuild` so the installed extension carries
[#805](https://github.com/CieloVistaSoftware/CIELOVISTA-TOOLS/pull/805)–[#848](https://github.com/CieloVistaSoftware/CIELOVISTA-TOOLS/pull/848). Then pick new work; nothing is queued.

**Open questions:** none.

**Watch out for:**
- A Python patch script must use `newline=''` on **both** read and write, or it
  rewrites every line ending in the file.
- A test that compiles `mcp-server/` replaces the shipped esbuild bundle with
  unbundled tsc output and fails the `dist/index.js > 100 KB` packaging check for the
  rest of the run. Compile into a sandbox instead. Same family as #697 / #700.
- `npm run rebuild | tail -20` reports **tail's** exit code, not npm's. Redirect to a
  file and check `$?` directly, or a failed build reads as a successful one.
- REG-024 reads the personal `~/Downloads/CieloVistaStandards/project-registry.json`
  and skips only when `CI` is set. In a checkout without that file (a cloud session),
  run the suite as `CI=1 node scripts/run-regression-tests.js`.
- `tsc -p .` reports TS6059 rootDir errors for `mcp-server/src/shared`; that is the
  wrong config, not a defect. The real typecheck is `tsc --noEmit -p tsconfig.typecheck.json`.
