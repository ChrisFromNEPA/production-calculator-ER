# Maintainer audit — 2026-08-28

## Scope

Audit of `main` at `c754cf572c7ac1fcc1393773bf4df3889d9a0365`, cloned locally at `/home/hermes/projects/production-calculator-ER`. Reviews covered architecture, calculation correctness, performance/assets, security, CI/release engineering, documentation, and UX. No application behavior was changed during the review.

## Verified baseline

- `npm ci`: passed; 86 packages audited, 0 vulnerabilities reported.
- `npm run check`: passed — 486 Node tests, production Pages build, and served-shell baseline.
- `npm run assets:check`: passed for 4,433 binary assets.
- `npm run test:sw-update`: passed — 5/5 clean-profile Chromium lifecycle tests.
- `npm run test:browser-ux`: passed — 9/9 browser UX tests.
- `npm run test:3d`: passed — 3/3 tests.
- `npm run test:budgets`: passed — 3/3 tests.
- GitHub Actions for the audited commit: CI, CodeQL, and Pages all succeeded.
- GitHub state: public, non-archived repository; no open issues or pull requests; `main` has strict required status checks and admin enforcement.

## Findings and prioritized backlog

### Resolved — Remove unsupported production, mining, and transport discount inputs

The calculator never exposed these controls in its shipped UI, and the engine did
not use their parsed values. The dormant parser, calculation parameters, caller
arguments, comparison-spec field, and stylesheet were removed. Physical material
requirements remain recipe-driven; colony tax and the existing cost model are
unchanged. `tests/discount-plumbing.test.mjs` guards the public calculation API
and shipped source against reintroducing these unsupported inputs.

### P0 — Protect startup and imports from malformed player data

`src/store.js:47-63` previously accepted non-array player inventories, causing `recomputeInv()` to throw during startup. This was reproduced with object/null inventory values and is now repaired to empty arrays on normalization. A regression test was added in `tests/player-faction-profile.test.mjs`. Workspace validation still deserves a broader malformed-input matrix.

### P1 — Prevent player-import data loss

`src/views/player.js:145-153` describes imports as merging by default, but `src/store.js:275-293` replaces the existing inventory for the named player. Importing a second file can discard prior inventory. Define merge semantics explicitly, combine identical item/location entries, preserve unrelated stock, and add a regression test before changing the implementation.

### P1 — Preserve exact plan source accounting during Apply

`src/app-core.js:396-406` ignores the engine's recorded `fromQty` map and deducts from currently available source locations. If inventory changes between calculation and application, the app can use a different colony than displayed; if stock disappears, it can proceed as if the missing quantity were mined. Add stale-inventory and source-accounting tests, then reject or recalculate stale plans.

### P1 — Verify deployment gate and release evidence

The Pages exact-SHA check in `.github/workflows/pages.yml:42-45` correctly uses the workflow token `$GH_TOKEN`, confirmed by a raw-byte check of both `HEAD` and the working tree. The workflow should still be exercised by a real `workflow_run` event. `docs/release-qa.md` identifies `be48ffe` as the latest verified public application commit while current `main` and the latest successful Pages run are `c754cf5`; update the evidence after verifying the deployed SHA.


### Resolved — Retire public 3D and reduce the deployment

The historical baseline contained 613 GLBs, a generated R3F bundle, a legacy renderer, and a 5,094-file Pages build. The v1.4.0 candidate removes every public 3D surface, viewer/runtime dependency, and deployed model path. The GLBs remain only as a provenance-tracked source archive outside the Pages allowlist. The verified local artifact is 1,787 files / 24,384,508 bytes with fail-closed limits of 2,000 files / 32 MiB, so renderer lifecycle and GPU/heap work is no longer part of the web application.

### P1 — Correct release evidence drift

`docs/release-qa.md` identifies `be48ffe...` as the last verified public application commit, while the current `main` checkout and successful latest Pages run are `c754cf5...`. Update release evidence only after verifying the exact deployed SHA, and retain the historical v1.3.0 record separately.

### Resolved — Expand supply-chain auditing

The historical CI omitted development dependencies. Current CI runs `npm audit --include=dev` after reproducible `npm ci`; the v1.4.0 candidate contains only Vite as a development dependency and reports zero known vulnerabilities.

### Resolved — Narrow service-worker cache cleanup

Service-worker caches now use the `er-prodcalc-` namespace, keep shell/runtime data separate, bound optional runtime entries, and delete only old project-prefixed caches. Static and real-Chromium lifecycle tests verify unrelated origin caches survive.

### Resolved — Add runtime coverage and observability

The v1.4.0 candidate enforces static syntax/accessibility checks, a 60% function-coverage floor for the directly instrumented engine module, and fail-closed desktop/mobile Chromium budgets for DOM size, same-origin requests/bytes, network failures, console errors, and page exceptions. Apply, stale-inventory, source accounting, and removed-discount semantics have focused regressions.

### P2 — Improve UX/documentation trust lanes

- Make the calculator’s refine/produce destination summary more prominent, especially around the compact “Same location” control.
- Label screenshot scanning as assisted matching that requires user confirmation.
- Retire the Models subtabs and viewer controls rather than preserving an unused accessibility surface. Completed in the v1.4.0 candidate.
- Add a configuration checklist linking profile, inventory, and colony-world setup.
- Remove stale remote/Worker wording where it remains in comments or historical guidance, while preserving clearly marked historical evidence.

## Safe local preparation performed

On branch `chore/maintainer-baseline`:

- Corrected the root metadata in `package-lock.json` to match `package.json` (`production-calculator-er`, version `0.1.0`, MIT).
- Added Python cache patterns to `.gitignore` so test/build scripts do not create new untracked bytecode artifacts.
- Did not push, open issues, create pull requests, change GitHub settings, or alter application behavior.

Tracked historical Python bytecode files remain untouched; removing them should be a separate intentional cleanup because they are currently part of repository history.

## Completion status

The v1.4.0 candidate resolves the actionable engineering sequence from this audit: unsupported discount plumbing is removed; release metadata is aligned; full dependency auditing and project-scoped service-worker tests are required; public 3D is retired and the Pages artifact is reduced to about 24 MB; static quality/accessibility, module coverage, and measured browser budgets are enforced; and current user-facing documentation is synchronized. Exact production SHA/run links are added to `docs/release-qa.md` only after deployment verification.
