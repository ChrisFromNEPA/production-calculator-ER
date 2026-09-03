# Contributing

Thanks for helping improve Empire Rising Production Calculator.

This repository ships a static, client-side, local-first calculator. It has no
login, shared inventory service, analytics backend, or production API. Changes
should preserve that boundary unless a design proposal explicitly changes it.

## Good first contributions

Small, focused changes are welcome. Useful starting points include:

- correcting unclear player-facing documentation;
- reporting a reproducible layout or keyboard-navigation problem;
- adding a regression for a confirmed bug;
- improving an empty, loading, or error state;
- correcting game data when you can include dated source evidence.

If you are unsure where a change belongs, open an issue with the smallest example
that demonstrates the problem.

## Before opening a pull request

1. Read the README, disclaimer, and relevant documentation.
2. Keep changes focused and explain the user-visible effect.
3. For data changes, include the source, retrieval/verification date, and any uncertainty.
4. Never commit private inventories, Discord exports, credentials, tokens, or personal information.
5. Edit canonical source data or source documents; do not hand-edit generated runtime files.
6. Run the relevant tests and include the commands/results in the pull request.

## Local setup

```bash
npm ci
npm run local:host       # working-tree server on port 4173
npm run check            # tests, Pages build, and baseline verification
npm run assets:check     # required after asset/provenance changes
npm run assets:hygiene   # new binary size, aggregate growth, and duplicate gate
npm run test:python      # all Python unittest cases
npm run check:generated  # regenerate committed sources and require a clean diff
```

For a browser on another machine in the private LAN, open the host's LAN
address rather than `localhost`.

Focused checks are available when relevant:

```bash
npm run test:sw-update   # clean-profile service-worker lifecycle
npm run test:browser-ux  # optional locally; requires Chromium when BROWSER_TEST_REQUIRED=1

```

## Pull requests

Use a focused branch and a descriptive commit message. UI changes should
include screenshots or a short browser verification note at the affected
viewport sizes. Data changes should include a before/after explanation,
exact item/recipe names, batch quantities, provenance, and the date checked.
Changes affecting storage, sharing, or network behavior must describe their
privacy impact.

## Data corrections

Open a data-correction issue with the item/recipe, the observed value, the
source or in-game evidence, and the date checked. For recipe corrections,
include output quantity, every input quantity, and the process. For icons or
other binary assets, include the source asset identity and provenance record.
Do not paste private account data or credentials.

## Source and generated files

- Edit `data/` for canonical game, recipe, faction, and world data.
- Run the appropriate generator, such as `node scripts/build-data.mjs`, after
  changing canonical data.
- Do not hand-edit generated files in `src/generated/`, `src/game_data.js`, or
  the Pages `dist/` artifact.
- Keep game-derived assets distinct from MIT application code and update their
  provenance records when required.

## Binary and deployment hygiene

`data/asset-provenance.json` is the authority for whether a binary may be
redistributed. `npm run assets:check` enforces that every tracked binary is
covered by an approved record; `npm run assets:hygiene` protects future
changes. It rejects any newly added binary over **10 MiB**, more than **25 MiB
total new binary content** in one change, or an exact duplicate of a binary
already in the base tree. These are review thresholds, not permission to add
an asset: provenance and licensing evidence remain required.

The repository keeps only application sources, reproducible data inputs, tests,
documentation, and assets used by the current product. Large historical model,
texture, gallery, logo, and skin-extraction workspaces were retired from the
current checkout in v1.4.2; they remain recoverable from the v1.4.1 tag and Git
history. The Pages runtime is a separate positive allowlist in
`public-files.json`. Do not add `dist/`, caches, dependency trees, probes,
temporary exports, or unrelated extraction output to either surface.
