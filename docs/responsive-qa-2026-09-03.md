# Production Calculator ER — Responsive UX QA

**Date:** 2026-09-03
**Candidate:** v1.4.2, branch `qa/responsive-audit-2026-09-03`
**Application:** <http://192.168.1.129:4173/> and locally built Pages artifact

## Executive summary

The responsive audit found **nine distinct UX/accessibility defects** (zero critical, zero high, seven medium, two low). All nine were reproduced, corrected, and covered by automated regression tests.

Final automated browser sweeps evaluated **282 combinations** spanning the six requested display classes, every public view, all themes, and the 75%, 100%, and 150% text-size settings. The final sweep found:

- **0 horizontal-overflow states**
- **0 detected clipped-text states**
- **0 runtime exceptions**
- **0 console errors**
- **0 failed network requests**

The production browser gate separately passed **20/20 real-Chromium UX tests**, including a full view/viewport/text-size matrix, all-theme persistence, phone/tablet target sizing, direct-route onboarding focus, overlays, menus, modals, notifications, calculator interactions, and browser resource/error budgets.

## Coverage matrix

| Class | CSS viewport used | Additional coverage |
|---|---:|---|
| Mobile | 390×844 | Exploratory checks also covered 360×640, 375×667, and 430×932 |
| iPad | 768×1024 | Exploratory checks also covered 810×1080, 1024×768, and 1180×820 |
| 720p | 1280×720 | Every public view at 75%, 100%, and 150% text |
| 1080p | 1920×1080 | Every public view at 75%, 100%, and 150% text |
| 2K | 2560×1440 | Every public view at 75%, 100%, and 150% text |
| 4K | 3840×2160 | Every public view at 75%, 100%, and 150% text |

Public views covered: Calculator, Gear, Inventory, Gear 1.10, Colonies, Drugs, Battle Nodes, and Community.

Theme coverage: Auto, Dark, Light, Trans, Rainbow, BOS, CMG, EC, FDC, Global Order of Mankind, LED, The Forge, and Xero Global.

Key flows covered: first-run onboarding, returning profile, direct gated routes, item search and selection, valid/invalid calculations, combined plan, inventory entry, Gear picker and modal close, Gear 1.10 filters, Colonies controls, Drugs search, Battle Nodes colony controls and map modal, Community links, Settings, More navigation, theme/text-size persistence, toast dismissal, and service-worker update/offline recovery.

## Findings and resolution

| # | Severity | Category | Finding | Resolution |
|---|---|---|---|---|
| 1 | Medium | Visual/Accessibility | Picker names, cost labels, material names, and patch stat chips could truncate at narrow widths or 150% text. | Labels and chips now wrap fully; the browser gate asserts their full rendered dimensions. |
| 2 | Medium | Responsive layout | Gear 1.10, patch cards, Settings sizing controls, and navigation could widen the page at high text scale. | Min-content constraints were removed, compact Settings columns added, Gear status wrapped, and navigation now refits after text-size changes. |
| 3 | Medium | Touch accessibility | Several phone/iPad actions were smaller than 44×44 px, including the Gear picker close action. | Phone/tablet action controls now enforce 44×44 px minimum targets. |
| 4 | Medium | Layering | The iPad More dropdown could paint behind the separately stacked player toolbar. | The complete header stacking context is raised while More is open. |
| 5 | Medium | Keyboard accessibility | First-run onboarding on `#patch-changes` focused a hidden Calculator search field and initialized the route twice. | The duplicate initialization was removed and focus now enters the visible requested view. |
| 6 | Medium | Notifications | Multiple fixed toasts could stack over useful content and collide with mobile navigation, with no immediate dismiss control. | Only the current notification remains; it has a 44 px dismiss action and clears the mobile navigation. |
| 7 | Medium | Theme accessibility | Small semantic text in Light and Trans themes missed WCAG AA contrast on light surfaces. | Semantic palette values were darkened and are guarded by contrast tests across all theme surfaces. |
| 8 | Low | Tablet UX | Battle Nodes colony chips formed a horizontally clipped strip with weak touch-platform scroll affordance. | Colony choices wrap on tablet widths while retaining compact mobile behavior. |
| 9 | Low | Large-display layout | 2K/4K workspaces and the Gear picker used too little of the available canvas. | Main workspaces now expand to 1600 px/2200 px and the Gear picker to 800 px/960 px at high-resolution breakpoints. |

A long dynamic picker placeholder was also shortened to `Search final items…`; the live item count remains in the adjacent status text.

## Verification evidence

- `npm run check`: **passed**
  - Node: **536/536**
  - Python: **14/14**
  - syntax/quality, static accessibility, generated-data drift, Pages build, served baseline, and engine coverage: passed
- `CHROMIUM_BIN=/snap/bin/chromium npm run test:browser-ux`: **20/20 passed**
- Service-worker lifecycle with isolated Chromium headless shell: **6/6 passed**
- Asset provenance: **4,433/4,433 binary files passed**
- Binary-growth hygiene: **0 new binaries**, passed
- `npm audit --include=dev`: **0 vulnerabilities**
- Pages build: **1,787 files, 24,389,350 bytes**

## Representative screenshots

Final screenshots for the six requested display classes were retained with the
interactive QA artifact generated for this audit; binary evidence is intentionally
not committed to the source repository.

## Testing notes and limits

This is broad deterministic browser and exploratory coverage, not a mathematical proof across every physical handset, browser engine, operating-system font, or user-generated dataset. Chromium was used for the executable viewport matrix because it is the project's fail-closed production browser gate. The resulting CSS and semantic fixes are standards-based and do not rely on device-specific user-agent behavior.
