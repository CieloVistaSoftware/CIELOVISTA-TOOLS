---
id: current-status
title: Current status
description: The live parking lot: what the last session did and what to do next.
---

# CURRENT-STATUS.md — cielovista-tools

## 🅿️ PARKING LOT

**Updated 2026-10-11 (wb-starter session).** This session worked in
[wb-starter](https://github.com/CieloVistaSoftware/wb-starter), not this repo. cielovista-tools is unchanged since the
2026-09-24 entry below.

**Task:** John's goal for 2026-10-10: "work all open issues to be closed" in wb-starter.

**Done:** every wb-starter issue this session owned is closed and its PR merged:
- #417, #477, #831, #833, #835, #917, #982, #1239, #1831, #1832, #1841, #1844, #1845, #1847, plus #466's regression.
- PRs #1825 through #1851.
- Main was red twice from interactions between this session's own merges, and both were fixed in one PR each:
  - #1843, the golden hero class, which a weightless `:where()` alias was skipping;
  - #1846, the 1.0.500 release note, which a squash had taken from the wrong commit.
- #1849 corrected release 1.0.504 after a stacked PR's squash took its base PR's message. `data/release-summary.json` now overrides a version's summary the way `data/release-see-it.json` overrides its steps.

**Still open in wb-starter:**
- #1517 (npm 2FA): on John's hold; no session works it until he lifts the hold.
- #294 (px→rem): owned by the other session.

**Files touched (this repo):** `docs/status/current-status.md` only. All code changes are in wb-starter, through the PRs above.

**Last action:** merged wb-starter #1851 (a5816364), closing #1844.

**Next step:**
- When John lifts the hold, #1517.
- Otherwise new wb-starter work. Before merging a stacked PR, pass the merge script the commit whose message to use; a stacked PR's commit list includes its base PR's commits.

**Open questions for John:**
1. #1239: "By date created" on the Docs page now lists user docs only, where #1226 listed every doc. Should maintainers see all of them there?
2. #1239: the archive is `docs/archive/`, not the repo-root `archive/`.
3. #1831: an elevated x-cardnotification's shadow (rgba .15) is lighter than card.css's generic one (rgba .4). Lazy pages now match wb.js pages; say if it should be stronger.

---

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
