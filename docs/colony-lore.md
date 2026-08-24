# Colony lore reference

The canonical screenshot transcription lives in `data/game_data.json` under
`colony_lore`. It contains **18 records** from the player-provided in-game
colony panels and is mirrored into `src/game_data.js` by
`scripts/build-data.mjs`.

## Record contract

Each record is intended to be reusable by the Colonies page and future views:

- `id`: stable lowercase record identifier.
- `name`: the title shown in the game panel.
- `app_location`: the calculator/ownership location key when one exists; it is
  `null` when the panel is reference-only (currently Bookers Valley).
- `aliases`: spellings and nearby labels useful for joining the lore record to
  existing mining, ownership, audio, or world-reference data.
- `description`: the in-game descriptive text transcribed from the panel.
- `location_context`: a short structured summary for cards, search, and future
  filters.
- `faction_context`: only the faction/political context actually stated in the
  panel; `null` means the screenshot did not identify one.
- `points_of_interest`: named places, landmarks, ships, or other facts that
  may support future search or map/reference features.
- `resource_icon_count`: the number of resource icons visibly present in the
  panel. The icons were not text-labelled, so `resources_labeled` remains
  `false`; this count is not a resource quantity.
- `security.numeric`: always `null` for this screenshot set because no numeric
  security value was visible.
- `security.visual`: a qualitative description of the visible meter. It is
  deliberately not used as a numeric gameplay stat.

## Supplied colony panels

| Panel title | Calculator location | Main context |
| --- | --- | --- |
| Pax Prime | Pax Prime | Outer Rim moon of 79 Ceti B; Dominion territory |
| Necars Field | Necar's Field | Habitable planet near the Edge of the Milky Way |
| Ceres Delta | Ceres Delta | Watery Dominion-patrolled outpost |
| Pegasi 51 | Pegasi 51 | CMG colony on 51 Pegasi b |
| Keplers Dome | Kepler's Dome | CMG mineral colony on Antares |
| Andromeda City | Andromeda City | Force-shielded, terraforming moon Omega 15 |
| Demorgan's Castle | DeMorgan's Castle | Prison colony and mining resort |
| DSS Yukon | DSS Yukon | Dominion spaceship; FDC-only access stated |
| Training Grounds | Training Grounds | Safe Dominion rehabilitation grounds in New York City |
| Paris | Paris | European landmark city with 25th-century technology |
| Berlin | Berlin | Desolate, anarchic city with a reconnected vortex link |
| Bookers Valley | Reference-only | Mars / Tharsis location near Olympus Mons |
| Titan Station | Titan Station | Remote mineral-rich outpost |
| Aurelia | Aurelia | Warm outer moon orbiting a planet around Sirius A |
| NYC - Brooklyn | Brooklyn | Eastern NYC district with botanical garden and space harbor |
| NYC - Ground Zero | Ground Zero | Dominion “soul” of New York City |
| NYC - Manhattan | Manhattan | Dominion capital and headquarters district |
| Tokyo | Tokyo | City-habitat with Otaku, Shibuya, and Kamitakada |

## Provenance and limits

This is a transcription of the supplied in-game panels, not a live server
feed. The screenshots show descriptive lore, unlabeled resource artwork, and
qualitative security meters. They do **not** show resource names or quantities,
numeric security ratings, coordinates, buildings with levels, or a complete
ownership table. The existing `mining_sites` data remains the canonical source
for named mine yields used in calculations; the screenshot icon count is kept
separately so a future reviewer can compare the two datasets without treating
artwork as a quantity.

When adding another panel, preserve the same distinction: record what is
visible, use `null` for values that are not shown, add aliases rather than
renaming existing calculator keys, and update the generated mirror with:

```sh
node scripts/build-data.mjs
```

The Colonies page renders the description and structured facts in an
“In-game description & intel” disclosure. Other future consumers can use the
same records for search, map annotations, faction/reference pages, audio
mapping, or a reviewed resource-icon reconciliation without copying lore into
another source file.
