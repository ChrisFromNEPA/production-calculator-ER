# Public player guide

## First calculation

1. Open the public Pages site or run the static build locally.
2. Create a player profile. Leave faction as `Unaffiliated` unless you have a verified reason to select one.
3. Add inventory you actually own. The calculator does not infer holdings from faction membership.
4. Choose an item, quantity, and production destination.
5. Review the gross player spend and the separate faction-return/net-cost figures.
6. Save or export the workspace when you want a portable backup.

## Profiles and factions

The faction selector is profile-specific. It is safe to switch profiles or factions: inventory remains attached to the player, and faction selection does not unlock or hide recipes. Fresh profiles have no automatic colony rebates.

## Colonies and world context

Use the Colonies tab to enter only the ownership and tax information you want to model. Leave ownership unset when you do not know it. Export the colony-world snapshot if another person needs to reproduce the calculation. The snapshot is local context, not a live server feed.

## Plans, gear, and reference tabs

The Calculator supports single and multi-item plans. Gear can be used to build
a plan, and the reference tabs provide item, faction, mining, battle-node,
colony, model, drug, and community-note context. These workflows remain usable
without login or a shared backend.

## Inventory and add stock

Inventory is organized around the repeated task **choose a zone → choose an
item → enter a quantity → add**:

1. Open **Inventory** and choose the storage colony or zone.
2. Use **Mined + refined**, **Mineable**, **Medikits**, **Ammo**, **Boosters /
   drugs**, **Food**, or **All items** to narrow the item browser.
3. Search when a category still has many entries, select the item, enter the
   quantity, and choose **Add to [zone]**.
4. Edit an existing zone row when you need to set an exact quantity, or use
   **Workspace View** below the ledger to review totals across every zone.

The picker is responsive: large screens show the full mined/refined set without
an inner scrollbar, while phones keep the item grid and category tabs compact.
Selecting or adding stock preserves the page position so repeated entry does
not jump away from the workflow. **Scan Screenshot** is an optional assisted
path for storage-terminal screenshots; item matches remain user-confirmed and
quantities should be checked before import.

## Workspace portability

Use `Export workspace` for a complete local snapshot containing supported player
profiles, inventory, plans, gear, preferences, analytics settings, and
colony-world context. Use `Import workspace` on another browser to restore it.
Imports are validated before storage mutation. Legacy inventory-only JSON
remains supported.

Never share a workspace export that contains information you do not intend to publish. Remove private names, notes, or world assumptions before attaching an export to an issue.

## Offline and updates

The Pages artifact is static and includes a service worker for offline-capable assets. If a browser appears stuck on an old version, reload once with the network available, then verify the app version and re-import a current workspace if necessary. Production-time estimates and live synchronization are intentionally not provided.

## Reporting problems

Open an issue in the public repository with:

- the affected tab and direct route, if relevant;
- a minimal recipe or item example;
- expected versus observed behavior;
- browser and viewport information;
- a sanitized export only if needed.

Do not include passwords, tokens, API keys, private URLs, connection strings, or private player data.
