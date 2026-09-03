# Release QA and deployment evidence

## v1.4.0 release verification

- URL: <https://chrisfromnepa.github.io/production-calculator-ER/>
- Source branch: `main`
- Release pull request: [#22](https://github.com/ChrisFromNEPA/production-calculator-ER/pull/22)
- Release: [v1.4.0 — Production hardening and runtime simplification](https://github.com/ChrisFromNEPA/production-calculator-ER/releases/tag/v1.4.0)
- Release commit: [`7fb5aee2bf83afc6c15778755a36545fff054dfe`](https://github.com/ChrisFromNEPA/production-calculator-ER/commit/7fb5aee2bf83afc6c15778755a36545fff054dfe)
- Package and lockfile version: `1.4.0`
- Service-worker caches: `er-prodcalc-v0.2.46-shell` and `er-prodcalc-v0.2.46-runtime`
- Required CI: [run 33710551442](https://github.com/ChrisFromNEPA/production-calculator-ER/actions/runs/33710551442) — validation, Chromium calculator UX, and Chromium service-worker lifecycle passed.
- CodeQL: [run 33710551377](https://github.com/ChrisFromNEPA/production-calculator-ER/actions/runs/33710551377) — passed.
- Pages: [run 33710781867](https://github.com/ChrisFromNEPA/production-calculator-ER/actions/runs/33710781867) — build and deployment passed for the exact release commit.
- Pages deployment: `6236251523` — status `success`; environment URL matches the live URL above.

The v1.4.0 Pages artifact was downloaded from run `33710781867` and verified
against its generated manifest: **24,384,360 bytes across 1,787 files**, base
path `/production-calculator-ER/`, with zero deployed files under `models/`.
The live root, `sw.js`, and `build-manifest.json` returned HTTP 200 over HTTPS;
the root has no Models navigation, Models view, or 3D preview action; and the
retired model bundle, Models controller, and sample GLB paths returned HTTP 404.
The GitHub release is published (not a draft or prerelease), marked Latest, and
its `v1.4.0` tag targets the exact release commit above.

Local release-candidate verification passed **532/532 Node tests**, **14/14
Python tests**, **11/11 real-Chromium UX tests**, **6/6 real-Chromium
service-worker lifecycle tests**, all **4,433** asset-provenance checks, Pages
and served-layout builds, binary-growth policy, generated-data freshness, and
`npm audit --include=dev` with zero vulnerabilities.

## Historical post-v1.3.0 deployment

The following evidence belongs to the deployment that preceded v1.4.0.

- Application SHA: [`75eb18ff3952fb52ee8e426700c5b6a8b303f91c`](https://github.com/ChrisFromNEPA/production-calculator-ER/commit/75eb18ff3952fb52ee8e426700c5b6a8b303f91c)
- CI: [run 33240656692](https://github.com/ChrisFromNEPA/production-calculator-ER/actions/runs/33240656692)
- CodeQL: [run 33240656738](https://github.com/ChrisFromNEPA/production-calculator-ER/actions/runs/33240656738)
- Pages: [run 33240768046](https://github.com/ChrisFromNEPA/production-calculator-ER/actions/runs/33240768046)
- Service-worker cache identifier: `er-v0.2.40`
- Package metadata at that historical commit was `0.1.0`.

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