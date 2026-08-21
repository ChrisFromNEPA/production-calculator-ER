# Pull request

## Summary

Describe what changed, why it helps a player or maintainer, and which public
surface is affected.

## User-facing area

- [ ] Calculator
- [ ] Inventory / add stock
- [ ] Gear
- [ ] Colonies / world context
- [ ] Reference or Models
- [ ] Themes/accessibility
- [ ] Data/assets
- [ ] Documentation/tooling only

## Validation

- [ ] `npm run check` (required release gate)
- [ ] `npm run assets:check` (when assets or provenance are affected)
- [ ] Relevant focused gates run (`test:sw-update`, `test:3d`, or `test:budgets` when applicable)
- [ ] Browser verification performed for UI changes, including affected viewport sizes
- [ ] Generated files were rebuilt rather than hand-edited
- [ ] Data sources/provenance included for data changes
- [ ] No private data, credentials, or personal information added

## Privacy/security impact

Describe any changes to storage, import/export, URLs, network requests, or third-party assets. If none, say so.

## Screenshots or evidence

Include screenshots, test output, or links to relevant source evidence when useful.

For data corrections, include the exact item/recipe, output quantity, inputs,
source/evidence, and verification date. For visual changes, include the live
or local URL and the viewport/theme used for screenshots.
