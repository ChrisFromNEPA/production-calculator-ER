# Calculator tab — recommended refinements (future work)

Snapshot of the audit behind commit `513da9b` (fix: calculator tab refinements).
Items below are known-good improvement targets, ordered by player impact.
Nothing here blocks current use.

## 1. NEXT OBJECTIVE highlight is unreadable on refine/manufacture cards (open bug)

Player-reported: the `NEXT OBJECTIVE` badge / highlight renders with black text
on the refinement and manufacture (recipe) cards; the mining (flow) cards render
correctly.

- Root cause candidates, both in `src/styles.css`:
  - `.recipe-card.current-objective::before` (badge, hardcoded `color: #000`)
    collides with the decorative `.recipe-card::before` glow bar defined later
    at `.recipe-card::before` (~line 1647). Flow cards have no second `::before`.
  - `.recipe-card.current-objective` tints the card with
    `color-mix(--accent 10%, --panel2)`; hardcoded `#000` badge text loses
    contrast on several faction theme accent values.
- Fix: move the badge to `::after` on recipe cards (or a real child element),
  and derive its colors from theme tokens (`--text` / `--panel`) instead of
  `#000`. Verify in dark, light, and at least two faction themes.

## 2. Enable the `layout_v2` workbench layout by default

The three-column workbench (`src/styles/views.css`, sticky item browser +
outcome rail) is built, responsive-tested (`tests/calculator-layout.test.mjs`),
and gated off behind `cmg_feature_flags_v1.layout_v2`. Do a parity pass at
1179px/767px breakpoints in a real browser, then flip the default in
`CMG_FEATURE_FLAG_DEFAULTS` (`src/app-core.js`) and update
`tests/ui-flags.test.mjs`.

## 3. Value-transition flash keying

`src/ui/value-transition.js` keys observed nodes by DOM index
(`container:selector:index`). Cards whose order can change (sorted rows,
re-plans) can mis-key the flash to a different row. Consider keying by a stable
attribute (`data-progress-item`, `data-section`, item name) instead.

## 4. Path-picker density

The "Choose refinement paths" panel renders "Selected/Not selected" chips plus
an always-on "Alternative material path" reason line per option. Dropping the
"not selected" chip and showing the reason only for the recommended option
would cut visual noise without losing information (state is already carried by
the radio itself).

## 5. Bigger-ticket items (discussed, not scheduled)

- Flow-card entrance animation could animate per-card stagger on build only
  (stagger classes exist but were neutralized by the replay bug); revisit once
  §1–§3 land.
- `runMultiPlan`/`renderPlan` share large template blocks; extracting the
  shared apply-note/legend footer would prevent the two renderers drifting
  (the copy-list arg-shape bug in `513da9b` was exactly this class of drift).
- `<button>`-based chips in flow cards rely on global button hover styles;
  a shared `.chip-btn` class would keep future chip variants from inheriting
  unwanted lifts/glows.

## Verification recipe

After any of the above: `npm run check` (496 + 2 tests, build, served baseline),
then in a browser run a plan with multiple refinement paths at a colony split
(e.g. 600 × Emergency MediKit, LED at Berlin/Kepler's Dome) and confirm:
badge contrast on every card type, no animation replay on tick/collapse,
announcement carries the investment figure, and no content hidden under the
sticky plan header.
