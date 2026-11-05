# Tasks

## Phase 1: Tests first

- [x] T001 Write `test/host/vscode-stub.test.ts`: `built-in VS Code command: Find Deprecated Uses peeks the uses without failing`, `built-in VS Code command: an id VS Code does not have still fails`, `re-registered command: disposing the older registration keeps the newer`; run it red.

## Phase 2: Fix

- [x] T002 `test/host/vscode-stub.ts`: `BUILT_INS` resolved by `executeCommand`; a disposer removes only its own registration.

## Phase 3: Surfaces

- [x] T003 `docs/testing.md`: what `vscode-stub.ts` does with a built-in id.
