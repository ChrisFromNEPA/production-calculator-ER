# R3F rollout plan

## Current state

The R3F island is built as a committed Vite IIFE at `src/generated/er-3d-workbench.js` and loaded only by explicit 3D selection. `layout_v2`, `motion_v2`, and `r3f_v1` remain default-off.

The live local browser probe verified:

- Default startup: `r3f_v1=off`, zero classic Three script tags, zero generated-bundle script tags.
- Opt-in Models flow: enabling `r3f_v1`, opening Models, and selecting a gallery model loads the generated bundle and creates one Canvas.
- Selected model status rendered as `alinea` in the stage.
- No console messages were emitted during the successful opt-in probe.

## Staged enablement

1. Keep all three flags default-off while parity work is reviewed.
2. Enable `layout_v2` for internal desktop/tablet/mobile shell review.
3. Enable `motion_v2` after keyboard, reduced-motion, and focus review.
4. Enable `r3f_v1` only for a small test cohort after model-gallery and Character Studio export parity checks.
5. Monitor model-load failures, stage fallback usage, and calculator completion without adding personal tracking.
6. Remove flags only after one stable release window and an explicit review.

## Rollback

Persisted local overrides can be cleared with:

```js
localStorage.removeItem('cmg_feature_flags_v1');
```

The legacy viewer remains available behind the lazy compatibility loader until R3F parity is signed off. No remote push is part of this rollout; local commits require Chris's approval before publication.

## Remaining parity gate

The R3F stage currently covers shared Canvas lifecycle, selected GLB loading, orbit controls, grid state, static default motion, WebGL failure fallback, and an outfit data bridge. The following legacy features still require a visual/manual parity pass before removing the legacy viewer:

- wireframe and normals controls
- texture atlas inspection/re-import
- GLB export parity
- full Character Studio body/garment visibility and export integration
- repeated Models ↔ Studio switching and resource stability
