# UI and 3D performance budgets

These are enforced as static/build budgets first; browser FPS and GPU-memory checks remain manual acceptance gates until a stack-bearing browser performance harness is added.

| Budget | Gate |
|---|---|
| Generated R3F bundle | < 2.1 MiB raw and < 600 KiB gzip |
| 3D startup | No generated-bundle request before explicit item-preview intent |
| WebGL ownership | One R3F Canvas/root at a time |
| Idle stage | `frameloop="demand"`; no custom RAF loop in the island |
| DPR | `[1, 1.75]`, with renderer cap at 1.75 |
| Model preloading | No `useGLTF.preload`; load only selected assets |
| Shell resilience | Calculator remains available when WebGL/R3F loading fails |
| Offline | Shell and generated bundle precached; GLBs are not bulk-precached |

Current build measurement from `npm run build:3d`:

- generated bundle: approximately 1.19 MiB raw
- generated bundle: approximately 333 KiB gzip

Automated enforcement lives in `tests/performance-budgets.test.mjs` and runs via:

```bash
npm run test:budgets
```

Manual follow-up remains required for representative desktop/mobile FPS, renderer
draw calls, and resource stability across repeated item-preview open/close cycles.
