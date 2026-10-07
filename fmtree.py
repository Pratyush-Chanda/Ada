#!/usr/bin/env python3
"""Generate a repository-local files.json document manifest."""

from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import json
import mimetypes
import os
import platform
import re
import subprocess
import sys
import tempfile
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parent
SMALL_FILE_LIMIT = 256 * 1024
MAX_WORKERS = 6
BENCH_MAX_BYTES_PER_FILE = 2 * 1024 * 1024
BENCH_SCHEMA = 1

SKIP_DIRECTORIES = {
    ".git",
    ".venv",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    "node_modules",
    ".github",
    ".vscode",
    ".vercel",
    ".installer",
    "tests",
    "TESTS",
}

# Keep Ada's repository-specific exclusions, but apply the generic tooling
# exclusions above at every directory depth.
SKIP_ROOT_DIRECTORIES = {"community", "waiting-list", "api", "bin", "GH Fix"}
SKIP_ROOT_FILES = {
    "LICENSE",
    "conf.txt",
    "files.json",
    "index.html",
    "favicon.png",
    "manifest.json",
    "service-worker.js",
    "offline.html",
    "offline.png",
    "admins.json",
    "obsidian-md.js",
    "obsidian-markdown-it.js",
    "fallback.html",
    "autopush.sh",
    "installer.html",
    "package.json",
    "package-lock.json",
    "tree.txt",
    "zip.sh",
    "bench.txt",
}

ALLOWED_FILE_SUFFIXES = {
    ".md",
    ".markdown",
    ".txt",
    ".rtf",
    ".pdf",
    ".doc",
    ".docx",
    ".ppt",
    ".pptx",
    ".xls",
    ".xlsx",
    ".csv",
    ".odt",
    ".odp",
    ".ods",
    ".epub",
}

SECTION_ORDER = {"GLOSSARY": 0, "NOTES": 1, "CNOTES": 2}
SECTION_EMOJI = {"GLOSSARY": "📒", "NOTES": "📓", "CNOTES": "📔"}
DEFAULT_WORKERS = {"small": 4, "large": 2}


