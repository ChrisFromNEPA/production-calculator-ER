# Gear 1.10 tab — recommended refinements (visual review 2026-08-28)

Viewport-chunk visual review (109 viewport screenshots across 1080p, 2K, 4K,
iPad 1024×768, mobile 390×844) plus interaction/logic audit. Two defects were
fixed in code the same day (`biodamage`/`staminadamage` label leak; redundant
delta chips). All remaining findings have now been fixed and verified:

| # | Finding | Status |
|---|---|---|
| 1 | Stale gate toast overlapping content after onboarding | ✅ Fixed — deduped + dismissed on profile completion (`dismissToast`, gated re-fire dedupe) |
| 2 | Protection guide header clipping below 480px | ✅ Fixed — semantic rows; stacked `protects X · faction Y` layout on mobile |
| 3 | Build-planner selects truncating long item names | ✅ Fixed — full selected name (icon + text) on its own label line |
| 4 | Masonry whitespace gaps in 2-column explorer | ℹ️ Accepted — inherent to equal-height grid rows; mitigated at wide sizes by 3 columns |
| 5 | Fixed max-width column on 2K/4K | ✅ Fixed — Gear 1.10-only `:has()` scoping: 1800px @≥2000px, 2200px @≥3000px, 3 explorer columns, 70ch card cap |
| 6a | Long chips wrapping mid-label | ✅ Fixed — single-line chips with ellipsis overflow |
| 6b | Ambiguous "Implant / Other" card titles | ✅ Fixed — implant-only profiles now titled with actual item names |
| 6c | Sparse "no recorded stats" implant cards | ℹ️ Left as-is — intentional empty-state rendering |

Verified in browser after integration (510/510 tests, build, check green):
gate toast deduped and cleared on onboarding; no overlapping toasts; mobile
protection guide stacks without clipping; build planner shows full item names;
2K explorer renders 3 columns with sensible card widths; implant cards titled
"Resistance Amp", "Shield Implant", "Stamina Amplification".

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
