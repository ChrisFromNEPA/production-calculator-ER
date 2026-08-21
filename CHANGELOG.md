# Changelog

All notable public releases are documented here.

## [Unreleased]

### Added

- Inventory add-stock category tabs for mined/refined materials, mineables,
  Medikits, ammo, boosters/drugs, food, and all items.
- ER-X Rubber Rounds: 4 rounds per batch from 2 rubber and 2 chemicals.
- Dedicated ER-X Rubber Rounds icon sourced from the existing ER-X ammo asset.
- Regression coverage for the inventory picker and ER-X ammunition data.

### Improved

- Inventory keeps the Stock Ledger and Add stock workflow full width, with
  Workspace View below it instead of a narrow side rail.
- Large displays show the full mined/refined item grid; mobile keeps the picker
  compact and internally scrollable.
- Selecting or adding stock preserves the page position and focused control.
- Theme palette contrast and stylesheet/service-worker cache busting were
  tightened for the public UI.

### Verification

- `npm run check` passes with 379 tests, a production Pages build, and baseline
  verification.

## [1.1.0] — All-Factions Public Player Support (local candidate)

### Added

- Canonical public faction registry with aliases and safe `Unaffiliated` mode.
- Versioned player faction profiles and complete portable workspace snapshots.
- Explicit local colony ownership/tax snapshots with import, export, reset, and fail-closed validation.
- Faction-aware gross spend, return, and net-cost calculations with cross-faction invariant tests.
- Direct hash routes for public tabs with safe unknown-route fallback.
- Public Knowledge Base navigation and faction-neutral player/economics documentation.

### Changed

- Fresh profiles no longer inherit invented CMG holdings or faction returns.
- Academy/product copy is open to all players while preserving factual CMG attribution.
- Alternative-path optimization uses active faction context only when valid ownership/policy data exists.

### Verification

- 135 automated tests pass locally.
- Production Pages build, strict asset provenance, dependency audit, Gitleaks, and Semgrep pass locally.
- Chromium production-artifact checks verify `#academy`, `#colonies`, and unknown-route fallback.

### Known limitations

- This is a local candidate and has not been pushed, tagged, or deployed.
- Cloudflare retirement is complete: the previously documented Worker endpoints returned HTTP 404 during post-retirement verification on 2026-08-13. No Cloudflare configuration was modified by this session.
- Full Hermes interactive browser traversal remains unavailable; Chromium fallback evidence is documented in the audit.

## [1.0.0] - 2026-08-13

### Added

- Public Empire Rising production, inventory, gear, and economy calculator.
- Static GitHub Pages deployment with repository-subpath and offline support.
- Local-first saved plans, inventories, requests, gear presets, world-state settings, analytics, and import/export.
- Approved game-derived icons, textures, models, maps, gallery assets, audio, and fonts with provenance records.
- Automated tests, asset provenance enforcement, dependency auditing, Gitleaks, Semgrep, CodeQL, and Pages deployment gates.

### Changed

- Replaced private Cloudflare-backed synchronization and analytics with browser-local workflows.
- Neutralized private guild-product branding while retaining legitimate Empire Rising faction and game data.

### Known limitations

- Data is local to each browser unless explicitly exported or shared.
- Real-time shared collaboration and remote synchronization are not part of this release.
- Game-derived assets retain their separate rights-holder status and are not relicensed as MIT software.
