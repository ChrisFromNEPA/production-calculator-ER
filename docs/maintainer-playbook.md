# Maintainer Playbook

This document is the operating guide for the Empire Rising Production Calculator. It is intentionally small: keep the public application stable, keep community data traceable, and make releases reproducible.

## Ownership and boundaries

- **Repository owner:** `@ChrisFromNEPA`
- **Production:** the GitHub Pages site built from `main`
- **Source of truth:** tracked source files, canonical data, scripts, and provenance records—not `dist/` or generated runtime bundles
- **Application boundary:** static, client-side, local-first; do not add accounts, secrets, shared inventories, analytics, or a remote database without an explicit design review
- **Game data/assets:** community-maintained and subject to separate rights; preserve `DISCLAIMER.md` and `docs/asset-provenance.md`

## Normal change flow

1. Start from an up-to-date `main` branch.
2. Create a focused branch using `feat/`, `fix/`, `docs/`, `data/`, `test/`, or `ci/`.
3. Make the smallest coherent change. Update canonical source data rather than generated output.
4. Run the relevant checks locally:

   ```bash
   npm ci
   npm run check
   npm run assets:check
   ```

   For deployment, service-worker, 3D, or performance changes also run the relevant focused gate from `README.md`.
5. Open a pull request with provenance, privacy impact, and browser evidence where applicable.
6. Merge only after required CI and CodeQL checks pass. Prefer squash merges and delete the branch after merging.
7. Verify the exact deployed commit on the live Pages site and record notable evidence in `docs/release-qa.md` or the changelog.

`main` is protected. Direct pushes should be reserved for GitHub recovery operations, not routine development.

## Issue triage

Review new issues at least weekly.

- **Bug:** reproduce against the live site or a clean local build; capture the smallest failing case.
- **Data correction:** require the item/recipe, observed value, source or in-game evidence, and verification date. Never request private inventories or account data.
- **Feature request:** confirm that it fits the static, local-first product boundary before committing to it.
- **Security:** keep the report private through GitHub's security advisory flow; never ask for a public proof of concept containing secrets or personal data.

Use labels consistently (`bug`, `documentation`, `enhancement`, `question`, `dependencies`). Close duplicates with a link to the canonical issue. When a report is actionable, add a short maintainer comment stating reproduction status and the next decision.

## Data and asset maintenance

- Keep external source URLs and retrieval/verification dates beside canonical data.
- Run `npm run stats:update` for balance-sheet refreshes; review the generated diff rather than hand-editing generated JavaScript.
- Run `npm run assets:check` after asset or provenance changes.
- Treat missing or uncertain provenance as a release blocker.
- Review new game-derived assets against their separate rights-holder status before merging.

## Release and rollback

A release is complete only when all of these are true:

1. The pull request is merged to `main`.
2. CI passes, including the production build, tests, asset provenance, dependency audit, secret scan, and Chromium service-worker lifecycle.
3. CodeQL passes for the exact commit.
4. The GitHub Pages workflow deploys that exact commit.
5. The live site loads and the changed user flow is checked in a clean browser profile.
6. The result is documented in `CHANGELOG.md` when user-visible.

If production is broken, stop further merges, identify the last known-good commit from Actions and the Pages deployment history, and open a focused rollback PR. Do not rewrite `main` history. After recovery, add a regression test or release-gate improvement before resuming normal work.

## Routine maintenance cadence

- **Weekly:** triage new issues and dependency/security alerts; inspect failed or cancelled Actions runs.
- **Monthly:** review Dependabot PRs, refresh stale public data where a trusted source exists, and verify the live site plus offline reload behavior.
- **Before a significant release:** run the full local gates, review generated artifacts, check the privacy boundary, and update the changelog/release evidence.

## Useful commands

```bash
# Repository and workflow status
gh repo view ChrisFromNEPA/production-calculator-ER
gh run list -R ChrisFromNEPA/production-calculator-ER --limit 20
gh issue list -R ChrisFromNEPA/production-calculator-ER --state open

# Local verification
npm run check
npm run assets:check
npm run test:sw-update
npm run test:3d
npm run test:budgets
```

Never commit credentials, tokens, private inventories, Discord exports, or unsanitized workspace backups.
