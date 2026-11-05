# Spec: The host test stub runs VS Code's built-in commands and keeps a re-registered command when the old one is disposed

**Issue**: [#72](https://github.com/chrisgriffin/token-atlas/issues/72)

## Overview

The host tests run the extension against a stand-in for VS Code's command registry. Since #67 it fails on any id nothing registered, which is right for the extension's own commands, but real VS Code always has its built-in commands and the host runs several of them, so a host test reaching one fails for a reason VS Code never has. Disposing an older registration of an id also removes a newer one. The stand-in now answers the built-ins the host runs, and a dispose removes only its own registration.

## User scenarios

- A host test runs Find Deprecated Uses on a deprecated token that is still used: it gets the uses, and the `editor.action.showReferences` peek the host fires does not fail.
- A test registers `x`, registers `x` again, then disposes the first: running `x` runs the second handler.
- A test runs an id that is neither registered nor a VS Code built-in the host runs: it still fails, naming the id (#67).

## Functional requirements

- FR-001: `commands.executeCommand` in `test/host/vscode-stub.ts` resolves (to `undefined`) for each VS Code built-in command id `src/` runs, unless a test registered a handler for it, which then runs.
- FR-002: A registration's disposer removes the id only while that registration is still the live one.
- FR-003: Any other unregistered id still rejects with an error naming it.

## Success criteria

- [ ] A host test that drives a path calling `editor.action.showReferences` does not fail because that command is unregistered in the stub.
- [ ] Disposing an older registration of an id leaves a newer registration of the same id runnable.
- [ ] An id that is neither registered nor a VS Code built-in still fails, as #67 requires.
- [ ] **Runnable:** `npm test -- -t "built-in VS Code command" 2>&1 | grep -cE "Tests +[0-9]+ passed"` prints `1` (prints `0` on `develop`, where no test of that name runs). The work adds that test.

## Out of scope

- The integration suite: it runs real VS Code, which has every built-in.
- Recording or asserting what a built-in was called with: no test needs it yet.
