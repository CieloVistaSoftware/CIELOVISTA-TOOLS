---
id: current-status
title: Current status
description: The live parking lot: what the last session did and what to do next.
---

# CURRENT-STATUS.md — cielovista-tools

## 🅿️ PARKING LOT

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
