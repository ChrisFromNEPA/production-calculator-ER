# Changelog

All notable public releases are documented here.

## [Unreleased]

No unreleased public changes.

## [1.3.0] — 2026-08-26

Verified GitHub Pages release for merge commit
[`be48ffe9`](https://github.com/ChrisFromNEPA/production-calculator-ER/commit/be48ffe9e9041b1d49fe20e3243b4b247f4f3bf2).
See the [GitHub release](https://github.com/ChrisFromNEPA/production-calculator-ER/releases/tag/v1.3.0)
and [release QA record](docs/release-qa.md) for deployment evidence.

### Added

- Public orientation panel, source link, fictional sample screenshot, and
  recruiter-friendly project documentation.
- Combined-plan scratch mode that ignores current inventory without mutating
  the live inventory state.
- Complete sanitized mining-drift observation fixtures and regression checks.

### Improved

- Single-item and combined-plan actions remain isolated to their originating
  result.
- Production and refinement destinations are independently selectable, with a
  reversible same-location convenience mode.
- Mine and Refine progress cards, narrow-screen wrapping, and calculator
  result presentation are more consistent.
- Mining drift is calibrated against six supplied 100-cycle observations;
  cooling supports Off/0 while energy remains 1–20 and active cooling remains
  1–20.
- Offline shell cache is updated to `er-v0.2.38`.

### Verification

- Local `npm run check` passed with 486/486 tests, production build, and
  baseline verification.
- [CI run 33004438092](https://github.com/ChrisFromNEPA/production-calculator-ER/actions/runs/33004438092),
  [CodeQL run 33004438027](https://github.com/ChrisFromNEPA/production-calculator-ER/actions/runs/33004438027),
  and [Pages run 33005751979](https://github.com/ChrisFromNEPA/production-calculator-ER/actions/runs/33005751979)
  passed for the merged release.
- Browser UX, 3D, performance-budget, asset-provenance, dependency-audit,
  and privacy checks passed.

## [1.2.0] — 2026-08-13

### Added

- Original client map release with 79 PNG map tiles and the published
  Real-ESRGAN x4 archive.
- Source/output dimensions, timings, and SHA-256 hashes in the release
  manifest; original alpha channels were preserved.

See the [v1.2.0 GitHub release](https://github.com/ChrisFromNEPA/production-calculator-ER/releases/tag/v1.2.0)
for the archive and its limitations.

## [1.1.0] — All-Factions Public Player Support

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

- This historical release is superseded by the later verified releases listed
  above.
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
