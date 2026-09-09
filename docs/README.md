---
id: docs-home
title: cielovista-tools Documentation
description: Start here. Three doors: using the extension, working on it, and what is happening right now.
---

# cielovista-tools

One VS Code extension holding every CieloVista developer tool. One install, one
output channel, one command prefix (`cvs.`).

New here? Install it and open the Home page — that is the whole introduction:

```powershell
npm run rebuild
```

Then **CieloVista: Home** from the command palette. Every command the extension
registers is on that page, grouped, and it only ever lists commands that are
actually live.

---

## Where to go next

Pick the one that matches what you are doing. Each door is a short page, not a
list of everything.

### → [Using it](using/) — what the tools do

The features, what each one is for, and how to turn the noisy ones off.

### → [Working on it](working/) — changing the code

How to open an issue, what has to be true before one closes, what the regression
suite guards, and how to cut a release.

### → [Right now](status/) — the current state

What the last session was doing and what the next one should pick up.

---

## The two rules that matter

**Every fix needs an issue first.** No exceptions, including bugs found by
accident while doing something else. See [[opening-issues]].

**Nothing merges without a green suite.** `node scripts/run-regression-tests.js`
before the first commit, every time. See [[regression-log]].

---

## How these docs stay honest

Three hand-written frontmatter fields per document — `id`, `title`,
`description` — and nothing else. Everything derivable is generated into
`catalog.json`, so there is no field in a document that can quietly go stale.

The folder a document sits in **is** its category. There is no number to assign
and no index to hand-edit: drop a file in `using/` and it appears on that door.

```powershell
npm run docs:sync
```

That regenerates the door listings and validates the contract — unique ids,
three fields, and every cross-reference resolving to a real document. Write one
as a doubled bracket around an id, the way this page links to
[[opening-issues]]. A reference to something that does not exist fails the
check, which is what makes an id worth having.

It runs in the regression suite, so it cannot silently drift.
