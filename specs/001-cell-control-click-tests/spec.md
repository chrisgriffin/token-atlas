# Feature Specification: Cell controls keep their own clicks

**Feature Branch**: `001-cell-control-click-tests`
**Issue**: #3
**Status**: Built

## Summary

A click anywhere in an editable cell of the token table starts an inline edit, except on the controls inside a row: the color swatch picker, the alias chevron, the problem mark and the edit (pencil) button. Each keeps its own action. No test covers that today, so a later change to the click handling could turn a swatch or chevron click into a text edit with nothing failing. This adds webview tests that pin it.

## User Scenarios & Testing

### User Story 1 - A control click does its own job (Priority: P1)

Someone editing tokens in the visual editor clicks a control in a row and gets that control's action, never an inline text edit of the cell around it.

**Independent Test**: `npx vitest run test/webview/Table.test.tsx`.

**Acceptance Scenarios**:

1. **Given** an editable color row, **When** the swatch is clicked, **Then** no inline edit starts, and a picked color is written to the token.
2. **Given** a row with alias candidates, **When** the alias chevron is clicked, **Then** no inline edit starts and the alias picker opens.
3. **Given** a row with a validation problem, **When** the problem mark is clicked, **Then** no inline edit starts and the token opens.
4. **Given** any row, **When** the edit button is clicked, **Then** no inline edit starts and the token opens.

### Edge Cases

- An inline edit that starts and closes again at once (the alias picker's search box takes focus back) still counts as an edit having started: the tests watch for the cell taking focus, not only for an input left on screen.

## Requirements

- **FR-001**: One test per control, under a `Cell controls keep their own clicks` block inside `Table cell click target` in `test/webview/Table.test.tsx`.
- **FR-002**: Each test checks that no inline edit started and that the control's own action happened.
- **FR-003**: Tests only; no change to the extension's behavior.

## Success criteria

- [x] For each of the four controls, a webview test clicks it inside an editable cell and checks that no inline text input appears and that the control's own action happens.
- [x] The PR says each new test was seen to fail once with the control exclusion in `editCellAt` disabled.
- [x] **Runnable:** `npx vitest run test/webview/Table.test.tsx` exits 0, and `grep -c "Cell controls keep their own clicks" test/webview/Table.test.tsx` prints `1` (today `0`).

## Assumptions

- "The control exclusion" covers both layers that keep a control's click: the control's own stop of the click, and the control check in `editCellAt`, which is the backup. Each control stops its click first, so disabling the `editCellAt` check alone leaves every test green; the red runs disable both for the control under test.
- The edit button sits in its own column with no inline-editable text, so no exclusion guards it; its test was seen red by dropping the button's own action instead.

## Needs from Chris

none
