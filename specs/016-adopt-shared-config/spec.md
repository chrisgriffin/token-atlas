# Spec: Adopt the shared configs from chrisgriffin/config

**Feature Branch**: `016-adopt-shared-config`
**Issue**: [#32](https://github.com/chrisgriffin/token-atlas/issues/32)

## Overview

This repo formats with its own Prettier style (semicolons, 100-character lines), has no ESLint at all, and keeps a standalone `tsconfig.json`. The fleet decides those once in [chrisgriffin/config](https://github.com/chrisgriffin/config), installed as `github:chrisgriffin/config#v1` (v1.0.0 was cut 2026-10-25). Adopting it makes this repo format, lint and type-check the way every other repo does; the style change reformats every file once.

## User scenarios

1. **Given** a contributor runs `npm run format:check`, **When** a file uses semicolons or this repo's old style, **Then** the check fails, and `npm run format` rewrites it in the shared style.
2. **Given** a contributor adds an unused variable or a stray control-character regex, **When** CI runs, **Then** `npm run lint` fails the `build / ci` check.
3. **Given** `tsconfig.json`, **When** `npm run typecheck` runs, **Then** it compiles with the shared base's options (`strict`, `isolatedModules`, ES2022) plus this repo's own module, lib, JSX and include settings.

## Functional requirements

- **FR-001**: `package.json`'s `prettier` field is `@chrisgriffin/config/prettier`; the repo carries no Prettier config of its own, and every file Prettier checks is formatted with the shared config.
- **FR-002**: `eslint.config.mjs` spreads `@chrisgriffin/config/eslint` before anything that sets rules, adds only this repo's globals, ignores and a `_`-prefix allowance for intentionally unused names; `npm run lint` (`eslint .`) reports no errors.
- **FR-003**: `tsconfig.json` extends `@chrisgriffin/config/tsconfig.json` and keeps only what is this repo's own.
- **FR-004**: the CI gate in `.github/workflows/build-check.yml` runs `npm run lint` beside `format:check` and `typecheck`, so an unformatted file, a lint error or a type error each fail CI.
- **FR-005**: `eslint.config.mjs` stays out of the packaged `.vsix`.

## Success criteria

- [ ] Prettier reads `@chrisgriffin/config/prettier` instead of a config of this repo's own, every file is formatted with it, and CI fails on an unformatted file.
- [ ] ESLint runs from an `eslint.config.mjs` that spreads `@chrisgriffin/config/eslint` first, reports no errors, and CI fails on a lint error.
- [ ] `tsconfig.json` extends `@chrisgriffin/config/tsconfig.json`, and CI type-checks the repo with it.
- [ ] **Runnable:** `npm ls @chrisgriffin/config` exits 0 and the repo's verify gate passes. On `develop`, `npm ls @chrisgriffin/config` exits 1.

## Needs from Chris

none
