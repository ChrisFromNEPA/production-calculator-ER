# Public Player and All-Factions Audit — Fresh Baseline

**Status:** All-factions candidate implemented locally; release and infrastructure retirement gates remain open

**Repository:** `ChrisFromNEPA/production-calculator-ER`

**Deployed URL:** <https://chrisfromnepa.github.io/production-calculator-ER/>

**Captured:** 2026-08-12 (UTC environment date)

**Baseline intent:** Observe a brand-new, unaffiliated public player with no prior browser state. This is evidence for the all-factions implementation plan, not a claim that the current release is all-factions complete.

## Browser method

The Hermes browser harness could not attach to a running Chromium instance in this environment (`chrome-not-running`). Following the browser-automation fallback procedure, the baseline used fresh, isolated headless Chromium profiles against the deployed Pages URL:

- Desktop render: 1440×1000
- Mobile render: 390×844
- `--headless=new --no-sandbox --disable-gpu`
- 15-second virtual-time budget
- Separate temporary profiles with no existing localStorage or service-worker state
- Rendered DOM captured with `--dump-dom`
- Screenshots captured to temporary paths outside the repository:
  - `<temporary-desktop-screenshot>`
  - `<temporary-mobile-screenshot>`

The screenshots are temporary QA evidence and are not committed to the public repository. This fallback verifies real rendering and DOM activation; it is **not** a replacement for a full interactive accessibility traversal.

## Deployment/render result

- Document title: `Empire Rising Production Calculator`
- Rendered DOM: approximately 1.65 MB
- View sections present in the rendered shell: 26
- Main shell rendered: yes
- Calculator item browser rendered: yes
- Empty-player state rendered: yes
- Inventory, Gear, Colonies, Requests, Models, Factions, Academy, Analytics, Help, and reference surfaces present in the rendered DOM: yes
- Desktop screenshot produced: yes
- Mobile screenshot produced: yes
- Chromium stderr contained no application exception; screenshot commands completed successfully.

## Fresh-player observations

### Working

- The public site loads without an account or Cloudflare authentication.
- The shell identifies the project as an independent Empire Rising community project and describes it as local-first/offline-capable.
- A new visitor sees `No players yet — create or import one`.
- The empty state provides `+ New Player` and `Import JSON` actions.
- The calculator exposes item search, quantity, production colony, inventory toggle, calculation, multi-item plan, and save-plan controls.
- The colony selector contains the known production locations.
- The application exposes a Factions gallery and the broader reference surfaces.

### Confirmed defects / release blockers

1. **No player faction identity**
   - Fresh player bar offers `+ New`, `Import`, `Export`, and `Remove`, but no faction selector.
   - The new-player flow asks for a player name only.
   - A public player cannot state whether they are CMG, EC, BOS, another supported faction, or unaffiliated.

2. **CMG-specific product branding remains in the public shell**
   - Footer text contains `CMG OPS · no operator` even for a fresh player.
   - This presents the public calculator as CMG operations rather than a neutral Empire Rising tool.

3. **Colony ownership is CMG-specific**
   - Colony cards expose `CMG owns` controls rather than an owner-faction selector.
   - The UI cannot represent EC, BOS, FDC, GOM, LED, MOTB, VI, civilian/unaffiliated, or unknown ownership as an explicit state.

4. **Fresh-state economic copy assumes CMG**
   - The rendered colony surface shows CMG badges and CMG-specific ownership terminology.
   - The current source seeds known CMG holdings and the calculation layer exposes CMG-only return semantics.
   - A new user cannot distinguish “player spend” from “faction return” through a selected profile.

5. **CMG Academy/product language leaks into general public navigation**
   - The public shell labels the tab `CMG Academy`.
   - The generated Academy content describes a guild/member knowledge base. CMG-specific factual or attribution content can remain, but the public product must not imply CMG membership is required.

### Confusing but functional

- `No players yet` is clear, but the first action does not explain that a profile will eventually need faction/world context.
- The colony cards include an `owner not set` warning for at least one colony, but the available control language does not explain how ownership affects calculations or whose ownership is being represented.
- The public shell has many sections visible through `More`; a first-time player may not know the recommended path from profile creation to first calculation.
- The calculator’s economic model is present, but fresh-player copy does not yet explain gross spend versus faction return.

### Unknown mechanics requiring explicit modeling/documentation

- Whether the 85% return currently encoded for CMG is a universal game mechanic, a CMG-specific policy, or an internal planning assumption.
- Whether all factions have the same return policy.
- Whether `CIVILIAN` is a game faction, an unaffiliated player mode, or a separate recipe metadata category.
- Whether `MOTB`, `VI`, `MOB`, and `VTX` are aliases, historical labels, or distinct identifiers.
- Current live ownership and tax rates for all colonies. These must remain local/configurable unless backed by authoritative current data.

## Source evidence captured from the repository

The baseline was cross-checked against the current source tree:

