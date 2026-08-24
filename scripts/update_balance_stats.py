#!/usr/bin/env python3
"""Fetch the published ER Balance Sheet and regenerate all stat consumers.

The user-supplied published Google Sheet is the AUTHORITATIVE source for every
published item-stat column.  Matching recipe output.stats blocks are replaced
with the sheet's complete row (including explicit zeroes); stale recipe-only
keys are not retained when the sheet has a canonical row.

Provenance: every refresh records a UTC retrieval timestamp, the SHA-256 of
the ingested CSV text, source/schema identity, raw/unique row counts, and the
duplicate-conflict behavior alongside a deterministic changed-item summary.

Run:  python3 scripts/update_balance_stats.py [--csv-file PATH]

Without --csv-file the published sheet is fetched over the network. With it,
the CSV is read from disk (offline/fixture regeneration; provenance still
records the file's own digest and the current UTC time, and clearly reflects
the local-file origin).
"""
import csv, hashlib, json, re, sys, urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUBLISHED_HTML_URL = ("https://docs.google.com/spreadsheets/d/e/2PACX-1vT_DqXbgxfJmrzLJvFov-iqiRwPeSDpaqk_r3fVqfn7-8bfjAgT2ZWfQLiM_D41thtJE-LO5CtHWt50/"
                      "pubhtml?gid=29503079&single=true")
CSV_URL = ("https://docs.google.com/spreadsheets/d/e/2PACX-1vT_DqXbgxfJmrzLJvFov-iqiRwPeSDpaqk_r3fVqfn7-8bfjAgT2ZWfQLiM_D41thtJE-LO5CtHWt50/"
           "pub?gid=29503079&single=true&output=csv")
SHEET_GID = "29503079"
SHEET_TITLE = "ER - Balance Sheet"
# Bump when the _meta layout changes so consumers can detect schema drift.
META_SCHEMA_VERSION = 1

# ── Stat key mapping ────────────────────────────────────────────────────────
SHEET_KEY_TO_STAT = {
    key: re.sub(r'[^a-z0-9]+', '', key.lower())
    for key in (
        'DurationSeconds', 'Classification', 'MedkitCooldown', 'WeaponRecoil',
        'Agility', 'BallisticDamage', 'Destruction', 'XenoDamage',
        'EnergyDamage', 'BioDamage', 'StaminaDamage', 'AuraDamage', 'Health',
        'Stamina', 'Aura', 'BioRegen', 'HealthRegen', 'ProtectionReduction',
        'Armor', 'Shielding', 'Endurance', 'Reflection', 'Resistance',
        'DefenseRating', 'BlockRating', 'CritOffenseRating', 'BioEnergyDrain',
        'StaminaRegen', 'HealthDrain', 'AuraRegen', 'Addiction',
        'AddictionTreatment', 'StaminaDrain', 'Illegal',
    )
}

def sheet_stats(r):
    out = {}
    for k, v in r.items():
        if k in ('', 'Name'): continue
        sk = SHEET_KEY_TO_STAT.get(k)
        if not sk or not str(v).strip(): continue
        try:
            f = float(v)
            out[sk] = int(f) if f == int(f) else round(f, 2)
        except (TypeError, ValueError):
            continue
    return out

# ── Dedupe names, rejecting conflicting published rows ─────────────────────
def dedupe_rows(rows):
    """Drop identical duplicate names; fail closed on conflicting rows."""
    by_name, uniq = {}, []
    for r in rows:
        name = (r.get('Name') or '').strip()
        if not name:
            continue
        comparable = {k: (v or '').strip() for k, v in r.items() if k not in ('', 'Name')}
        if name in by_name:
            if by_name[name] != comparable:
                raise ValueError(f"conflicting published rows for {name!r}")
            continue
        by_name[name] = comparable
        uniq.append(r)
    return uniq

