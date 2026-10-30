# Tasks

## Tests first

- [ ] T001 `test/host/editorMenu.test.ts`: `menu delete asks` cases for a group (cancel sends nothing; confirm sends `deleteNode`; the prompt names the token count) and a token.

## Code

- [ ] T002 `src/host/editorMenu.ts`: ask before `deleteNode`; `setMenuDeletePrompt`.
- [ ] T003 `src/extension.ts`: expose `setMenuDeletePrompt` on `TokenAtlasTestHooks`.
- [ ] T004 `test/integration/editor-menu.test.ts`: Delete cases answer the prompt; a cancel case leaves the file unchanged.

## Surfaces

- [ ] T005 `README.md`: the right-click paragraph says Delete asks first.
- [ ] T006 `docs/design.md`, `docs/architecture.md`: the `editorMenu.ts` entries say Delete asks first.
- [ ] T007 Published surface: none changed; say so in the PR body.
