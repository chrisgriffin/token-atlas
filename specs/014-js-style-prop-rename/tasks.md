# Tasks: Rename leaves DOM style properties in JS/TS alone

**Input**: [spec.md](./spec.md), [plan.md](./plan.md)

## Phase 1: Test first

- [x] T001 `test/core/exportNames-js-style-props.test.ts`: style accesses and style-object keys unchanged by a rename, imported and dotted token exports renamed, every import/require shape, an `export const` declaration, other names unchanged.
- [x] T002 Run it against the unfixed code and record the red run.

## Phase 2: Fix

- [x] T003 `src/core/exportNames.ts`: `STYLE_PROPERTIES`, `importedNames`, `isStyleProperty`, applied in `scanIdentifiers` for JS/TS.

## Phase 3: Verification

- [x] T004 Run the gate: `npm run format:check && npm run typecheck && npm test && npm run build && npm run test:integration`.

## Phase 4: Surfaces

- [x] T005 `src/core/exportNames.ts` — the JS/TS filter (T003).
- [x] T006 `test/core/exportNames-js-style-props.test.ts` — the runnable line (T001).
- [x] T007 `docs/architecture.md` — say which names count in Find References and rename.
- [x] T008 `docs/adr/ADR-002-js-style-property-names.md` and `docs/adr/README.md` — record the decision.
- [x] T009 `specs/014-js-style-prop-rename/` — this folder, already covered by `.vscodeignore`.
- [x] T010 CLAUDE.md couplings and fleet surfaces — confirmed none apply.
