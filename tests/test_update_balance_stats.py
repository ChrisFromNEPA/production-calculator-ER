"""Focused tests for the balance-sheet freshness/provenance slice.

Covers scripts/update_balance_stats.py:
  - deterministic build of the canonical payload from CSV text (no network)
  - provenance metadata: UTC retrieval timestamp, raw CSV SHA-256,
    source/schema identity, raw/unique row counts, duplicate-conflict
    behavior
  - deterministic changed-item summary (sorted, no secrets)
"""
import hashlib
import importlib.util
import json
import re
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "scripts" / "update_balance_stats.py"

spec = importlib.util.spec_from_file_location("update_balance_stats", SCRIPT)
assert spec and spec.loader
ubs = importlib.util.module_from_spec(spec)
sys.modules["update_balance_stats"] = ubs
spec.loader.exec_module(ubs)


CSV_COLUMNS = ["Name", "Health", "Agility", "DurationSeconds"]


def make_csv(rows):
    lines = [",".join(CSV_COLUMNS)]
    for r in rows:
        lines.append(",".join(str(r.get(c, "")) for c in CSV_COLUMNS))
    return "\n".join(lines) + "\n"


class PayloadTests(unittest.TestCase):
    def test_build_payload_records_provenance_metadata(self):
        csv_text = make_csv([
            {"Name": "Item A", "Health": "10", "Agility": "-1"},
            {"Name": "Item B", "DurationSeconds": "360"},
        ])
        with TemporaryDirectory() as td:
            game_data = {
                "recipes": [
                    {"output": {"item": "Item A"}},
                    {"output": {"item": "Item B", "stats": {"health": 5}}},
                ]
            }
            gd_path = Path(td) / "game_data.json"
            gd_path.write_text(json.dumps(game_data, indent=1))

            payload, summary = ubs.build_payload_and_summary(csv_text, gd_path)

            meta = payload["_meta"]
            self.assertEqual(meta["source_mode"], "local-fixture")
            self.assertEqual(meta["source"], "ER - Balance Sheet (local CSV fixture)")
            self.assertIsNone(meta["source_url"])
            self.assertIsNone(meta["source_csv_url"])
            self.assertIn("local fixture", meta["note"])
            self.assertEqual(meta["rows_raw"], 2)
            self.assertEqual(meta["rows_unique"], 2)
            self.assertEqual(meta["dupes_dropped"], 0)
            self.assertEqual(meta["duplicate_behavior"], "identical-dupes-dropped")
            self.assertEqual(
                meta["csv_sha256"],
                hashlib.sha256(csv_text.encode("utf-8")).hexdigest(),
            )
            self.assertEqual(meta["schema_version"], ubs.META_SCHEMA_VERSION)
            self.assertEqual(meta["source_gid"], "29503079")
            self.assertEqual(meta["sheet_gid"], "29503079")
            # UTC retrieval timestamp: full ISO-8601 with timezone and seconds
            self.assertRegex(
                meta["retrieved_utc"],
                r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$",
            )
            # legacy local date field remains present
            self.assertRegex(meta["fetched"], r"^\d{4}-\d{2}-\d{2}$")
            # items exactly reflect the CSV
            self.assertEqual(
                payload["items"],
                [
                    {"name": "Item A", "stats": {"health": 10, "agility": -1}},
                    {"name": "Item B", "stats": {"durationseconds": 360}},
                ],
            )
            # deterministic changed-item summary: sorted recipe names
            self.assertEqual(summary["stats_updated"], ["Item B"])
            self.assertEqual(summary["stats_added"], ["Item A"])
            self.assertEqual(meta["changed_items"], summary)

    def test_live_source_mode_retains_published_source_identity(self):
        csv_text = make_csv([{ "Name": "Item A", "Health": "10" }])
        with TemporaryDirectory() as td:
            gd_path = Path(td) / "game_data.json"
            gd_path.write_text(json.dumps({"recipes": []}))
            payload, _ = ubs.build_payload_and_summary(csv_text, gd_path, "live-published-csv")

        meta = payload["_meta"]
        self.assertEqual(meta["source_mode"], "live-published-csv")
        self.assertIn("Google Sheets", meta["source"])
        self.assertEqual(meta["source_url"], ubs.PUBLISHED_HTML_URL)
        self.assertEqual(meta["source_csv_url"], ubs.CSV_URL)
        self.assertIn("Live combat stats", meta["note"])

    def test_identical_duplicates_are_dropped_and_counted(self):
        row = {"Name": "Item A", "Health": "10"}
        csv_text = make_csv([row, dict(row), row])
        with TemporaryDirectory() as td:
            gd_path = Path(td) / "game_data.json"
            gd_path.write_text(json.dumps({"recipes": []}))

            payload, _ = ubs.build_payload_and_summary(csv_text, gd_path)

            self.assertEqual(payload["_meta"]["rows_raw"], 3)
            self.assertEqual(payload["_meta"]["rows_unique"], 1)
            self.assertEqual(payload["_meta"]["dupes_dropped"], 2)

    def test_conflicting_duplicates_fail_closed(self):
        csv_text = make_csv([
            {"Name": "Item A", "Health": "10"},
            {"Name": "Item A", "Health": "20"},
        ])
        with TemporaryDirectory() as td:
            gd_path = Path(td) / "game_data.json"
            gd_path.write_text(json.dumps({"recipes": []}))

            with self.assertRaisesRegex(ValueError, r"conflicting published rows"):
                ubs.build_payload_and_summary(csv_text, gd_path)

    def test_changed_item_summary_is_deterministic_and_machine_readable(self):
        csv_text = make_csv([
            {"Name": "Zeta", "Health": "1"},
            {"Name": "Alpha", "Health": "2"},
            {"Name": "Mid", "Health": "3"},
        ])
        with TemporaryDirectory() as td:
            game_data = {
                "recipes": [
                    {"output": {"item": "Zeta"}},
                    {"output": {"item": "Alpha", "stats": {"health": 9}}},
                    {"output": {"item": "Mid"}},
                ]
            }
            gd_path = Path(td) / "game_data.json"
            gd_path.write_text(json.dumps(game_data, indent=1))

            _, s1 = ubs.build_payload_and_summary(csv_text, gd_path)
            _, s2 = ubs.build_payload_and_summary(csv_text, gd_path)

            self.assertEqual(s1, s2)
            self.assertEqual(s1["stats_added"], ["Mid", "Zeta"])  # sorted
            self.assertEqual(s1["stats_updated"], ["Alpha"])
            self.assertEqual(s1["stats_cleared"], [])
            self.assertEqual(s1["recipes_matched"], 3)


