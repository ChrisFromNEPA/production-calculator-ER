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

### P0 — Validate mining discounts before changing behavior

`src/engine.js:656-666` applies `discounts.mine` to the required raw-material quantity before planning. A mining discount normally models lower currency cost, not fewer material units. This can under-plan acquisition quantities and produce an apparently complete plan that lacks the required material. Reproduce with a non-zero mining discount and compare required quantities, transport, and Apply behavior. Add a regression test before changing the formula; verify the intended game rule and distinguish quantity modifiers from cost modifiers.

### P0 — Protect startup and imports from malformed player data

`src/store.js:47-63` previously accepted non-array player inventories, causing `recomputeInv()` to throw during startup. This was reproduced with object/null inventory values and is now repaired to empty arrays on normalization. A regression test was added in `tests/player-faction-profile.test.mjs`. Workspace validation still deserves a broader malformed-input matrix.

### P1 — Prevent player-import data loss

`src/views/player.js:145-153` describes imports as merging by default, but `src/store.js:275-293` replaces the existing inventory for the named player. Importing a second file can discard prior inventory. Define merge semantics explicitly, combine identical item/location entries, preserve unrelated stock, and add a regression test before changing the implementation.

### P1 — Preserve exact plan source accounting during Apply

`src/app-core.js:396-406` ignores the engine's recorded `fromQty` map and deducts from currently available source locations. If inventory changes between calculation and application, the app can use a different colony than displayed; if stock disappears, it can proceed as if the missing quantity were mined. Add stale-inventory and source-accounting tests, then reject or recalculate stale plans.

### P1 — Verify deployment gate and release evidence

The Pages exact-SHA check in `.github/workflows/pages.yml:42-45` correctly uses the workflow token `$GH_TOKEN`, confirmed by a raw-byte check of both `HEAD` and the working tree. The workflow should still be exercised by a real `workflow_run` event. `docs/release-qa.md` identifies `be48ffe` as the latest verified public application commit while current `main` and the latest successful Pages run are `c754cf5`; update the evidence after verifying the deployed SHA.


The repository is about 2.0 GB locally. Measurements found 613 GLBs totaling about 140 MB, while the generated R3F bundle is about 1.19 MB raw / 335 KiB gzip. The current static build copies 5,094 files. Prioritize excluding source/raw extraction material from the Pages artifact where not required, then compress/quantize GLBs and web textures. Add a real deployment-size budget and verify repeated model/studio swaps for disposal and cache lifetime. The current static budget does not cover total Pages payload or browser GPU/heap behavior.

### P1 — Audit the legacy 3D path

The legacy renderer remains the default compatibility path. Review `preserveDrawingBuffer`, its DPR cap, unconditional `requestAnimationFrame` loop, damping/auto-rotation, and per-vertex temporary allocations in helper geometry. Remove or gate expensive behavior where screenshots/export do not require it, while preserving the R3F fallback contract and reduced-motion behavior.

### P1 — Correct release evidence drift

`docs/release-qa.md` identifies `be48ffe...` as the last verified public application commit, while the current `main` checkout and successful latest Pages run are `c754cf5...`. Update release evidence only after verifying the exact deployed SHA, and retain the historical v1.3.0 record separately.

### P1 — Expand supply-chain auditing

CI currently runs `npm audit --omit=dev` in `.github/workflows/ci.yml`. This leaves build/test dependencies outside the vulnerability gate. Add a separate full-tree audit or an explicitly documented reason for any exclusions, and keep the result compatible with the project’s pinned/reproducible install policy.

### P2 — Narrow service-worker cache cleanup

`sw.js:62-69` deletes every Cache Storage cache for the origin except the current calculator cache. This is safe for a dedicated origin but can destroy caches belonging to another application sharing the origin. Restrict cleanup to a project-specific cache namespace and add a regression test for unrelated cache preservation.

### P2 — Add runtime coverage and observability

The project has extensive source-contract tests (486 Node tests) and three browser specs, but no coverage threshold, lint gate, or browser performance harness. Add focused runtime tests around mining-discount semantics, stale inventory before Apply, and source-location accounting. Add representative desktop/mobile performance checks for FPS, draw calls, heap/resource stability, and common cache sizes.

### P2 — Improve UX/documentation trust lanes

- Make the calculator’s refine/produce destination summary more prominent, especially around the compact “Same location” control.
- Label screenshot scanning as assisted matching that requires user confirmation.
- Ensure Models subtabs expose full ARIA tab semantics and stateful viewer controls.
- Add a configuration checklist linking profile, inventory, and colony-world setup.
- Remove stale remote/Worker wording where it remains in comments or historical guidance, while preserving clearly marked historical evidence.

## Safe local preparation performed

On branch `chore/maintainer-baseline`:

- Corrected the root metadata in `package-lock.json` to match `package.json` (`production-calculator-er`, version `0.1.0`, MIT).
- Added Python cache patterns to `.gitignore` so test/build scripts do not create new untracked bytecode artifacts.
- Did not push, open issues, create pull requests, change GitHub settings, or alter application behavior.

Tracked historical Python bytecode files remain untouched; removing them should be a separate intentional cleanup because they are currently part of repository history.

## Recommended next sequence

1. Reproduce and settle the mining-discount rule with a focused test.
2. Update release evidence to the exact current Pages SHA.
3. Add full dependency auditing and project-scoped service-worker cleanup tests.
4. Measure and reduce deployed asset weight before further 3D feature work.
5. Add browser performance/resource checks and a small runtime coverage/lint policy.
6. Address UX/documentation trust-lane improvements in focused PRs.