# ── Recipe name matching (kept in sync with tests/balance-stats.test.mjs) ──
def norm(s):
    s = s.lower()
    s = re.sub(r'\s*\((male|female)\)', '', s)
    s = re.sub(r'[^a-z0-9]+', ' ', s).strip()
    # Recipe list spells it "medkit" (small/battle/emergency medkit); sheet
    # uses "Medikit" — the medkit/MediKit/medikit spelling zoo.
    s = re.sub(r'med\s?ikit', 'medkit', s)
    return s

# Sheet-name -> recipe-name alias table. The recipe list carries the published
# sheet's names (rename_items.py), so only the sheet's OWN typos need mapping:
#   - "Minimist" is the sheet's typo for the client's "Minimalist" (prodschema 441/476)
#   - "Pythica Sustained Gloves" drops "Battle" (client 420 says Sustained Battle)
ALIASES = {
    'infensus minimist gloves': 'infensus minimalist gloves',
    'pythica sustained gloves': 'pythica sustained battle gloves',
}
def resolve(n):
    return ALIASES.get(n, n)

def recipe_lookup(data):
    """Recipe lookup by normalized name (first recipe wins, as before)."""
    recipe_by_norm = {}
    for r in data['recipes']:
        recipe_by_norm.setdefault(norm(r['output']['item']), []).append(r)
    def find_recipe(sheet_name):
        rn = resolve(norm(sheet_name))
        if rn in recipe_by_norm:
            return recipe_by_norm[rn][0]
        return None
    return find_recipe

def compute_summary(items, data):
    """Deterministic, machine-readable changed-item summary (no mutation)."""
    find_recipe = recipe_lookup(data)
    stats_added, stats_updated, stats_cleared = [], [], []
    matched_names = set()
    for it in items:
        rec = find_recipe(it['name'])
        if not rec: continue
        matched_names.add(rec['output']['item'])
        old = rec['output'].get('stats') or {}
        new = dict(it['stats'])
        if old == new: continue
        if not old:
            stats_added.append(rec['output']['item'])
        elif not new:
            stats_cleared.append(rec['output']['item'])
        else:
            stats_updated.append(rec['output']['item'])
    return {
        'recipes_matched': len(matched_names),
        'stats_added': sorted(stats_added),
        'stats_updated': sorted(stats_updated),
        'stats_cleared': sorted(stats_cleared),
    }

def apply_stats(items, data):
    """Apply the authoritative sheet rows into recipe output.stats blocks."""
    find_recipe = recipe_lookup(data)
    for it in items:
        rec = find_recipe(it['name'])
        if not rec: continue
        old = rec['output'].get('stats') or {}
        new = dict(it['stats'])
        if old != new:
            rec['output']['stats'] = new

def build_payload_and_summary(csv_text, game_data_path, source_mode='local-fixture'):
    """Build the canonical balance payload + change summary from CSV text.

    Pure w.r.t. disk: nothing is written; game_data is loaded read-only for
    the diff. Provenance records the SHA-256 of csv_text (UTF-8, post-BOM
    strip) and the current UTC time.
    """
    rows = list(csv.DictReader(csv_text.splitlines()))
    uniq = dedupe_rows(rows)
    items = [{'name': r['Name'], 'stats': sheet_stats(r)} for r in uniq]
    data = json.loads(Path(game_data_path).read_text())
    summary = compute_summary(items, data)
    summary['rows_raw'] = len(rows)
    summary['rows_unique'] = len(uniq)
    summary['dupes_dropped'] = len(rows) - len(uniq)

    now_utc = datetime.now(timezone.utc)
    is_live = source_mode == 'live-published-csv'
    source = f'{SHEET_TITLE} (Google Sheets, published HTML, gid={SHEET_GID})'
    source_url = PUBLISHED_HTML_URL
    source_csv_url = CSV_URL
    note = 'Live combat stats — authoritative for recipe output.stats.'
    if not is_live:
        source = f'{SHEET_TITLE} (local CSV fixture)'
        source_url = None
        source_csv_url = None
        note = 'local fixture for offline regeneration; not a live dataset.'
    payload = {
        '_meta': {
            'source': source,
            'source_mode': source_mode,
            'source_url': source_url,
            'source_csv_url': source_csv_url,
            'sheet_title': SHEET_TITLE,
            'sheet_gid': SHEET_GID,
            'source_gid': SHEET_GID,
            'schema_version': META_SCHEMA_VERSION,
            'retrieved_utc': now_utc.strftime('%Y-%m-%dT%H:%M:%SZ'),
            'fetched': now_utc.date().isoformat(),
            'csv_sha256': hashlib.sha256(csv_text.encode('utf-8')).hexdigest(),
            'rows_raw': len(rows), 'rows_unique': len(uniq),
            'dupes_dropped': len(rows) - len(uniq),
            'duplicate_behavior': 'identical-dupes-dropped',
            'changed_items': summary,
            'note': note,
        },
        'items': items,
    }
    return payload, summary

