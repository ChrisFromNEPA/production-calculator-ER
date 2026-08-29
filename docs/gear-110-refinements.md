# Gear 1.10 tab — recommended refinements (visual review 2026-08-28)

Viewport-chunk visual review (109 viewport screenshots across 1080p, 2K, 4K,
iPad 1024×768, mobile 390×844) plus interaction/logic audit. Two defects were
fixed in code the same day (`biodamage`/`staminadamage` label leak; redundant
delta chips). The items below are the remaining, verified improvement targets,
ordered by player impact. Nothing here blocks current use.

## 1. Stale toasts overlap content for the first minutes after onboarding (highest impact)

The semi-transparent "Finish your player name and faction before opening
another tab." toast persists after onboarding completes and — together with the
"Welcome, …" toast — floats bottom-right over real content: goal cards, the
Build planner, the stat delta table, and the Gear explorer header. Verified at
1080p, iPad, and mobile widths (chunks 0–3 on each).

- Fix: dismiss the gate-warning toast the moment `onboarding-create` succeeds,
  and cap toast lifetime (auto-dismiss ~5s) instead of leaving them pinned.

## 2. Protection guide table truncates its header on narrow screens

At mobile width the "PROTECTS AGAINST" and "FACTION ASSOCIATION" header cells
clip mid-word ("PROTECTS AGAI…"). The table has `min-width: 31rem` with
`overflow-x: auto` (`.patch-protection-grid`, surviving-reference.css:220), so
the body scrolls, but the clipped header still reads as broken.

- Fix: give the grid an explicit horizontal-scroll affordance, or reflow to a
  two-line stacked row below ~480px.

## 3. Build-planner selects truncate long item names

Selected values like "Aramid Modified Shoulder …" and "Pythica Sustained
Gloves …" ellipsize at ≤1024px (CSS ellipsis on `.patch-build-slots select`).
The full name is only readable after opening the dropdown.

- Fix: allow two-line select text on narrow screens, or show the selected
  item's full name in the label line above the select (the label row already
  has `flex-wrap`).

## 4. Uneven two-column masonry in the gear explorer

`.patch-group-list` is a 2-column grid with `align-items: start`, so when one
card is much taller than its row neighbor the short column leaves large blank
gaps (verified at iPad and 2K widths, several chunks).

- Fix (cheap): `grid-auto-flow: dense` doesn't help uneven heights; instead
  accept the gaps or move to CSS columns (`columns: 2`) so cards pack
  vertically per column.

## 5. Fixed max-width page column on 4K

The content column stays ~1200–1400px wide at 3840px viewport, leaving very
large empty margins on 4K monitors. Not a defect, but the single most visible
4K characteristic.

- Fix (optional): raise `main`'s max-width at ≥2560px, or let the gear
  explorer grid go to 3 columns at that width
  (`@media (min-width: 2560px) .patch-group-list { grid-template-columns: repeat(3, 1fr); }`).

## 6. Minor

- Long "Addiction Treatment" / "Health Regen" chips wrap to two lines inside
  cards while siblings stay single-line (iPad width). A `min-width` on
  `.patch-chip` or hyphenation would even them out.
- "Implant / Other" cards with no recorded stats render a sparse card of two
  "no recorded stats" placeholders; consider collapsing them into the profile
  list rather than a card.
- Duplicate-looking implant card titles ("Implant" appears for several distinct
  single-item profiles) differ only by the slot chip — consider including the
  implant name in the card title.

## Verification notes

- Patch math verified against the notes: Pythica heavy −9 armor / −10 shielding
  / +0.3 agility; gloves −6 armor; Hypobaric/Metabolic sustain deltas;
  Resistance Amp +25 armor / +25 shielding / −0.5 health regen; XenoTech
  shoulder stats removed. 131 changed craftable items, grouped badge labels all
  map to a defined PATCH_GROUPS entry.
- Goal ranking verified: "Stamina sustain" ranks PreMet Collision pieces top
  with best-piece-per-slot (no six variants of the same slot).
- No horizontal overflow at any tested width; no console errors.
- Two of the delegated vision reviews (2K, 4K) produced a number of claims that
  did not survive re-inspection ("five cards per row", "Physical %" label,
  "content right-weighted with empty left side"); discount those. The 1080p,
  iPad, and mobile reviews were consistent with direct inspection.
