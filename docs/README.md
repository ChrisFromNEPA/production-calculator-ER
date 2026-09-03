# Project documentation

Start with the live application or the player guide. The remaining documents explain the data model, maintenance boundaries, and evidence behind releases.

## Players

| Document | Purpose |
| --- | --- |
| [Player guide](public-player-guide.md) | First calculation, profiles, inventory, workspace backups, and issue reports |
| [Factions and economics](factions-and-economics.md) | Cost figures, colony ownership assumptions, taxes, and faction-return formulas |
| [Known limitations](known-limitations.md) | Data boundaries, unsupported inputs, browser storage, and accessibility limits |
| [Colony lore](colony-lore.md) | Reference text and the data contract for colony descriptions |

## Contributors

| Document | Purpose |
| --- | --- |
| [Contributing guide](../CONTRIBUTING.md) | Setup, change workflow, data provenance, and pull-request expectations |
| [Local hosting](local-hosting.md) | Local Vite server, trusted-LAN access, and persistent user service setup |
| [Quality gates](quality-gates.md) | Tests, coverage, performance budgets, and failure policy |
| [Asset provenance](asset-provenance.md) | Licensing boundaries and the machine-readable asset manifest |
| [Maintainer playbook](maintainer-playbook.md) | Triage, release, rollback, and repository operations |

## Release evidence

| Document | Purpose |
| --- | --- |
| [Release QA](release-qa.md) | Exact commits, workflow runs, artifacts, deployments, and live checks |
| [v1.4.2 responsive QA](responsive-qa-2026-09-03.md) | Viewport, theme, text-size, accessibility, and interaction coverage |
| [Changelog](../CHANGELOG.md) | User-visible changes by version |

## Repository boundaries

The Git repository is the source of truth for code and reviewable data. GitHub Pages receives only the positive allowlist in [`public-files.json`](../public-files.json). Browser profiles and workspaces stay in local storage unless a user exports them.

Large historical model and extraction workspaces were removed from the v1.4.2 checkout without rewriting history. They remain recoverable from the [v1.4.1 tag](https://github.com/ChrisFromNEPA/production-calculator-ER/tree/v1.4.1).