class MetaIntegrityTests(unittest.TestCase):
    def test_committed_balance_stats_meta_matches_its_own_rows(self):
        bal = json.loads((ROOT / "data" / "balance_stats.json").read_text())
        meta = bal["_meta"]
        self.assertEqual(meta["rows_raw"], 397)
        self.assertEqual(meta["rows_unique"], 386)
        self.assertEqual(meta["dupes_dropped"], 11)
        self.assertEqual(meta["duplicate_behavior"], "identical-dupes-dropped")
        self.assertEqual(meta["source_mode"], "live-published-csv")
        self.assertIsInstance(meta["changed_items"], dict)
        self.assertEqual(meta["changed_items"]["recipes_matched"], 386)
        self.assertEqual(meta["changed_items"]["stats_added"], [])
        self.assertEqual(meta["changed_items"]["stats_updated"], [])
        self.assertEqual(meta["changed_items"]["stats_cleared"], [])
        self.assertIn("retrieved_utc", meta)
        self.assertRegex(meta["retrieved_utc"], r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
        self.assertRegex(meta["csv_sha256"], r"^[0-9a-f]{64}$")
        self.assertIn("dupes_dropped", meta)
        self.assertIn("duplicate_behavior", meta)
        self.assertIn("schema_version", meta)

    def test_generated_mirror_carries_the_same_meta(self):
        src = (ROOT / "src" / "balance_stats.js").read_text()
        m = re.search(r"window\.BALANCE_STATS = (\{.*\});\n?$", src, re.S)
        self.assertTrue(m, "generated mirror missing window.BALANCE_STATS")
        mirror = json.loads(m.group(1))
        canonical = json.loads((ROOT / "data" / "balance_stats.json").read_text())
        self.assertEqual(mirror["_meta"], canonical["_meta"])
        self.assertEqual(mirror["items"], canonical["items"])


if __name__ == "__main__":
    unittest.main()