def run_git(*arguments: str) -> str:
    """Run Git in the selected scan root and return trimmed stdout."""
    result = subprocess.run(
        ["git", *arguments],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def repository_name() -> str:
    """Return the repository name from origin, falling back to the root name."""
    try:
        remote = run_git("config", "--get", "remote.origin.url").rstrip("/")
    except (OSError, subprocess.CalledProcessError):
        return ROOT.name
    match = re.search(r"/([^/]+?)(?:\.git)?$", remote)
    if match:
        return match.group(1)
    match = re.search(r":([^/:]+?)(?:\.git)?$", remote)
    return match.group(1) if match else ROOT.name


def git_object_format() -> str:
    """Return the repository's Git object format, with SHA-1 as fallback."""
    try:
        object_format = run_git("rev-parse", "--show-object-format")
    except (OSError, subprocess.CalledProcessError):
        return "sha1"
    return object_format if object_format in hashlib.algorithms_available else "sha1"


def relative_path(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def is_allowed_file(path: Path) -> bool:
    if path.parent.resolve() == ROOT and path.name in SKIP_ROOT_FILES:
        return False
    return path.suffix.lower() in ALLOWED_FILE_SUFFIXES


def section_label(name: str) -> str | None:
    suffix = Path(name).suffix
    stem = name[: -len(suffix)] if suffix else name
    upper_stem = stem.upper()
    for label in SECTION_ORDER:
        if upper_stem == label or upper_stem.endswith(f"-{label}") or upper_stem.endswith(f"_{label}"):
            return label
    return None


def manifest_name(name: str) -> str:
    label = section_label(name)
    return f"{SECTION_EMOJI[label]} {name}" if label else name


def child_sort_key(path: Path) -> tuple[int, str]:
    label = section_label(path.name)
    return (SECTION_ORDER[label] if label else len(SECTION_ORDER), path.name.casefold())


def should_skip(path: Path, output_path: Path) -> bool:
    try:
        if path.resolve() == output_path:
            return True
        if path.is_symlink():
            return True
    except OSError:
        return True

    if path.is_dir():
        if path.name in SKIP_DIRECTORIES:
            return True
        if path.parent.resolve() == ROOT and path.name in SKIP_ROOT_DIRECTORIES:
            return True
        return False
    return not (path.is_file() and is_allowed_file(path))


def iter_children(path: Path, output_path: Path) -> Iterable[Path]:
    try:
        children = sorted(path.iterdir(), key=child_sort_key)
    except OSError as exc:
        raise RuntimeError(f"Unable to read directory: {path}") from exc

    for child in children:
        if should_skip(child, output_path):
            continue
        try:
            if child.is_dir() or (child.is_file() and is_allowed_file(child)):
                yield child
        except OSError as exc:
            raise RuntimeError(f"Unable to inspect path: {child}") from exc


def scan_tree(path: Path, output_path: Path, files: list[Path]) -> list[dict]:
    """Collect the display tree and included files without following symlinks."""
    children: list[dict] = []
    for child in iter_children(path, output_path):
        if child.is_dir():
            children.append(
                {
                    "type": "folder",
                    "name": manifest_name(child.name),
                    "children": scan_tree(child, output_path, files),
                }
            )
        else:
            files.append(child)
            children.append(
                {
                    "type": "file",
                    "name": manifest_name(child.name),
                    "path": relative_path(child),
                }
            )
    return children


def hash_file(path: Path, object_format: str) -> str:
    """Compute Git's blob object hash by streaming file contents."""
    try:
        before = path.stat()
        digest = hashlib.new(object_format)
        digest.update(f"blob {before.st_size}\0".encode("ascii"))
        bytes_read = 0
        with path.open("rb") as handle:
            while chunk := handle.read(1024 * 1024):
                digest.update(chunk)
                bytes_read += len(chunk)
        after = path.stat()
    except OSError as exc:
        raise RuntimeError(f"Unable to hash file: {path}") from exc

    if bytes_read != before.st_size or after.st_size != before.st_size or after.st_mtime_ns != before.st_mtime_ns:
        raise RuntimeError(f"File changed while it was being hashed: {path}")
    return digest.hexdigest()


def benchmark_hash(path: Path, object_format: str) -> int:
    """Read and hash a bounded prefix for calibration; return bytes processed."""
    try:
        size = path.stat().st_size
        digest = hashlib.new(object_format)
        digest.update(f"blob {size}\0".encode("ascii"))
        remaining = min(size, BENCH_MAX_BYTES_PER_FILE)
        bytes_read = 0
        with path.open("rb") as handle:
            while remaining:
                chunk = handle.read(min(1024 * 1024, remaining))
                if not chunk:
                    break
                digest.update(chunk)
                bytes_read += len(chunk)
                remaining -= len(chunk)
        digest.digest()
        return bytes_read
    except OSError as exc:
        raise RuntimeError(f"Unable to benchmark file: {path}") from exc


def _read_memory_bytes() -> int | None:
    if sys.platform.startswith("linux"):
        try:
            for line in Path("/proc/meminfo").read_text(encoding="ascii").splitlines():
                if line.startswith("MemTotal:"):
                    return int(line.split()[1]) * 1024
        except (OSError, ValueError, IndexError):
            pass
    if hasattr(os, "sysconf"):
        try:
            return int(os.sysconf("SC_PHYS_PAGES") * os.sysconf("SC_PAGE_SIZE"))
        except (ValueError, OSError, AttributeError):
            pass
    return None


def _cpu_model() -> str:
    if sys.platform.startswith("linux"):
        try:
            for line in Path("/proc/cpuinfo").read_text(encoding="utf-8", errors="replace").splitlines():
                if line.lower().startswith(("model name", "hardware")):
                    return line.split(":", 1)[1].strip()
        except OSError:
            pass
    return platform.processor() or "unknown"


def device_profile() -> dict:
    """Describe performance-relevant device/runtime characteristics."""
    profile = {
        "os": platform.system(),
        "os_release": platform.release(),
        "architecture": platform.machine(),
        "cpu_model": _cpu_model(),
        "logical_cpus": os.cpu_count() or 1,
        "memory_bytes": _read_memory_bytes(),
        "storage_device": ROOT.stat().st_dev,
        "python_implementation": platform.python_implementation(),
        "python_version": platform.python_version(),
        "git_object_format": git_object_format(),
    }
    return profile


def _sample_files(files: list[Path], category: str) -> list[Path]:
    if category == "small":
        candidates = [p for p in files if p.stat().st_size <= SMALL_FILE_LIMIT]
        limit = 12
    else:
        candidates = [p for p in files if p.stat().st_size > SMALL_FILE_LIMIT]
        limit = 6
    candidates.sort(key=lambda p: (p.stat().st_size, p.as_posix().casefold()))
    if len(candidates) <= limit:
        return candidates
    indexes = sorted({round(i * (len(candidates) - 1) / (limit - 1)) for i in range(limit)})
    return [candidates[index] for index in indexes]


def _candidate_workers() -> list[int]:
    return [workers for workers in (1, 2, 3, 4, 6) if workers <= MAX_WORKERS]


def benchmark_settings(files: list[Path], object_format: str) -> dict:
    """Calibrate small and large file concurrency with a bounded real-file sample."""
    result: dict[str, dict] = {}
    candidates = _candidate_workers()
    for category in ("small", "large"):
        sample = _sample_files(files, category)
        if not sample:
            result[category] = {
                "workers": DEFAULT_WORKERS[category],
                "samples": 0,
                "bytes_per_trial": 0,
                "throughput_bytes_per_second": {},
            }
            continue

        throughputs: dict[str, float] = {}
        for worker_count in candidates:
            start = time.perf_counter()
            with concurrent.futures.ThreadPoolExecutor(max_workers=worker_count) as executor:
                processed = list(executor.map(lambda p: benchmark_hash(p, object_format), sample))
            elapsed = max(time.perf_counter() - start, 1e-9)
            throughputs[str(worker_count)] = sum(processed) / elapsed

        best_rate = max(throughputs.values())
        selected = min(
            int(count)
            for count, rate in throughputs.items()
            if rate >= best_rate * 0.97
        )
        result[category] = {
            "workers": selected,
            "samples": len(sample),
            "bytes_per_trial": sum(min(p.stat().st_size, BENCH_MAX_BYTES_PER_FILE) for p in sample),
            "throughput_bytes_per_second": throughputs,
        }
    return result


def read_bench_file(path: Path) -> dict | None:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(value, dict) or value.get("schema") != BENCH_SCHEMA:
        return None
    return value


def _settings_from_cache(cache: dict | None) -> dict[str, int] | None:
    try:
        settings = cache["settings"]
        selected = {kind: int(settings[kind]["workers"]) for kind in ("small", "large")}
        if all(1 <= count <= MAX_WORKERS for count in selected.values()):
            return selected
    except (TypeError, KeyError, ValueError):
        pass
    return None


def _write_bench_file(path: Path, profile: dict, measurements: dict) -> None:
    payload = {
        "schema": BENCH_SCHEMA,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "device_profile": profile,
        "max_workers": MAX_WORKERS,
        "small_file_limit_bytes": SMALL_FILE_LIMIT,
        "settings": measurements,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent, text=True)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            json.dump(payload, handle, indent=2, ensure_ascii=False)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_name, path)
    except Exception:
        try:
            os.unlink(temporary_name)
        except FileNotFoundError:
            pass
        raise


def _run_on_github_actions() -> bool:
    return os.environ.get("GITHUB_ACTIONS", "").lower() == "true"


def _ask_to_rebenchmark() -> bool:
    if not sys.stdin.isatty():
        print("Benchmark profile differs, but input is not interactive; reusing available settings.")
        return False
    while True:
        answer = input("Benchmark profile differs from this device. Re-benchmark now? [y/n] ").strip().lower()
        if answer in {"y", "yes"}:
            return True
        if answer in {"n", "no"}:
            return False
        print("Please answer y or n.")


def get_worker_settings(
    files: list[Path],
    object_format: str,
    root: Path,
    skip_benchmark: bool = False,
) -> dict[str, int]:
    """Reuse a matching cache, or benchmark on first use/profile mismatch."""
    bench_path = root / "bench.txt"
    cache = read_bench_file(bench_path)
    old_settings = _settings_from_cache(cache)

    if skip_benchmark:
        if old_settings:
            print(f"Benchmark skipped; using cached worker settings from {bench_path}.")
            return old_settings
        print("Benchmark skipped; using safe default worker settings.")
        return DEFAULT_WORKERS.copy()

    profile = device_profile()

    if cache is not None and cache.get("device_profile") == profile and old_settings:
        print(f"Using matching benchmark profile from {bench_path}.")
        return old_settings

    should_benchmark = cache is None
    if cache is None:
        print("No usable bench.txt found; calibrating hash workers.")
    elif _run_on_github_actions():
        print("Benchmark profile differs in GitHub Actions; recalibrating automatically.")
        should_benchmark = True
    elif _ask_to_rebenchmark():
        should_benchmark = True
    else:
        print("Keeping existing benchmark settings where available; using safe defaults otherwise.")

    if should_benchmark:
        measurements = benchmark_settings(files, object_format)
        _write_bench_file(bench_path, profile, measurements)
        print(f"Benchmark profile saved to {bench_path}.")
        selected = _settings_from_cache({"settings": measurements})
        if selected:
            return selected

    return old_settings or DEFAULT_WORKERS.copy()


def _allocate_workers(groups: dict[str, list[Path]], selected: dict[str, int]) -> dict[str, int]:
    active = [kind for kind in ("small", "large") if groups[kind]]
    allocated = {kind: max(1, min(MAX_WORKERS, selected[kind])) for kind in active}
    while sum(allocated.values()) > MAX_WORKERS:
        reducible = [kind for kind in active if allocated[kind] > 1]
        if not reducible:
            break
        kind = max(reducible, key=lambda item: allocated[item])
        allocated[kind] -= 1
    return allocated


def calculate_hashes(
    files: list[Path],
    object_format: str,
    settings: dict[str, int],
    verbose: bool = True,
    worker_count: int | None = None,
) -> dict[str, str]:
    """Hash files concurrently; an explicit worker count overrides auto limits."""
    sizes = {path: path.stat().st_size for path in files}
    groups = {
        "small": [path for path in files if sizes[path] <= SMALL_FILE_LIMIT],
        "large": [path for path in files if sizes[path] > SMALL_FILE_LIMIT],
    }
    for group in groups.values():
        group.sort(key=lambda path: (-path.stat().st_size, path.as_posix().casefold()))
    allocated = _allocate_workers(groups, settings)
    results: dict[str, str] = {}
    progress_lock = threading.Lock()
    completed = 0
    total = len(files)

    def finish_hash(future: concurrent.futures.Future, path: Path, category: str) -> tuple[str, str]:
        nonlocal completed
        file_hash = future.result()
        path_key = relative_path(path)
        if verbose:
            with progress_lock:
                completed += 1
                print(
                    f"HASHED [{completed}/{total}] {category} | {path_key} | "
                    f"{sizes[path]:,} bytes | sha={file_hash}",
                    flush=True,
                )
        return path_key, file_hash

    if worker_count is not None:
        if worker_count < 1:
            raise ValueError("worker_count must be at least 1")
        results: dict[str, str] = {}
        ordered_files = sorted(files, key=lambda path: (-sizes[path], path.as_posix().casefold()))
        with concurrent.futures.ThreadPoolExecutor(max_workers=worker_count) as executor:
            future_paths = {
                executor.submit(hash_file, path, object_format): path for path in ordered_files
            }
            for future in concurrent.futures.as_completed(future_paths):
                path = future_paths[future]
                category = "small" if sizes[path] <= SMALL_FILE_LIMIT else "large"
                path_key, file_hash = finish_hash(future, path, category)
                results[path_key] = file_hash
        return results

    def hash_group(category: str) -> dict[str, str]:
        with concurrent.futures.ThreadPoolExecutor(max_workers=allocated[category]) as executor:
            future_paths = {
                executor.submit(hash_file, path, object_format): path for path in groups[category]
            }
            group_results: dict[str, str] = {}
            for future in concurrent.futures.as_completed(future_paths):
                path = future_paths[future]
                path_key, file_hash = finish_hash(future, path, category)
                group_results[path_key] = file_hash
            return group_results

    active_groups = [category for category in ("large", "small") if category in allocated]
    if len(active_groups) == 2:
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(hash_group, category) for category in active_groups]
            for future in concurrent.futures.as_completed(futures):
                results.update(future.result())
    elif active_groups:
        results.update(hash_group(active_groups[0]))
    return results


