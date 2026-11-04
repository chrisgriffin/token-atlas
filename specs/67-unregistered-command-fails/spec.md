# Spec: A host test that runs a command id nothing registered fails instead of passing with nothing run

**Issue**: [#67](https://github.com/chrisgriffin/token-atlas/issues/67)

## Overview

The host tests' stand-in for VS Code quietly returns nothing when a test runs a command id no code registered. The detail-panel case for an edit VS Code refuses never checks what the two menu commands returned, so a renamed command id would leave it passing while it tests nothing. The stand-in now fails on an unknown id, as VS Code itself does, and the refusal case checks both commands report they changed nothing.

## User scenarios

- A test runs `tokenAtlas.noSuchCommand`: it fails, and the error names `tokenAtlas.noSuchCommand`.
- Someone renames `tokenAtlas.renameWithoutAlias` or `tokenAtlas.removeDeprecatedToken` in the source but not in the refusal case: that case fails.
- Every other host test that runs a registered command keeps passing.

## Functional requirements

1. `commands.executeCommand` in `test/host/vscode-stub.ts` rejects with an error naming the id when nothing registered it.
2. The refusal case in `test/host/panel-follows-menu.test.ts` expects both commands to return `false`.

## Success criteria

- [x] A test that runs a command id no host code registers fails, and says which id. **Runnable:** `npx vitest run test/host -t "unregistered command id" 2>&1 | grep -cE "Tests +1 passed"` prints `1` (it prints `0` on `develop`, where no test has that name).
- [x] The refusal case in `test/host/panel-follows-menu.test.ts` fails if either menu command's id stops resolving, and checks that both commands reported they changed nothing.
- [x] `npm test` passes.

## Out of scope

- The integration suite: it runs real VS Code, which already fails on an unknown id.
