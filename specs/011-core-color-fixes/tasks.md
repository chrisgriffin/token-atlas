# Tasks: Color, unit, exported-name and lint fixes before 1.0

**Input**: [spec.md](./spec.md), [plan.md](./plan.md)

## Phase 1: Red tests

- [x] T001 Color tests in `test/core/color.test.ts`: 6-digit hex (finding 1), incomplete components (5), near-opaque alpha (11), gamut-mapped swatch (12), translucent contrast (2).
- [x] T002 Hover and lint contrast tests in `test/core/contrast.test.ts` and `test/core/lint.test.ts`: translucent foreground (2), undefined foreground (3), PascalCase leading digit (10).
- [x] T003 Name tests in `test/core/exportNames.test.ts` and `test/core/hardcoded.test.ts`: stylesheet bare words (4), quoted url in SCSS/Less (8), acronym prefix (9), `url(#id)` (7).
- [x] T004 `test/core/units.test.ts` (6) and `test/core/fileName.test.ts` (trailing dot, device names).
- [x] T005 Integration: rename leaves a bare grid-area name alone, export hover is silent on it, the picker keeps layout and `"alpha": 1` (4, 13).
- [x] T006 Run every new test against unfixed `src/` and record the red run.

## Phase 2: Fixes

- [x] T007 `src/core/color.ts`: `hex6`, `toColor` checks, gamut-mapped `toRgba01`, rounded alpha in `cssColorStrings`, compositing `wcagContrast`.
- [x] T008 `src/core/lint/index.ts`: report an undefined foreground on the background; PascalCase leading digit.
- [x] T009 `src/core/exportNames.ts`: `canNameToken`, `scanIdentifiers(text, languageId)`, quoted strings in `blankComments`, acronym split; `src/core/hardcoded.ts` `url(#id)`.
- [x] T010 `src/host/codeUsages.ts` and `src/host/exportFeatures.ts` apply `canNameToken`.
- [x] T011 `src/host/colorProvider.ts` writes through `computeSetEdits`.
- [x] T012 `src/core/units.ts` 4 decimals; `src/core/fileName.ts` trailing dots and device names; lint schema description.

## Phase 3: Verification

- [x] T013 Run the gate: `npm run format:check && npm run typecheck && npm test && npm run build && npm run test:integration`.
