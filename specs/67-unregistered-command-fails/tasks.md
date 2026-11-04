# Tasks

## Tests first

- [x] T001 `test/host/panel-follows-menu.test.ts`: an `unregistered command id` case expecting the run to reject naming the id; run it red.
- [x] T002 Same file: the refusal case expects both commands to return `false`.

## Code

- [x] T003 `test/host/vscode-stub.ts`: `executeCommand` throws `command '<id>' not found` for an unregistered id.

## Surfaces

- [x] T004 `docs/testing.md`: say the stand-in fails on an unregistered command id.
- [x] T005 Published surface: none changed; say so in the PR body.
