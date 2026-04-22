# Keeper Utils Migration Research — 2026-04-10

Purpose: establish the first pass for moving reusable "keeper" utilities into CieloVista Tools without duplicating weak or app-specific code.

---

## Rule

One-time-one-place is the rule.

If a utility becomes shared, CVT should own one maintained implementation and downstream projects should consume that implementation instead of carrying local copies.

---

## What Was Reviewed

Initial review focused on DiskCleanUp because it contains the CPU and memory mini-widgets previously discussed for the CVT Home page.

Reviewed locations:

- `DiskCleanUp.Service/wwwroot/index.html`
- `DiskCleanUp.Service/wwwroot/js/metrics.ts`
- `DiskCleanUp.Service/wwwroot/js/metrics.js`
- `DiskCleanUp.Service/wwwroot/css/dashboard.css`
- `DiskCleanUp.Service/wwwroot/lib/wb-core/components/metrics-bar.ts`
- `DiskCleanUp.Service/wwwroot/lib/wb-core/components/metrics-bar.js`
- `DiskCleanUp.Service/wwwroot/lib/wb-core/css/metrics-bar.css`
- `_retired/wwwroot/index.html`
- `_retired/wwwroot/js/metrics.js`

---

## Initial Findings

### 1. Best keeper candidate so far: MetricsBar

The strongest reusable candidate found so far is the DiskCleanUp MetricsBar component.

Why it looks like a keeper:

- It already models shared UI behavior instead of page-specific layout.
- It groups CPU, memory, threads, and uptime into one coherent component.
- It appears to have both source and compiled forms.
- It already has CSS and usage documentation references.

Current source-of-truth candidate:

- `DiskCleanUp.Service/wwwroot/lib/wb-core/components/metrics-bar.ts`
- `DiskCleanUp.Service/wwwroot/lib/wb-core/css/metrics-bar.css`

Decision: **keep and evaluate for migration**.

### 2. DiskCleanUp dashboard header is usage code, not the shared utility

The small CPU and memory HTML elements in `DiskCleanUp.Service/wwwroot/index.html` are a usage site.

Examples:

- `cpuCanvas` / `cpuVal`
- `memCanvas` / `memVal`
- `threadVal`
- `uptimeVal`

This markup is useful as a reference implementation, but it should not become the shared source if the MetricsBar component already abstracts the same idea.

Decision: **reference only, do not migrate as the shared implementation**.

### 3. Retired copies should not be migrated

The `_retired` copies are useful for archaeology only.

Decision: **do not migrate retired code into CVT**.

### 4. CVT should not add duplicate placeholder widgets

CPU and memory tiles added directly to the CVT Home page would violate one-time-one-place unless they are powered by the real shared MetricsBar implementation.

Decision: **do not create ad hoc Home page clones**.

---

## Preliminary Buckets

### Safe to port

- MetricsBar component
- MetricsBar CSS
- MetricsBar docs references if still accurate after port

### Needs review before port

- `metrics.ts` updater logic

Reason:

It may assume DiskCleanUp-specific endpoints, page IDs, update cadence, or dashboard lifecycle hooks.

### Leave where it is

- DiskCleanUp page-level header markup in `index.html`
- Dashboard-specific wiring in DiskCleanUp page scripts
- Anything under `_retired`

---

## Migration Bar

A utility should move into CVT only if all of the following are true:

1. It solves a cross-project problem.
2. It has a stable API or can be given one with minimal cleanup.
3. It does not depend on DiskCleanUp-specific DOM structure, endpoints, or assumptions.
4. It is clearly better than rewriting a smaller cleaner version in CVT.
5. It reduces duplication after migration.

---

## Recommended Path

### Phase 1 — Research inventory

Build a shortlist of candidate keeper utilities from the Downloads projects and nearby repos.

For each candidate record:

- source project
- file path
- purpose
- dependencies
- portability risk
- decision: keep, rewrite, app-specific, retire

### Phase 2 — Port one utility only

Start with MetricsBar.

Do not move multiple utilities at once. A single migration will expose the right shared structure for CVT.

### Phase 3 — Create a shared home inside CVT

When the first port happens, place the shared implementation in one clearly named shared area inside CVT. Do not scatter copies across feature folders.

---

## Immediate Next Steps

1. Inventory reusable utilities in the Downloads projects and DiskCleanUp.
2. Score each candidate against the migration bar above.
3. Pick one first-class keeper utility for actual migration.
4. Port it into a shared CVT location with a small documented API.
5. Update CVT Home to consume the shared utility only after that port exists.

---

## Current Status

This document is the initial research note, not the final migration plan.

Confirmed so far:

- DiskCleanUp contains the CPU and memory mini-widget implementation the team remembered.
- The reusable layer is the MetricsBar component, not the page-specific header markup.
- CVT should wait for a proper shared migration instead of duplicating those widgets in Home.