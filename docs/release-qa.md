# Release QA and deployment evidence

## Current public deployment

- URL: <https://chrisfromnepa.github.io/production-calculator-ER/>
- Source branch: `main`
- Last verified public commit: `ca975209efeec755fc775307b1b65ec9e3a7739b` (`fix: improve inventory screenshot matching (#7)`)
- Deployment workflow: [GitHub Pages Actions](https://github.com/ChrisFromNEPA/production-calculator-ER/actions/workflows/pages.yml)
- Local working-tree changes are not public until they pass CI, merge to `main`, and complete the Pages deployment.

The public site is a static GitHub Pages application. A release is considered
verified only after the exact commit passes CI and CodeQL, the Pages workflow
builds and deploys that SHA, and the live site serves the expected artifact.

## Historical v1.0.0 release QA

## Deployment target

- URL: <https://chrisfromnepa.github.io/production-calculator-ER/>
- Source: `main`
- Pages workflow run: `31663626562`
- Tested/deployed commit: `134c169549e697f27bab1cd117aaf5c1e40cfd64`

## Automated release gates

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

## Live artifact checks

Verified against the deployed Pages artifact:

- Site root: HTTP 200.
- `manifest.webmanifest`, `sw.js`, `favicon.svg`, application JavaScript, game data, and generated 3D bundle: HTTP 200.
- `build-manifest.json`: HTTP 200, base path `/production-calculator-ER/`, 5,089 listed files.
- Full encoded asset sweep: 5,088 files passed on the first sweep; the remaining icon returned HTTP 200 on five consecutive retries after a transient GitHub Pages 503.
- Chromium headless DOM render: successful; title and Empire Rising application shell present.

## Browser QA limitation

The Hermes browser harness could not attach to the available Chromium instance in this environment (`chrome-not-running`). The Chromium fallback verified the deployed DOM and artifact reachability, but did not replace a full interactive accessibility traversal. Future UI changes should repeat the interactive browser matrix when the harness is available.

## Historical v1.1.0 all-factions candidate gate

The local candidate adds canonical faction profiles, neutral colony-world snapshots, cross-faction economics, workspace portability, neutral public knowledge surfaces, and direct public hash routes. It is not yet a public release.

### Local verification

- 135 Node tests passed.
- `npm run check` passed, including production build.
- `npm run assets:check` passed for 4,430 binary assets.
- `npm audit --omit=dev`: 0 vulnerabilities.
- Gitleaks: no leaks found.
- Semgrep JavaScript scan: 0 findings.
- Chromium production-artifact fallback activated `#academy`, `#colonies`, and safe Calculator fallback for an unknown route.

### Release blockers still open

- Do not push, tag, or deploy until explicit authorization and final clean-clone/CI verification.
- Cloudflare resources have been retired by the owner. Post-retirement checks of the previously documented Worker endpoints returned HTTP 404 on 2026-08-13. This session did not modify Cloudflare configuration.
- GitHub-hosted CI/CodeQL and Pages deployment of the exact candidate SHA have not yet been confirmed.
- Hermes interactive browser traversal remains unavailable; Chromium fallback does not replace full assistive-technology QA.

### Acceptance mapping

See [`docs/public-player-audit.md`](public-player-audit.md) for the implementation slices, baseline evidence, test results, browser method, and known limitations. See [`docs/factions-and-economics.md`](factions-and-economics.md) and [`docs/public-player-guide.md`](public-player-guide.md) for the public methodology and usage guide.