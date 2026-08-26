# UX and 3D Baseline — Phase 0

Captured 2026-08-08 from commit `7476cfb` (`fix: match character clothing geometry to skin styles`) before the UX/motion/R3F implementation begins.

## Scope

This baseline is intentionally descriptive and non-invasive. The calculation engine, inventory semantics, gear behavior, data files, and legacy Three.js viewers are unchanged.

## Static surface metrics

| Surface | Size | Lines |
|---|---:|---:|
| `index.html` | 46,388 bytes | 823 |
| `src/styles.css` | 190,416 bytes | 3,838 |
| `src/views/models.js` | 42,822 bytes | 964 |
| `src/views/character.js` | 22,625 bytes | 511 |
| `src/vendor/three/three.min.js` | 607,784 bytes | — |
| `src/vendor/three/OrbitControls.js` | 26,660 bytes | — |
| `src/vendor/three/GLTFLoader.js` | 103,311 bytes | — |

The current app has 16 declared view panels and 16 matching `data-view` navigation values. `index.html` loads the classic Three.js runtime eagerly, including both model controllers.

## Manual browser smoke

Local server:

```bash
python3 -m http.server 4173
```

URL: `http://localhost:4173/`

Observed browser viewport: **1280 × 577**.

The browser smoke traversed all 16 navigation values and confirmed that each corresponding `#view-<name>` panel became active:

`calc`, `inventory`, `gear`, `colonies`, `requests`, `drugs`, `battle`, `models`, `comms`, `freelordmoon`, `weapons`, `analytics`, `items`, `client`, `factions`, `help`.

The calculator baseline shows:

- A full-width header with brand, 10 visible primary tabs, a More menu, six themes, mute control, and font-size slider.
- A player bar before the main workflow.
- A centered calculator surface capped at roughly 1,100 px.
- Category/search controls followed by a dense four-column item grid.
- Item, quantity, colony, inventory toggle, Calculate, add-item, and save-plan controls below the grid.
- Advanced slot setup and help accordions below the setup controls.
- A large empty-state result panel when no player is configured.
- A fixed bottom status strip.

The current calculator uses the available desktop width reasonably for the item grid, but the workflow is vertically stacked: selection, setup, and outcome are not persistent peers. The result area is below the fold on the captured viewport.

## Current 3D architecture observations

Static inspection confirms both legacy viewers independently create:

- `THREE.WebGLRenderer` with `preserveDrawingBuffer: true`
- `PerspectiveCamera`
- continuous `requestAnimationFrame` animation
- global resize listeners

The two controllers are `src/views/models.js` and `src/views/character.js`. The planned R3F migration must not remove either path until model inspection, texture handling, Character Studio composition, and export parity are verified.

The browser reports WebGL2 available in the local test browser and the service worker API available. The Models view rendered its gallery and controls, but the browser console collector reported one uncategorized JavaScript exception with an empty message while switching into Models. This is recorded as a pre-existing investigation item; no attempt was made to attribute or fix it during baseline capture.

## Automated safety checks

Existing regression suite:

```text
npm test
29 tests passed, 0 failed
```

New served-shell contract:

```bash
npm run test:baseline
```

This contract verifies the served HTML has matching unique navigation/panel routes, and that every referenced local stylesheet/script is reachable. It also asserts that both legacy 3D controllers still contain their expected renderer/RAF/drawing-buffer baseline until parity migration is complete.

## Baseline acceptance artifacts

- `tests/browser/layout-baseline.spec.mjs` — zero-dependency served-shell smoke contract.
- `package.json` — `test:baseline` script.
- This document — metrics, manual traversal record, and known exception.

## Follow-up before visual changes

1. Reproduce and identify the uncategorized Models-view exception with a stack-bearing browser harness.
2. Add fixed viewport screenshot capture for 1440×1000, 834×1112, and 390×844 before changing layout.
3. Measure first usable calculator and first model render timing in a repeatable browser runner.
4. Keep the legacy 3D assertions until the R3F path passes feature and export parity checks.

## Post-migration verification note

The current local implementation preserves the baseline as historical evidence and adds a progressive R3F path. A live browser probe verified default-off startup with zero eager Three/R3F loads. With `r3f_v1` explicitly enabled, opening Models and selecting `alinea` loaded the generated bundle and rendered one R3F Canvas without console messages. Legacy Three.js remains lazy-loaded as a compatibility fallback because full texture/export/Character Studio parity has not yet been signed off.
