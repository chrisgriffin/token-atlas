# Implementation Plan: Cell controls keep their own clicks

**Branch**: `001-cell-control-click-tests` | **Spec**: [spec.md](./spec.md)

## Summary

Add four webview tests to `test/webview/Table.test.tsx`, one per row control, each clicking the control in the first row and checking that no inline edit started and that the control's own action ran. No source change.

## Technical context

- React 18 under jsdom with Testing Library, run by vitest; the existing `renderTable` helper and fixtures cover every case.
- An inline edit starts when an `InlineCell` span takes focus (`src/webview/components/InlineCell.tsx`). The alias picker's search box can take focus straight back and close the edit, so the tests record `focusin` on any `.cell` in the row during the click instead of only checking for an `input.inline` afterwards.
- The control's own action, as jsdom can observe it: the swatch's color input writes through `edits.setValue` on change; the chevron opens the `Choose a token to alias` dialog; the problem mark and the edit button call `onOpen` with the token's path.

## Surfaces touched

- `test/webview/Table.test.tsx`: the four tests.
- `specs/001-cell-control-click-tests/`: this spec folder, the first in the repo.
- `.vscodeignore`: `specs/**`, so the new top-level directory never ships in the packaged extension (`test/ci/package-contents.test.ts`).
- `docs/architecture.md`: already lists `specs/`; no change.
- Fleet surfaces: none apply (no published surface, workflow, ruleset or doc rule changes).
