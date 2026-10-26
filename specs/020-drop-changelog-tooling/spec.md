# Spec: Delete the changelog tooling the release workflow no longer uses

**Feature Branch**: `020-drop-changelog-tooling`
**Issue**: [#40](https://github.com/chrisgriffin/token-atlas/issues/40)

## Overview

Releases moved to the shared Release PR workflow (`chrisgriffin/workflows`' `_reusable-release-pr.yml`), which installs and configures its own changelog tooling in a temporary prefix. This repo still carries the old copy: `changelog-preset.config.mjs`, a `version:recommend` npm script and three conventional-changelog dev dependencies. Nothing runs them, and the preset's header already names a workflow step that no longer exists. Deleting them removes a config that can only drift.

## User scenarios

1. **Given** a contributor reads the repo root, **When** they look for how the changelog is built, **Then** there is no local preset suggesting releases use it.
2. **Given** `npm ci`, **When** it installs dev dependencies, **Then** no conventional-changelog package is pulled in.

## Functional requirements

- **FR-001**: `changelog-preset.config.mjs` is deleted, and `.vscodeignore` no longer lists it.
- **FR-002**: `package.json` has no `version:recommend` script and no `conventional-changelog-cli`, `conventional-changelog-conventionalcommits` or `conventional-recommended-bump` dev dependency; `package-lock.json` matches.
- **FR-003**: nothing else in the repo refers to the removed file, script or packages.

## Success criteria

- [ ] The repo carries no changelog preset, no `version:recommend` script and no conventional-changelog dev dependency, and nothing else refers to them.
- [ ] **Runnable:** `test -e changelog-preset.config.mjs; echo $?` prints `1` (today `0`), and `grep -c "conventional-" package.json` prints `0` (today `4`).
- [ ] `npm run verify` exits 0.

This repo defines no `verify` script; the third criterion is read as its verify gate, the Build gate chain in `CLAUDE.md`.

## Needs from Chris

none
