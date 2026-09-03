# Asset provenance and redistribution

The repository contains original project code and documentation alongside a limited set of Empire Rising / Face of Mankind-derived media. The MIT license applies to original project code. It does not relicense game names, data, maps, icons, textures, or audio.

## Current checkout

The v1.4.2 source tree stays below **2,000 tracked files and 40 MiB** through an automated repository-hygiene test. The current asset surface is intentionally limited to files used by the calculator, its documentation, or its reproducible data pipeline.

| Class | Current paths | Use |
|---|---|---|
| Item and gear imagery | `icons/`, `gear_textures/` | Calculator and gear UI |
| Maps | `maps/` | Battle Nodes reference |
| Audio | `voice_extracted/` | Optional user-controlled terminal voices |
| Documentation image | `docs/assets/calculator-overview.png` | Fictional README example |
| Fonts | `fonts/` | Bundled JetBrains Mono and Orbitron webfonts under SIL OFL 1.1 |
| Third-party browser code | `src/vendor/` | Vendored Chart.js payload loaded on demand |

The machine-readable review manifest is [`data/asset-provenance.json`](../data/asset-provenance.json). `npm run assets:check` fails if a tracked binary is not covered by an approved record.

## Retired extraction workspaces

Earlier releases retained large, non-runtime workspaces under `models/`, `textures_extracted/`, `skins_test/`, `gallery/`, `logo/`, and `uv_grid.png`. They were useful during the original client-data investigation but were unrelated to the production calculator after its 3D features were retired.

Those workspaces are **not part of the current checkout** and never enter the Pages artifact. Their last complete repository snapshot is the [`v1.4.1` tag](https://github.com/ChrisFromNEPA/production-calculator-ER/tree/v1.4.1), and they remain recoverable from Git history. v1.4.2 removes them from the current tree without rewriting history.

## Release policy

Every distributed binary asset or asset class must record:

- its repository path or glob;
- origin and applicable rights holder;
- license or documented redistribution permission;
- any transformation performed;
- approval status and evidence.

A release must not ship an asset marked `pending_permission` or `unknown`. The release process must either document approval or remove the asset and its dependent feature.

The project owner authorized the game-derived assets used by this public migration. That authorization does not transfer ownership or place those assets under MIT. See [`DISCLAIMER.md`](../DISCLAIMER.md) for the project boundary.