def write_manifest(output_path: Path, payload: dict) -> None:
    """Atomically replace the complete manifest after all hashes are ready."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary_name = tempfile.mkstemp(prefix=f".{output_path.name}.", suffix=".tmp", dir=output_path.parent, text=True)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            json.dump(payload, handle, indent=2, ensure_ascii=False)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_name, output_path)
    except Exception:
        try:
            os.unlink(temporary_name)
        except FileNotFoundError:
            pass
        raise


def positive_worker_count(value: str) -> int:
    try:
        worker_count = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("worker count must be a positive integer") from exc
    if worker_count < 1:
        raise argparse.ArgumentTypeError("worker count must be at least 1")
    return worker_count


def main(argv: list[str] | None = None) -> int:
    global ROOT
    parser = argparse.ArgumentParser(description="Generate a repository-local files.json document manifest")
    parser.add_argument("--root", default=str(ROOT), help="Repository root to scan (default: directory containing fmtree.py)")
    parser.add_argument("--out", "--output", dest="out", default=None, help="Output path (default: <root>/files.json)")
    parser.add_argument("--quiet", action="store_true", help="Suppress per-file hash completion output")
    parser.add_argument("--skip-benchmark", action="store_true", help="Skip calibration; use cached settings or safe defaults")
    parser.add_argument(
        "--workers",
        "--hash-workers",
        dest="workers",
        type=positive_worker_count,
        default=None,
        metavar="N",
        help="Use exactly N concurrent file-hash workers (bypasses benchmarking and the automatic six-worker cap)",
    )
    args = parser.parse_args(argv)

    ROOT = Path(args.root).expanduser().resolve()
    if not ROOT.is_dir():
        parser.error(f"scan root is not a directory: {ROOT}")
    output_path = Path(args.out or (ROOT / "files.json")).expanduser().resolve()
    if output_path == ROOT:
        parser.error("--out must identify a file, not the repository directory")

    name = repository_name()
    if not name:
        parser.error("could not determine a repository name")

    files: list[Path] = []
    tree_children = scan_tree(ROOT, output_path, files)
    object_format = git_object_format()
    if args.workers is not None:
        print(f"Using {args.workers} custom hash worker(s); benchmarking skipped.")
        settings = DEFAULT_WORKERS.copy()
    else:
        settings = get_worker_settings(
            files, object_format, ROOT, skip_benchmark=args.skip_benchmark
        )
    hashes = calculate_hashes(
        files,
        object_format,
        settings,
        verbose=not args.quiet,
        worker_count=args.workers,
    )

    def attach_hashes(children: list[dict]) -> None:
        for entry in children:
            if entry["type"] == "folder":
                attach_hashes(entry["children"])
            else:
                path = entry["path"]
                full_path = ROOT / Path(path)
                mime, _ = mimetypes.guess_type(full_path.name)
                entry["sha"] = hashes[path]
                entry["mime"] = mime or "application/octet-stream"

    attach_hashes(tree_children)
    payload = {"type": "folder", "name": name, "children": tree_children}
    write_manifest(output_path, payload)
    print(f"files.json generated for {name}: {len(files)} file(s), written to {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
