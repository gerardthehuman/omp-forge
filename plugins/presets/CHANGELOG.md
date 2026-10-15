# Changelog

## 1.0.0

- Package name: `omp-model-presets`.
- Add `/preset` backed by native OMP model preset storage.
- Apply named presets session-only by default, preserving native model-switch notifications and history.
- Add preset-name completion and a picker showing default, slow, and smol selectors.
- Reuse native save, list, delete, and persistent switch semantics.
- Restore session role snapshots on resume, fork, and tree navigation without changing config.
