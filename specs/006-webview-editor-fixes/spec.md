# Feature Specification: Visual editor fixes before 1.0

**Feature Branch**: `006-webview-editor-fixes`
**Issue**: #8
**Status**: Built

## Summary

A review of the visual editor (the webview) before the 1.0.0 release found edits that corrupt a token's value, panel actions that lose the user's place, controls a keyboard or a high-contrast theme cannot reach, and a few table cells that show or accept the wrong thing. This fixes all of them in the webview, each with a test that fails before the fix. Chris requested this on 2026-10-22.

## User Scenarios & Testing

### User Story 1 - Composite edits never damage a value (Priority: P1)

Someone editing a border, shadow, typography, transition, gradient or custom stroke in the panel changes one field and gets exactly that change: a field that references another token is shown as that reference and is never rewritten into garbage, a colour is written as a 2025.10 colour object, and two quick edits both land.

**Independent Test**: `npx vitest run test/webview/composite.test.tsx test/webview/Detail.test.tsx`.

**Acceptance Scenarios**:

1. **Given** a border whose width is `{border.width.thin}` (or a `{ "$ref": … }`), **When** the panel opens, **Then** the width shows the reference read-only with an Unlink button, and no control can write a spread of the reference string.
2. **Given** that reference resolves, **When** Unlink is clicked, **Then** the width becomes the resolved value; **Given** it does not resolve, **Then** Unlink is disabled.
3. **Given** a colour sub-field, **When** text that is not a colour is typed, **Then** nothing is written; **When** a colour is typed or picked, **Then** a `{colorSpace, components, …}` object is written in the field's existing space, keeping its alpha on a pick.
4. **Given** a new shadow layer, gradient stop, or a token switched to border, shadow or gradient, **Then** its starter colours are colour objects in the configured colour space.
5. **Given** a shadow, **When** Blur is changed and Inset is clicked before the host replies, **Then** the second edit carries both changes.

### User Story 2 - The panel keeps the user's place (Priority: P1)

**Acceptance Scenarios**:

1. **Given** a token or group open in the panel, **When** it is renamed from the panel header, **Then** the panel stays open on the renamed node.
2. **Given** a sibling named `b`, **When** a token is renamed to `b` in the table or the panel, **Then** nothing is posted and the selection does not move to the other token.
3. **Given** the panel's rename box, **When** Escape is pressed, **Then** the rename is cancelled and the panel stays open.
4. **Given** "Edit as JSON" open and untouched, **When** the value changes elsewhere, **Then** the box shows the new value; **Given** it was edited, **Then** it says the value changed and Save is refused until it is reloaded.
5. **Given** an alias that does not resolve, **Then** Unlink is disabled.
6. **Given** the toolbar, **When** + Group is clicked, **Then** the new group's panel opens and the group shows in the table as a section; **When** + Token is clicked with nothing selected while the table is scoped to a group, **Then** the token is added inside that group; **When** + Token is clicked twice before the host replies, **Then** two different names are posted.

### User Story 3 - The table shows and edits every value (Priority: P2)

**Acceptance Scenarios**:

1. **Given** a token whose value is a `$ref` into another token's value, **Then** its value cell shows the resolved value, never `[object Object]`.
2. **Given** a strokeStyle token, **When** `dotted` is typed into its cell, **Then** it is written.
3. **Given** an inline edit, **When** Enter or Escape closes it, **Then** focus stays in the table and the arrow keys keep moving the selection.
4. **Given** a colour swatch in the table or panel, **When** the native picker is dragged, **Then** one edit is posted when the pick is made, not one per drag step.

### User Story 4 - Keyboard, input methods and themes (Priority: P2)

**Acceptance Scenarios**:

1. **Given** an IME composition in any text field that commits on Enter, **When** Enter confirms the composition, **Then** nothing is committed.
2. **Given** the panel, **Then** the node's name is a button reachable by Tab that starts a rename.
3. **Given** a High Contrast theme, **Then** the selected table row and the selected alias-picker row carry a visible outline.
4. **Given** the table, **When** it is first reached with Tab, **Then** it shows a focus ring, and only the selected row's cells are Tab stops.

### Edge Cases

- A host update that arrives while an edit is still on its way does not undo the edit in the panel: the panel shows the value it last sent until the host's next update.
- Out-of-order host updates: the protocol carries no sequence number, so the webview cannot tell an older model from a newer one; left as is.

## Requirements

- **FR-001**: Every composite sub-field that holds a reference (curly or `$ref`) renders read-only with Unlink; Unlink writes the resolved sub-value and is disabled when there is none.
- **FR-002**: Dimension and duration fields never spread a value that is not a `{value, unit}` object.
- **FR-003**: Colour sub-fields and every starter value write 2025.10 colour objects; invalid text writes nothing.
- **FR-004**: The panel builds each edit on the value it last sent.
- **FR-005**: Renames keep the panel on the renamed node and refuse a taken sibling name.
- **FR-006**: Changes stay in `src/webview/**` and its tests; the host and core are untouched.

## Success criteria

- [x] Composite editors never corrupt or downgrade a value: a sub-value that references another token (curly or `$ref`) shows read-only with an Unlink that is disabled when it does not resolve; colour sub-fields and every starter value write 2025.10 colour objects and refuse text that is not a colour; two edits made before the host replies both land.
- [x] The panel keeps the user's place: a rename from the panel or the table keeps the panel on the renamed node, a name a sibling already has is refused, Escape in the rename box only cancels it, "Edit as JSON" never saves a value older than the current one, Unlink is disabled for an unresolved alias, + Group opens the new group and the table shows it, + Token adds inside the scoped group when nothing is selected, and a quick double click on + Token posts two different names.
- [x] The table shows and edits every value: a `$ref` property reference shows its resolved value, a strokeStyle keyword can be typed inline, focus stays in the table after an inline edit, and a colour picker posts one edit per pick.
- [x] Keyboard, input methods and themes: Enter that confirms an IME composition commits nothing, the panel's name is a keyboard-reachable button, the selected row is outlined in High Contrast themes, the table shows a focus ring when tabbed into, and only the selected row's cells are Tab stops.
- [x] **Runnable:** `npx vitest run test/webview` exits 0, and `grep -rho "(#8)" test/webview | wc -l` prints at least 18 (today 0).

## Assumptions

- Unlink on a composite sub-value writes the value `resolveAliases` gives that sub-value; a sub-value that stays a reference after resolution counts as unresolved.
- Starter colours in a non-sRGB default space carry no `hex`, matching the existing colour starter.
- The panel's last-sent value is replaced by the host's next update, whatever it carries.
- Roving Tab stops follow the row's existing pattern: the edit button and alias chevron were already Tab stops only on the selected row.

## Needs from Chris

none
