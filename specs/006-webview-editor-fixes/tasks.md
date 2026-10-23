# Tasks: Visual editor fixes before 1.0

**Input**: [spec.md](./spec.md), [plan.md](./plan.md)

Each fix starts with its test, seen red against the unfixed code.

## Phase 1: Composite editors

- [x] T001 Referenced sub-values show read-only with Unlink (disabled when unresolved), in every composite editor; dimension and duration fields never spread a non-object.
- [x] T002 Colour sub-fields write colour objects and refuse non-colours; the picker keeps alpha.
- [x] T003 Starter colours (new shadow layer, new gradient stop, border/shadow/gradient defaults) are colour objects.
- [x] T004 The panel builds each edit on the value it last sent.

## Phase 2: Panel and toolbar

- [x] T005 "Edit as JSON" follows the value while untouched and refuses a save over a changed value.
- [x] T006 Rename from the panel keeps the panel open; a taken sibling name is refused in the table and the panel.
- [x] T007 Escape in the panel rename box only cancels it.
- [x] T008 Unlink is disabled for an unresolved alias.
- [x] T009 + Group opens the new group and the table shows an empty group as a section whose name opens it.
- [x] T010 + Token falls back to the scope and never posts a name already posted.

## Phase 3: Table

- [x] T011 A `$ref` property reference shows its resolved value; `summarize` never prints `[object Object]`.
- [x] T012 strokeStyle keywords parse inline; one keyword list.
- [x] T013 Focus stays in the table after an inline edit closes.
- [x] T014 The colour picker posts one edit per pick.
- [x] T015 Only the selected row's cells and swatch are Tab stops.

## Phase 4: Keyboard and themes

- [x] T016 Enter that confirms an IME composition commits nothing (InlineCell, panel rename, TextInput, NumberInput, AliasPicker).
- [x] T017 The panel name is a button.
- [x] T018 Selected rows are outlined in High Contrast themes; the table shows a focus ring on Tab.

## Phase 5: Verification

- [x] T019 Run the gate: `npm run format:check && npm run typecheck && npm test && npm run build && npm run test:integration`.
