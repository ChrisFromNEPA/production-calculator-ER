# Factions and economics

The calculator separates four concepts:

1. **Player spend** — everything paid for mining, production, tax, and the modeled plan.
2. **Colony-owner return** — 85% of mining or production spend at a colony, calculated before tax, returned to that colony's owner.
3. **Global Dominion share** — the remaining 15% of that same pre-tax mining or production spend.
4. **Net faction cost** — player spend minus the 85% that returns to the selected faction at colonies it owns.

The owner return is faction-neutral. BOS, CMG, EC, FDC, GOM, LED, MOTB/MOB, and VI all use the same 85% rule when the colony's configured owner matches the active player's faction. `Unaffiliated` receives no owner return.

## Faction and colony selection

The active player profile supplies the faction used by the calculation. The **Colonies** tab supplies one local actual owner for each colony. The calculator does not invent ownership: an unset or mismatched owner produces no return for the active faction. LED and FDC cooperate as the **Global Dominion** alliance, but that alliance is not a second owner and does not create a second 85% return.

For production, ownership is checked at the production colony selected in the calculator. For mined materials, ownership is checked at the chosen mining source for each material, or the material's first valid mining site when no source was pinned.

Ownership and tax values are local user-maintained world context, not live synchronized game state. Owner changes do not silently alter tax values. Older v2 snapshots that contain multiple owners are normalized to one actual owner; the known LED/FDC pairs use the canonical owner map, while other multi-owner values retain their first valid owner deterministically.

## Before-tax rule

The 85%/15% split is calculated from mining and production spend **before colony tax**. Tax remains a separate charge and is not returned through the owner share.

In simplified form for an eligible operation:

- colony owner: `pre-tax spend × 0.85`
- Global Dominion: `pre-tax spend × 0.15`
- tax: calculated separately under the client-derived colony tax formula

The player still pays the gross amount. The owner return is faction income, not automatically a personal refund.

## Global Dominion allocation assumption

The calculator displays the Global Dominion's 15% share and currently allocates it **50/50 between FDC and LED for planning purposes**:

- FDC: 7.5% of pre-tax mining/production spend
- LED: 7.5% of pre-tax mining/production spend

That 50/50 FDC/LED allocation is an explicit assumption supplied for this model, not presented as a verified game formula. The UI labels it as assumed so it can be corrected without confusing it with the confirmed 85% owner / 15% Global Dominion split.

## Alternative refinement paths

Explicit player path choices always win. Otherwise, when every alternative is priced, the calculator compares estimated net faction cost using:

- the active player's faction;
- the selected production colony;
- selected/fallback mining sources;
- colony owners configured in **Colonies**;
- the universal 85% pre-tax owner return.

The path estimate remains a planning snapshot. It does not include every detailed run-time factor represented in the final plan, and the live in-game price should be verified before a large run.

## Unaffiliated mode

`Unaffiliated` is gross-cost mode. It is useful when the player does not want to model faction income or when the relevant colony ownership is unknown. Global Dominion information can still be shown as an economy breakdown, but no 85% owner return is subtracted from unaffiliated cost.

## Data corrections

Faction aliases and client/recipe codes live in `data/factions.json`. To report a formula issue, open a public GitHub issue with a minimal recipe/path and sanitized workspace export. Do not attach credentials, tokens, or private player data.
