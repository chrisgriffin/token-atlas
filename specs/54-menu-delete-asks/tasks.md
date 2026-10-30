# Tasks

## Tests first

- [x] T001 `test/host/editorMenu.test.ts`: `menu delete asks` cases for a group (cancel sends nothing; confirm sends `deleteNode`; the prompt names the token count) and a token.

## Code

- [x] T002 `src/host/editorMenu.ts`: ask before `deleteNode`; `setMenuDeletePrompt`.
- [x] T003 `src/extension.ts`: expose `setMenuDeletePrompt` on `TokenAtlasTestHooks`.
- [x] T004 `test/integration/editor-menu.test.ts`: Delete cases answer the prompt; a cancel case leaves the file unchanged.

## Surfaces

- [x] T005 `README.md`: the right-click paragraph says Delete asks first.
- [x] T006 `docs/design.md`, `docs/architecture.md`: the `editorMenu.ts` entries say Delete asks first.
- [ ] T007 Published surface: none changed; say so in the PR body.
