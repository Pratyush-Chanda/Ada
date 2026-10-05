# Changelog
## 0.0.57b_beta.1
This beta improves repository manifest generation with richer file metadata, adaptive concurrent processing, device-aware calibration, safer output handling, and automated tests/CI integration.

## 0.0.56a_beta.1

### Added
- Reworked `fmtree.py` to build a deterministic document-focused `files.json` manifest with Git blob hashes and MIME types.
- Added a cached, device-profile-aware benchmark in root `bench.txt` that tunes separate worker counts for small and large files, capped at six workers total.
- Added concurrent streamed hashing, special ordering/labels for GLOSSARY, NOTES, and CNOTES, and CLI options for selecting the scan root and output path.
- Added atomic manifest and benchmark writes so interrupted runs do not leave partially written JSON.

### Changed
- The scan defaults to the directory containing `fmtree.py` and derives the root label from the Git remote when available.
- Indexing is limited to document formats; Ada-specific excluded root files and directories are retained, with generic tooling directories excluded at any depth.
- Hidden documents are no longer blanket-skipped; known tooling folders are skipped and symlinks are not followed.
- File entries now include Git blob SHA and MIME type alongside their path and display name.
- The GitHub Actions updater automatically benchmarks on a missing or mismatched device profile and commits the refreshed `bench.txt` with `files.json`, without prompting.

### Compatibility notes
- `files.json` now omits non-document files and includes `sha` and `mime` fields on file entries.
- On an interactive local run, a mismatched existing benchmark profile prompts before recalibration; declining reuses cached worker settings when valid, otherwise safe defaults.
