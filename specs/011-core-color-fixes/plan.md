# Implementation Plan: Color, unit, exported-name and lint fixes before 1.0

**Branch**: `011-core-color-fixes` | **Spec**: [spec.md](./spec.md)

## Summary

Fix each finding where every caller routes through: the color functions in `src/core/color.ts`, the identifier scan in `src/core/exportNames.ts`, the literal scan in `src/core/hardcoded.ts`, the contrast and name rules in `src/core/lint/index.ts`, `src/core/units.ts`, `src/core/fileName.ts`, and the color picker in `src/host/colorProvider.ts`. Each fix starts as a test seen red on `develop`.

## Technical context

- `color.ts`: a private `hex6` drops alpha before writing a `hex`; `toColor` checks component count, types and alpha; `toRgba01` gamut-maps as `cssColorStrings` already does; `wcagContrast` composites in sRGB with a private `over`.
- `exportNames.ts`: a new exported `canNameToken(name, languageId, before)` decides whether a scanned name can be a token in that language. `scanIdentifiers` takes an optional `languageId` and applies it; `tokenUsages` passes its language through; the host's `codeUsages` and export hover/definition apply the same check, so references, rename, hover and swatches agree.
- `blankComments` keeps quoted strings intact in SCSS, Sass and Less; `segments` and `renameInIdentifier` split a capitalized acronym off the next word.
- `colorProvider.ts`: the picked value goes through `computeSetEdits` on the document text, and the rewritten `$value` text is read back out, so the picker's single edit still covers just that `$value`.

## Surfaces touched

- `src/core/color.ts`, `src/core/units.ts`, `src/core/exportNames.ts`, `src/core/hardcoded.ts`, `src/core/fileName.ts`, `src/core/lint/index.ts`, `src/core/index.ts` (exports `canNameToken`).
- `src/host/colorProvider.ts`.
- `src/host/codeUsages.ts` and `src/host/exportFeatures.ts`: one call each, owned by the concurrent host fix build; recorded in the PR body.
- `schemas/token-atlas.lint.schema.json`: the `foreground` description says where an undefined foreground is reported.
- Tests: `test/core/{color,contrast,lint,exportNames,hardcoded,units,fileName}.test.ts`, `test/integration/{color,rename,exports}.test.ts`, and `test/integration/workspace/exported.css` (a grid area that spells a token).
- `specs/011-core-color-fixes/`: this folder (`specs/**` is already in `.vscodeignore`).
- `docs/architecture.md`, `README.md`, `docs/adr/ADR-001`: read, still true; no change.
- CLAUDE.md couplings: none touched (no `package.json` menus, esbuild, workflow, ignore files or ADR).
- Fleet surfaces: a config schema description changes (published surface, noted in the PR); nothing else applies.
