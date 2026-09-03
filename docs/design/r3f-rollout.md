# R3F rollout plan

## Current state

The public Models area, Character Studio, and Item Catalog have been retired.
The R3F island remains as a committed Vite IIFE at
`src/generated/er-3d-workbench.js` only for the optional item-detail preview.
`layout_v2`, `motion_v2`, and `r3f_v1` remain default-off.

The live local browser probe verified:

- Default startup: `r3f_v1=off`, zero classic Three script tags, zero generated-bundle script tags.
- Opt-in item-detail preview: enabling `r3f_v1` and explicitly requesting a
  matching item model loads the generated bundle and creates one Canvas.
- No console messages were emitted during the successful opt-in probe.

## Staged enablement

1. Keep all three flags default-off while parity work is reviewed.
2. Enable `layout_v2` for internal desktop/tablet/mobile shell review.
3. Enable `motion_v2` after keyboard, reduced-motion, and focus review.
4. Enable `r3f_v1` only for a small test cohort after item-preview browser checks.
5. Monitor model-load failures, stage fallback usage, and calculator completion without adding personal tracking.
6. Remove flags only after one stable release window and an explicit review.

## Rollback

Persisted local overrides can be cleared with:

```js
localStorage.removeItem('cmg_feature_flags_v1');
```

The legacy loader and retired Models controllers remain source-cleanup candidates;
they are no longer part of the public route. No remote push is part of this
rollout; local commits require Chris's approval before publication.

## Remaining preview gate

The remaining supported surface is the optional item-detail preview. Before
enabling it by default, verify matching, loading/failure fallback, focus behavior,
resource disposal, and representative desktop/mobile performance. Retired gallery,
texture-editing, GLB-export, and Character Studio parity are no longer release goals.
