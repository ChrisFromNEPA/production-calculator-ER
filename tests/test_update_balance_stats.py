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
import multiprocessing
import os
import re
import sys
import unittest
from unittest import mock
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
    def test_archives_the_exact_ingested_csv_under_its_digest(self):
        csv_text = make_csv([{"Name": "Item A", "Health": "10"}])
        digest = hashlib.sha256(csv_text.encode("utf-8")).hexdigest()
        payload = {"_meta": {"fetched": "2026-09-02", "csv_sha256": digest}}
        with TemporaryDirectory() as td:
            relative = ubs.archive_csv_snapshot(csv_text, payload, Path(td))
            archived = Path(td) / relative
            self.assertEqual(archived.read_text(), csv_text)
            self.assertEqual(relative, f"data/source-snapshots/balance-sheet/2026-09-02-{digest[:12]}.csv")
            self.assertEqual(ubs.archive_csv_snapshot(csv_text, payload, Path(td)), relative)

    def test_archive_rejects_a_non_date_path_component(self):
        csv_text = make_csv([{"Name": "Item A", "Health": "10"}])
        digest = hashlib.sha256(csv_text.encode("utf-8")).hexdigest()
        payload = {"_meta": {"fetched": "../../escape", "csv_sha256": digest}}
        with TemporaryDirectory() as td:
            with self.assertRaisesRegex(ValueError, "fetched date"):
                ubs.archive_csv_snapshot(csv_text, payload, Path(td))

    def test_archive_refuses_to_follow_a_preexisting_symlink(self):
        csv_text = make_csv([{"Name": "Item A", "Health": "10"}])
        digest = hashlib.sha256(csv_text.encode("utf-8")).hexdigest()
        payload = {"_meta": {"fetched": "2026-09-02", "csv_sha256": digest}}
        with TemporaryDirectory() as td:
            root = Path(td)
            archive = root / "data/source-snapshots/balance-sheet"
            archive.mkdir(parents=True)
            outside = root / "outside.csv"
            target = archive / f"2026-09-02-{digest[:12]}.csv"
            target.symlink_to(outside)
            with self.assertRaisesRegex(ValueError, "snapshot path"):
                ubs.archive_csv_snapshot(csv_text, payload, root)
            self.assertFalse(outside.exists())

    def test_archive_refuses_a_symlinked_parent_directory(self):
        csv_text = make_csv([{"Name": "Item A", "Health": "10"}])
        digest = hashlib.sha256(csv_text.encode("utf-8")).hexdigest()
        payload = {"_meta": {"fetched": "2026-09-02", "csv_sha256": digest}}
        with TemporaryDirectory() as td:
            root = Path(td)
            (root / "data").mkdir()
            outside = root / "outside"
            outside.mkdir()
            (root / "data/source-snapshots").symlink_to(outside, target_is_directory=True)
            with self.assertRaisesRegex(ValueError, "snapshot path"):
                ubs.archive_csv_snapshot(csv_text, payload, root)
            self.assertEqual(list(outside.iterdir()), [])

    def test_archive_rejects_a_fifo_without_blocking(self):
        csv_text = make_csv([{"Name": "Item A", "Health": "10"}])
        digest = hashlib.sha256(csv_text.encode("utf-8")).hexdigest()
        payload = {"_meta": {"fetched": "2026-09-02", "csv_sha256": digest}}
        with TemporaryDirectory() as td:
            root = Path(td)
            archive = root / "data/source-snapshots/balance-sheet"
            archive.mkdir(parents=True)
            os.mkfifo(archive / f"2026-09-02-{digest[:12]}.csv")
            ctx = multiprocessing.get_context("fork")
            result = ctx.Queue()

            def attempt():
                try:
                    ubs.archive_csv_snapshot(csv_text, payload, root)
                except Exception as exc:
                    result.put(type(exc).__name__)

            process = ctx.Process(target=attempt)
            process.start()
            process.join(0.5)
            if process.is_alive():
                process.terminate()
                process.join()
                self.fail("archive blocked while opening a FIFO")
            self.assertEqual(result.get(timeout=0.5), "ValueError")

    def test_archive_never_leaves_a_partial_final_file_after_write_failure(self):
        csv_text = make_csv([{"Name": "Item A", "Health": "10"}])
        digest = hashlib.sha256(csv_text.encode("utf-8")).hexdigest()
        payload = {"_meta": {"fetched": "2026-09-02", "csv_sha256": digest}}
        with TemporaryDirectory() as td:
            root = Path(td)
            final = root / f"data/source-snapshots/balance-sheet/2026-09-02-{digest[:12]}.csv"
            with mock.patch.object(ubs.os, "fsync", side_effect=OSError("simulated write failure")):
                with self.assertRaises(OSError):
                    ubs.archive_csv_snapshot(csv_text, payload, root)
            self.assertFalse(final.exists())

    def test_archive_rolls_back_publication_when_directory_fsync_fails(self):
        csv_text = make_csv([{"Name": "Item A", "Health": "10"}])
        digest = hashlib.sha256(csv_text.encode("utf-8")).hexdigest()
        payload = {"_meta": {"fetched": "2026-09-02", "csv_sha256": digest}}
        with TemporaryDirectory() as td:
            root = Path(td)
            final = root / f"data/source-snapshots/balance-sheet/2026-09-02-{digest[:12]}.csv"
            with mock.patch.object(ubs.os, "fsync", side_effect=[None, OSError("directory fsync failure"), OSError("rollback fsync failure")]):
                with self.assertRaises(OSError):
                    ubs.archive_csv_snapshot(csv_text, payload, root)
            self.assertFalse(final.exists())

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
