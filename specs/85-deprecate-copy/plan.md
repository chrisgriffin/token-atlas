# Plan: Deprecate Token…: shorter copy in the reason box and the replacement picker

## Technical context

- Both prompts are in `src/host/deprecate.ts` `deprecate()`: one `showInputBox` and one `showQuickPick`. No test or doc quotes their text (`grep -rn "Why is it deprecated\|replace it with\|The token its uses should move to" src test docs README.md`).
- `test/host/vscode-stub.ts`'s `showInputBox` resolves `undefined` and it has no `showQuickPick`; both gain a record of the options passed and an answer a test sets.

## Surfaces touched

- `src/host/deprecate.ts` — two prompts' strings; a published surface, CHANGELOG from release tooling
- `test/host/vscode-stub.ts` — records prompt options
- none — no README or `docs/` passage quotes the prompts, no `package.json`, `when` clause, `setContext`, `.vscodeignore`, workflow job, `dependencies`/`mainFields` or setting change