def fetch_csv_text():
    req = urllib.request.Request(CSV_URL, headers={'User-Agent': 'Mozilla/5.0'})
    return urllib.request.urlopen(req, timeout=30).read().decode('utf-8-sig')

def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    csv_file = None
    if argv and argv[0] == '--csv-file':
        if len(argv) < 2:
            raise SystemExit('usage: update_balance_stats.py [--csv-file PATH]')
        csv_file = argv[1]
    if csv_file:
        csv_text = Path(csv_file).read_text(encoding='utf-8-sig')
        print(f"[1] read {len(csv_text.splitlines())} lines from {csv_file} (offline fixture)")
    else:
        csv_text = fetch_csv_text()
        print("[1] fetched live sheet")

    game_path = ROOT / 'data' / 'game_data.json'
    bal_path = ROOT / 'data' / 'balance_stats.json'

    payload, summary = build_payload_and_summary(
        csv_text, game_path,
        source_mode='local-fixture' if csv_file else 'live-published-csv',
    )
    items = payload['items']
    print(f"[2] deduped -> {summary['rows_unique']} unique names "
          f"({summary['dupes_dropped']} identical dupes dropped; conflicting rows fail closed)")

    bal_path.write_text(json.dumps(payload, indent=2))
    print(f"[4] wrote data/balance_stats.json ({len(items)} items, "
          f"csv_sha256={payload['_meta']['csv_sha256'][:12]}…, "
          f"retrieved_utc={payload['_meta']['retrieved_utc']})")

    # ── Merge into recipes ───────────────────────────────────────────────────
    data = json.loads(game_path.read_text())
    apply_stats(items, data)

    # round-trip write (indent=1 is the canonical format — verified 2026-08-08)
    out = json.dumps(data, indent=1)
    if out + '\n' != game_path.read_text() and out != game_path.read_text():
        game_path.write_text(out)
        # verify the new file still round-trips
        assert json.dumps(json.loads(game_path.read_text()), indent=1) == game_path.read_text(), "round-trip broken!"
        print("[5] merged stats into data/game_data.json")
    else:
        print("[5] no recipe stats changed")

    # deterministic changed-item summary
    print(f"    recipes matched: {summary['recipes_matched']}")
    print(f"    stats block ADDED (was empty): {len(summary['stats_added'])}")
    for n in summary['stats_added']: print(f"      + {n}")
    print(f"    stats UPDATED: {len(summary['stats_updated'])}")
    for n in summary['stats_updated']: print(f"      ~ {n}")
    print(f"    stats CLEARED by empty canonical sheet rows: {len(summary['stats_cleared'])}")
    for n in summary['stats_cleared']: print(f"      - {n}")

    find_recipe = recipe_lookup(data)
    unmatched = [it['name'] for it in items if it['stats'] and not find_recipe(it['name'])]
    print(f"    sheet items with stats but NO recipe (reference-only): {len(unmatched)}")

if __name__ == '__main__':
    main()
