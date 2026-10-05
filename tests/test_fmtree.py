import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import fmtree


class FmtreeTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.root = Path(self.tempdir.name).resolve()
        self.previous_root = fmtree.ROOT
        fmtree.ROOT = self.root

    def tearDown(self):
        fmtree.ROOT = self.previous_root
        self.tempdir.cleanup()

    def test_hash_matches_git_blob_hash(self):
        path = self.root / "notes.md"
        path.write_text("Unicode notes: π\n", encoding="utf-8")
        expected = subprocess.check_output(["git", "hash-object", str(path)], text=True).strip()
        self.assertEqual(fmtree.hash_file(path, "sha1"), expected)

    def test_scan_policy_preserves_documents_but_skips_code_tools_and_ada_exclusions(self):
        (self.root / "README.md").write_text("readme", encoding="utf-8")
        (self.root / "conf.txt").write_text("config", encoding="utf-8")
        (self.root / "app.py").write_text("print('not a doc')", encoding="utf-8")
        (self.root / ".hidden-doc.md").write_text("visible hidden document", encoding="utf-8")
        (self.root / "community").mkdir()
        (self.root / "community" / "hidden.md").write_text("excluded", encoding="utf-8")
        (self.root / ".git").mkdir()
        (self.root / ".git" / "hidden.md").write_text("excluded", encoding="utf-8")
        (self.root / ".installer").mkdir()
        (self.root / ".installer" / "log.md").write_text("excluded tooling log", encoding="utf-8")
        (self.root / "docs").mkdir()
        (self.root / "docs" / "chapter.md").write_text("chapter", encoding="utf-8")
        try:
            (self.root / "linked.md").symlink_to(self.root / "docs" / "chapter.md")
        except (OSError, NotImplementedError):
            pass
        output = self.root / "manifest.json"
        files = []
        tree = fmtree.scan_tree(self.root, output, files)
        paths = {fmtree.relative_path(path) for path in files}
        self.assertEqual(paths, {"README.md", ".hidden-doc.md", "docs/chapter.md"})
        self.assertTrue(any(entry["name"] == "docs" for entry in tree))

    def test_hashing_uses_at_most_six_workers_and_returns_git_hashes(self):
        files = []
        for i in range(8):
            path = self.root / f"small-{i}.md"
            path.write_text(f"sample {i}", encoding="utf-8")
            files.append(path)
        paths = [self.root / "large.md"]
        paths[0].write_bytes(b"x" * (fmtree.SMALL_FILE_LIMIT + 10))
        files.extend(paths)
        actual = fmtree.calculate_hashes(files, "sha1", {"small": 6, "large": 6})
        for path in files:
            expected = subprocess.check_output(["git", "hash-object", str(path)], text=True).strip()
            self.assertEqual(actual[fmtree.relative_path(path)], expected)

    def test_matching_benchmark_cache_is_reused(self):
        settings = {"small": 3, "large": 2}
        cache = {
            "schema": fmtree.BENCH_SCHEMA,
            "device_profile": {"machine": "same"},
            "settings": {
                "small": {"workers": 3},
                "large": {"workers": 2},
            },
        }
        (self.root / "bench.txt").write_text(json.dumps(cache), encoding="utf-8")
        with mock.patch.object(fmtree, "device_profile", return_value={"machine": "same"}), mock.patch.object(
            fmtree, "benchmark_settings", side_effect=AssertionError("matching cache should not benchmark")
        ):
            self.assertEqual(fmtree.get_worker_settings([], "sha1", self.root), settings)

    def test_github_actions_rebenchmarks_mismatched_profile(self):
        cache = {
            "schema": fmtree.BENCH_SCHEMA,
            "device_profile": {"machine": "old"},
            "settings": {"small": {"workers": 2}, "large": {"workers": 1}},
        }
        (self.root / "bench.txt").write_text(json.dumps(cache), encoding="utf-8")
        measured = {
            "small": {"workers": 4, "samples": 0, "bytes_per_trial": 0, "throughput_bytes_per_second": {}},
            "large": {"workers": 2, "samples": 0, "bytes_per_trial": 0, "throughput_bytes_per_second": {}},
        }
        with mock.patch.dict(os.environ, {"GITHUB_ACTIONS": "true"}), mock.patch.object(
            fmtree, "device_profile", return_value={"machine": "new"}
        ), mock.patch.object(fmtree, "benchmark_settings", return_value=measured):
            chosen = fmtree.get_worker_settings([], "sha1", self.root)
        self.assertEqual(chosen, {"small": 4, "large": 2})
        updated = json.loads((self.root / "bench.txt").read_text(encoding="utf-8"))
        self.assertEqual(updated["device_profile"], {"machine": "new"})

    def test_local_decline_reuses_previous_profile_settings(self):
        cache = {
            "schema": fmtree.BENCH_SCHEMA,
            "device_profile": {"machine": "old"},
            "settings": {"small": {"workers": 2}, "large": {"workers": 1}},
        }
        (self.root / "bench.txt").write_text(json.dumps(cache), encoding="utf-8")
        with mock.patch.dict(os.environ, {}, clear=True), mock.patch.object(
            fmtree, "device_profile", return_value={"machine": "new"}
        ), mock.patch.object(fmtree.sys.stdin, "isatty", return_value=True), mock.patch("builtins.input", return_value="n"), mock.patch.object(
            fmtree, "benchmark_settings", side_effect=AssertionError("declining should not benchmark")
        ):
            chosen = fmtree.get_worker_settings([], "sha1", self.root)
        self.assertEqual(chosen, {"small": 2, "large": 1})

    def test_cli_writes_complete_manifest_once_with_hash_and_mime(self):
        (self.root / "readme.md").write_text("hello", encoding="utf-8")
        output = self.root / "out.json"
        with mock.patch.object(fmtree, "get_worker_settings", return_value={"small": 1, "large": 1}):
            self.assertEqual(fmtree.main(["--root", str(self.root), "--out", str(output)]), 0)
        payload = json.loads(output.read_text(encoding="utf-8"))
        entry = payload["children"][0]
        self.assertEqual(entry["path"], "readme.md")
        self.assertTrue(entry["sha"])
        self.assertEqual(entry["mime"], "text/markdown")
        self.assertFalse((self.root / "files.json").exists())


if __name__ == "__main__":
    unittest.main()