- `src/app-core.js` defines `CMG_FACTION = 'CMG'`, `FACTION_REBATE = 0.85`, and initial holdings `Paris` and `Andromeda`.
- `src/app.js` renders the owner control as `CMG owns`.
- `src/views/player.js` manages player names/inventory but has no faction profile field.
- `src/views/reference.js` maintains a separate faction gallery list from recipe metadata.
- `src/game_data.js` exposes recipe faction codes including `BOS`, `CIVILIAN`, `CMG`, `EC`, `FDC`, `GOM`, `LED`, `MOTB`, and `VI`.

## Baseline acceptance conclusion

The public site is renderable and broadly navigable, but it does **not** yet meet the all-factions acceptance criteria. The highest-priority implementation work is:

1. Add a canonical faction registry.
2. Add versioned player faction metadata with safe unaffiliated migration.
3. Replace CMG-only colony ownership with explicit owner-faction state.
4. Make faction-return policy explicit instead of universal-by-default.
5. Reconcile all gross/net calculations and path optimization across factions.
6. Re-run real-browser interaction and accessibility QA after implementation.

No public push or Cloudflare change was performed for this baseline.

## Implementation slice 1 — canonical factions and neutral player baseline

**Completed locally:**

- Added `data/factions.json` as the canonical faction registry, including explicit recipe/client aliases and a safe `UNAFFILIATED` mode.
- Added the browser-loaded `src/factions.js` registry adapter and loaded it before the store.
- Added versioned player profile metadata (`schema_version: 2`) with faction persistence and safe migration of legacy inventory-only profiles.
- Added faction selection to the player bar and new-player flow; imported workspace JSON can carry `faction` without breaking legacy array exports.
- Replaced fixed CMG colony holdings with local, explicit owner-faction state. Fresh state assigns no colony owner and no faction return.
- Made faction return policy active-faction dependent. The reviewed 85% value remains CMG-specific metadata and is never applied to other factions or unaffiliated users.
- Replaced the colony `CMG owns` checkbox with an owner-faction selector.
- Reworded calculation, gear, footer, and request surfaces to distinguish player spend from faction return without presenting CMG as the required public identity.
- Updated the pricing regression to assert the new unaffiliated default: no fabricated rebate and gross cost equals cost-to-guild cost.

**Verification:**

- `npm test`: 110 tests passed.
- `npm run build`: passed; 5,091 files copied into `dist/`.
- `npm run assets:check`: passed; 4,430 approved binary assets.
- `npm audit --omit=dev`: 0 vulnerabilities.
- `git diff --check`: passed.
- Real Chromium fallback against the locally built `dist/`: faction selector and registry option rendered; neutral footer/request copy rendered; no `CMG owns` UI remained; Chromium stderr was empty.
- Hermes browser harness remains unavailable in this environment (`chrome-not-running`), so this is not claimed as full interactive accessibility QA.

**Remaining audit work:**

- Full interactive faction switching and owner-policy browser traversal.
- All-faction calculation invariants and alternative-path behavior with explicit owner/faction fixtures.
- Colony tax/ownership import/export coverage and workspace round trips.
- Neutralization of remaining generated Academy/product language where it implies guild membership is required.
- Desktop/mobile/direct-route/offline/accessibility matrix and regression review.
- Release documentation and release gate after all plan phases pass.

## Implementation slice 2 — neutral colony world snapshots

**Completed locally:**

- Added explicit `Unknown / Owner not set` semantics alongside registry-derived faction owners.
- Added neutral versioned `empire-rising-colony-world` snapshot export/import/reset controls.
- Validated snapshot schema, faction IDs, tax ranges, and malformed-input rejection before mutation.
- Preserved owner/tax independence: changing owner never silently changes the configured tax.
- Kept legacy `cmg_colony_tax_v1` readable while storing new state under `er_colony_world_v2`.
- Added local-device labeling so world ownership and tax are not presented as live synchronized game data.

**Verification:**

- `npm test`: 118 tests passed.
- Colony-world source contract: 4/4 passed.
- Colony-world runtime snapshot tests: 4/4 passed.
- `npm run build`: passed; 5,091 files copied into `dist/`.
- `npm run assets:check`: passed; 4,430 approved binary assets.
- `npm audit --omit=dev`: 0 vulnerabilities.
- `git diff --check`: passed.

**Remaining audit work:**

- Cross-faction math matrix and explicit calculation contexts.
- Full workspace export/import including player, plans, requests, gear, world state, and preferences.
- Neutralization of remaining generated Academy/product language where it implies guild membership is required.
- Desktop/mobile/direct-route/offline/accessibility matrix and release review.

## Implementation slice 3 — cross-faction economic context

**Completed locally:**

- Added `ENGINE_COLONY_REBATE_FOR` as the faction-aware policy seam used by alternative-path pricing.
- Retained the numeric rebate hook only as a compatibility fallback for older callers.
- Clamped malformed policy values to the safe `[0, 1]` range.
- Verified unaffiliated, EC, and CMG contexts keep gross cost stable while only the reviewed CMG policy produces a return.
- Verified non-owned colonies never receive a faction return, even when the selected faction has a return policy.
- Reworded engine comments and contracts from CMG-specific net-cost language to active-faction language.

