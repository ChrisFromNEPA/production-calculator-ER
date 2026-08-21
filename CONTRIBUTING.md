# Contributing

Thanks for helping improve Empire Rising Production Calculator.

This repository ships a static, client-side, local-first calculator. It has no
login, shared inventory service, analytics backend, or production API. Changes
should preserve that boundary unless a design proposal explicitly changes it.

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
```

For a browser on another machine in the private LAN, open the Linux host's LAN
address rather than `localhost` or `127.0.0.1`.

Focused checks are available when relevant:

```bash
npm run test:sw-update   # clean-profile service-worker lifecycle
npm run test:3d          # optional React Three Fiber build
npm run test:budgets     # 3D transfer/performance budgets
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
