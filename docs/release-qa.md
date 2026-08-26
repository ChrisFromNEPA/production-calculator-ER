# Release QA and deployment evidence

## Current public deployment

- URL: <https://chrisfromnepa.github.io/production-calculator-ER/>
- Source branch: `main`
- Last verified public application commit: [`be48ffe9e9041b1d49fe20e3243b4b247f4f3bf2`](https://github.com/ChrisFromNEPA/production-calculator-ER/commit/be48ffe9e9041b1d49fe20e3243b4b247f4f3bf2) (`feat: polish calculator and public presentation (#12)`)
- Current public release: [v1.3.0](https://github.com/ChrisFromNEPA/production-calculator-ER/releases/tag/v1.3.0)
- Verified deployment date: 2026-08-26
- Deployment workflow: [GitHub Pages Actions](https://github.com/ChrisFromNEPA/production-calculator-ER/actions/workflows/pages.yml)
- Pages run: [33005751979](https://github.com/ChrisFromNEPA/production-calculator-ER/actions/runs/33005751979)

The public site is a static GitHub Pages application. A release is considered
verified only after the exact commit passes CI and CodeQL, the Pages workflow
builds and deploys that SHA, and the live site serves the expected artifact.

## Verified 2026-08-26 v1.3.0 application release

- Pull request: [#12](https://github.com/ChrisFromNEPA/production-calculator-ER/pull/12)
- Squash-merge commit: [`be48ffe9e9041b1d49fe20e3243b4b247f4f3bf2`](https://github.com/ChrisFromNEPA/production-calculator-ER/commit/be48ffe9e9041b1d49fe20e3243b4b247f4f3bf2)
- GitHub release: [v1.3.0](https://github.com/ChrisFromNEPA/production-calculator-ER/releases/tag/v1.3.0)
- Required CI: [run 33004438092](https://github.com/ChrisFromNEPA/production-calculator-ER/actions/runs/33004438092) — passed the full validation job and clean-profile Chromium service-worker lifecycle.
- CodeQL: [run 33004438027](https://github.com/ChrisFromNEPA/production-calculator-ER/actions/runs/33004438027) — passed.
- Pages: [run 33005751979](https://github.com/ChrisFromNEPA/production-calculator-ER/actions/runs/33005751979) — exact-SHA build and deployment passed for `be48ffe9e9041b1d49fe20e3243b4b247f4f3bf2`.
- Local focused gates: `npm run check` passed with 486/486 tests; browser UX, 3D, performance-budget, asset-provenance, dependency-audit, and privacy checks passed.
- Live artifact checks: the root, manifest, service worker, and generated build manifest returned HTTP 200; `sw.js` declares `er-v0.2.38`, and `build-manifest.json` reports 5,094 files with base path `/production-calculator-ER/`.
- Browser evidence: GitHub-hosted Chromium passed the clean-profile service-worker lifecycle; local browser UX smoke coverage passed 9/9.

## Historical v1.2.0 asset release

- GitHub release: [v1.2.0 — Original Client Maps (Real-ESRGAN x4)](https://github.com/ChrisFromNEPA/production-calculator-ER/releases/tag/v1.2.0)
- Tag: `v1.2.0` at `fc413c8ecbf352b4435d52e75aec0fc7813fc839`
- Release artifact: 79 original client PNG map tiles with a published Real-ESRGAN x4 archive and source/output metadata.

## Historical v1.0.0 release QA

### Deployment target

- URL: <https://chrisfromnepa.github.io/production-calculator-ER/>
- Source: `main`
- Pages workflow run: `31663626562`
- Tested/deployed commit: `134c169549e697f27bab1cd117aaf5c1e40cfd64`

### Automated release gates

The release candidate passed the following checks locally and in GitHub Actions:

- 97 Node tests passed.
- Production Pages build passed.
- 4,430 binary assets passed the strict provenance gate.
- 3D build and performance-budget tests passed.
- `npm audit --omit=dev` reported 0 vulnerabilities.
- Gitleaks reported no leaks.
- Semgrep OWASP scan reported 0 findings.
- CodeQL completed successfully.
- Clean-clone install/build/check passed without private files or credentials.

### Live artifact checks

Verified against the deployed Pages artifact:

- Site root: HTTP 200.
- `manifest.webmanifest`, `sw.js`, `favicon.svg`, application JavaScript, game data, and generated 3D bundle: HTTP 200.
- `build-manifest.json`: HTTP 200, base path `/production-calculator-ER/`, 5,089 listed files.
- Full encoded asset sweep: 5,088 files passed on the first sweep; the remaining icon returned HTTP 200 on five consecutive retries after a transient GitHub Pages 503.
- Chromium headless DOM render: successful; title and Empire Rising application shell present.

### Browser QA limitation

The Hermes browser harness could not attach to the available Chromium instance in this environment (`chrome-not-running`). The Chromium fallback verified the deployed DOM and artifact reachability, but did not replace a full interactive accessibility traversal. Future UI changes should repeat the interactive browser matrix when the harness is available.

## Historical v1.1.0 candidate evidence

The evidence below was collected for the all-factions candidate that preceded the published [v1.1.0 release](https://github.com/ChrisFromNEPA/production-calculator-ER/releases/tag/v1.1.0). It is retained as historical evidence and does not validate later releases.

### Local verification

- 135 Node tests passed.
- `npm run check` passed, including production build.
- `npm run assets:check` passed for 4,430 binary assets.
- `npm audit --omit=dev`: 0 vulnerabilities.
- Gitleaks: no leaks found.
- Semgrep JavaScript scan: 0 findings.
- Chromium production-artifact fallback activated `#academy`, `#colonies`, and safe Calculator fallback for an unknown route.

### Candidate limitations at the time

- The candidate had not yet completed its final public-release process at the time of this evidence capture.
- Cloudflare resources have been retired by the owner. Post-retirement checks of the previously documented Worker endpoints returned HTTP 404 on 2026-08-13. This session did not modify Cloudflare configuration.
- GitHub-hosted CI/CodeQL and Pages deployment of the exact candidate SHA have not yet been confirmed.
- Hermes interactive browser traversal remains unavailable; Chromium fallback does not replace full assistive-technology QA.

### Acceptance mapping

See [`docs/public-player-audit.md`](public-player-audit.md) for the implementation slices, baseline evidence, test results, browser method, and known limitations. See [`docs/factions-and-economics.md`](factions-and-economics.md) and [`docs/public-player-guide.md`](public-player-guide.md) for the public methodology and usage guide.