**Verification:**

- `npm test`: 122 tests passed.
- Cross-faction economic matrix: 4/4 passed.
- Existing CMG alternative-path regressions: 6/6 passed.
- `npm run build`: passed; 5,091 files copied into `dist/`.
- `npm run assets:check`: passed; 4,430 approved binary assets.
- `npm audit --omit=dev`: 0 vulnerabilities.

## Implementation slice 6 — direct public hash routes

**Completed locally:**

- Added explicit direct hash routes for every public tab (`#academy`, `#colonies`, and the remaining canonical routes).
- Added safe fallback to Calculator for unknown short textual routes.
- Preserved base64 calculator share hashes and existing plan loading behavior.
- Added runtime `hashchange` handling so back/forward and externally changed routes update the active view.
- Added focused regression coverage for direct routes, unknown-route fallback, and share-hash compatibility.

**Verification:**

- Direct-route contract: 2/2 passed.
- All-tabs contract: 3/3 passed.
- Chromium production-artifact fallback: `#academy` activated Academy, `#colonies` activated Colonies, and an unknown route activated Calculator; no uncaught-error markers were present and stderr was empty except for one non-app GLib/Chromium warning on the Colonies run.
- `npm test`: 133 tests passed before this route slice; the final gate follows below.

## Implementation slice 5 — neutral public knowledge surfaces

**Completed locally:**

- Renamed visible Academy navigation and headings to `Knowledge Base` / `Empire Rising Knowledge Base`.
- Reworded the Academy introduction and document metadata so the reference is public and open to every player.
- Preserved CMG as factual historical/source attribution rather than a membership requirement.
- Reworded source Academy guidance from members/officers/guild Discord to players, contributors, and public issues.
- Neutralized the standalone data-help footer and remaining confirmed membership-oriented copy in the public source tree.
- Regenerated `src/academy_docs.js` from `academy/*.md`; no generated file was hand-edited.

**Verification:**

- Neutral public-copy contract: 2/2 passed.
- `npm test`: 130 tests passed.
- Academy generation: 12 documents rebuilt successfully.
- `npm run build`: passed; 5,091 files copied into `dist/`.
- `npm run assets:check`: passed; 4,430 approved binary assets.
- `npm audit --omit=dev`: 0 vulnerabilities.
- `git diff --check`: passed.

## Implementation slice 4 — portable public workspace

**Completed locally:**

- Added a versioned `empire-rising-workspace` envelope for all whitelisted public local state.
- Included player profiles/inventory, faction metadata, colony world state, path/source preferences, slot settings, gear toggles, progress markers, muted state, and local analytics data.
- Added validate-before-mutation import behavior with schema, key, JSON, and size checks.
- Preserved legacy inventory-only JSON imports unchanged.
- Added public `Import workspace` and `Export workspace` controls beside player controls.
- Kept the export boundary local-only; no server, account, or Cloudflare dependency was introduced.

**Verification:**

- `npm test`: 128 tests passed.
- Workspace source contract: 4/4 passed.
- Workspace runtime round-trip tests: 2/2 passed.
- `npm run build`: passed; 5,091 files copied into `dist/`.
- `npm run assets:check`: passed; 4,430 approved binary assets.
- `npm audit --omit=dev`: 0 vulnerabilities.
## Final local candidate gate — 2026-08-13

The implementation plan's code and documentation work is complete locally. This is a release candidate, not a published release.

**Verified:**

- `npm test`: **135 tests passed**.
- `npm run check`: passed; production build copied 5,091 files.
- `npm run test:3d`: passed.
- `npm run test:budgets`: passed.
- `npm run assets:check`: passed for 4,430 binary assets.
- `npm audit --omit=dev`: 0 vulnerabilities.
- Gitleaks: no leaks found.
- Semgrep JavaScript scan: 0 findings.
- `git diff --check`: passed.
- Clean clone with canonical `npm ci`: tests, build, 3D tests, budget tests, asset gate, audit, and diff checks passed.
- Clean clone with `npm ci --ignore-scripts` correctly exposed a missing optional platform esbuild binary; the release path uses ordinary `npm ci`, which passed. This is recorded as an install-mode caveat, not suppressed.
- Chromium production artifact: direct `#academy`, `#colonies`, and unknown-route fallback verified; no application uncaught-error markers.

**Still blocked or intentionally not claimed:**

- No push, tag, Pages deployment, or public release has occurred.
- GitHub-hosted CI, CodeQL, and Pages deployment for this exact candidate SHA remain unverified.
- Full interactive Hermes browser and assistive-technology traversal remains unavailable; Chromium fallback is documented but is not equivalent.
- Cloudflare retirement is recorded as complete: the previously documented Worker endpoints returned HTTP 404 during post-retirement verification on 2026-08-13. This session made no Cloudflare changes.

**Candidate acceptance:** all implementation, local test, security, build, portability, documentation, and Chromium fallback gates pass. The remaining items are external release authorization/infrastructure/interactive-QA gates, not unverified claims of completion.