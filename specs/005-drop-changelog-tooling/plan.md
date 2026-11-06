# Implementation Plan: Delete the changelog tooling the release workflow no longer uses

**Branch**: `019-drop-changelog-tooling` | **Spec**: [spec.md](./spec.md)

## Summary

Delete the preset, the script and the three dev dependencies; drop the preset's `.vscodeignore` line. No source change.

## Technical context

- Grep of the repo (excluding `node_modules`, `.git`, the laid `.agents/`) finds the preset named only in `.vscodeignore`, and the packages only in `package.json` and the lockfile.
- The repo has no `verify` script; its gate is the `run:` chain in `.github/workflows/build-check.yml` (CLAUDE.md § CI), which stands in for `npm run verify`.

## Surfaces touched

- `changelog-preset.config.mjs` — deleted.
- `package.json` / `package-lock.json` — script and dev dependencies removed via `npm uninstall`.
- `.vscodeignore` — the preset's line removed (the file it excluded is gone; `test/ci/package-contents.test.ts` still guards the package).
- `.prettierignore` — unchanged: its `CHANGELOG.md` entry still describes a file conventional-changelog generates.
- `docs/` and `README.md` — grepped, nothing names the removed tooling.
- Fleet surfaces: none — no Routine, plugin, reusable workflow, published surface, ruleset or directory change.
