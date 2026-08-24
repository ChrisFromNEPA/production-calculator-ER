# Known limitations

This public release is intentionally local-first. The following limitations are explicit:

- There is no login, shared guild database, Cloudflare API, remote analytics endpoint, or real-time collaboration.
- Player profiles, inventories, plans, requests, gear, preferences, analytics events, and world context live in the current browser unless exported.
- Colony owners, taxes, transport assumptions, drift, and slot settings are user-maintained context; the app does not claim they are live game truth.
- Final production destinations are deliberately limited to Kepler's Dome, Brooklyn, Ground Zero, Manhattan, Paris, Berlin, and Tokyo. Mining/source and refinement locations remain broader; the Colonies tab can therefore show owned worlds such as Training Grounds and DSS Yukon with no mine data without treating them as production destinations.
- Each world has one actual owner in the local model. LED and FDC membership in the Global Dominion alliance is represented separately from ownership; only the actual owner receives the modeled 85% pre-tax return. The remaining 15% Global Dominion allocation is displayed as an assumed 50/50 split between FDC and LED, not a verified game formula.
- Legacy `er_colony_world_v2` snapshots and shared colony records that stored joint Global Dominion ownership are normalized to one actual owner using the canonical defaults (Brooklyn/FDC, Ground Zero/LED, Training Grounds/FDC, and DeMorgan's Castle/LED). An empty or invalid owner remains explicitly unowned.
- Unaffiliated mode reports gross-cost behavior and does not invent ownership or rebates.
- Production-time estimates and live market/ownership feeds are not provided.
- The service worker can retain an older static asset until the browser completes an update cycle. Reload with network access after a release if behavior appears stale.
- The real-browser fallback verifies rendered production artifacts, but the Hermes interactive browser harness was unavailable during this audit. Full interactive assistive-technology traversal remains a follow-up QA item when that harness is available.
- Game-derived names, data, and assets retain separate rights-holder status. They are not automatically covered by the MIT license for application code.
- Public data can be corrected as authoritative game information changes. Include source, date, and a minimal reproducible example when reporting an issue.

## PreMet armor names and icons

**Status: Tremor Leg Pads icon repaired locally; other naming/artwork limitations remain.** Verified against the client-derived icon mapping on 2026-08-17.

The game has five PreMet armor variants for each armor body slot: **Buffer, Contact, Collision, Impact, and Tremor**. The calculator's imported data and icon assets are not fully aligned with those names:

- The game calls the helmet variant **PreMet Tremor Helmet**, while `data/game_data.json` still contains a legacy recipe name, **PreMet Helmet**.
- `data/game_data.json` contains the correct **PreMet Tremor Leg Pads** recipe and materials (3 plastic syntactic foam, 1 textile, 1 rubber).
- `icons/premet tremor leg pads.png` is now supplied from the client’s CMG `LegPads7_7.tga` asset, and its catalog/hash entries are present.
- The icon lookup in `src/engine.js` derives the filename directly from the lower-case item name; the repaired filename now matches that lookup.
- `icons/premet buffer leg pads.png` is present, but its artwork does not match the supplied in-game Buffer or Tremor screenshots. Do not rename or reuse it without confirming its source identity.

The remaining limitation is the source/import collision in which a second **PreMet Buffer X** row was likely meant to be **PreMet Tremor X**. The Tremor Leg Pads asset itself is now repaired; the legacy helmet naming and distinct Buffer/Tremor artwork review remain separate tasks. The recipe and cost calculations are not affected.
