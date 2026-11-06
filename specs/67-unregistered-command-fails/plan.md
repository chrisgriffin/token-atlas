# Plan: A host test that runs a command id nothing registered fails instead of passing with nothing run

## Technical context

- `test/host/vscode-stub.ts` `commands.executeCommand` returns `registered.get(id)?.(...args)`: `undefined` for an unknown id.
- Change: look the id up first; if nothing registered it, throw `command '<id>' not found` (VS Code's own wording). Being `async`, the call rejects.
- `renameWithoutAlias` and `removeDeprecatedToken` both return `false` when `workspace.applyEdit` refuses, so the refusal case can assert that.
- Only `test/host/panel-follows-menu.test.ts` calls the stub's `executeCommand` directly; `src/host/` code that calls it is not reached by any host test on an unregistered id (checked by running `npm test`).

## Surfaces touched

- `test/host/vscode-stub.ts` — `executeCommand` rejects on an unknown id.
- `test/host/panel-follows-menu.test.ts` — an `unregistered command id` case; the refusal case asserts both results are `false`.
- `docs/testing.md` — its `vscode-stub.ts` sentence says an unregistered id fails.
- `src/`, `package.json`, `docs/architecture.md`, `docs/design.md` — unchanged: test-only change, no directory added.
- Published surface — none.
