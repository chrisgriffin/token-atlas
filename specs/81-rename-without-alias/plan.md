# Plan: Title the rename-without-alias command "Rename Without Alias"

## Technical context

- The title lives once, in `package.json` `contributes.commands`; the Command Palette and the `webview/context` menu both read it. No `src/` string shows it to the user (`grep -rn "Keeping Old Name" src` finds only comments).
- `test/ci/manifest-couplings.test.ts` gains one test pinning the title, so a later rename back fails `npm test`.

## Surfaces touched

- `package.json` `contributes.commands` title and `contributes.configuration` `tokenAtlas.deprecationWorkflow` description — a published surface; README § Commands, the deprecation bullet and the visual-editor menu paragraph; `docs/design.md`; CHANGELOG from release tooling
- `src/host/rename.ts` — comments only
- `test/host/panel-follows-menu.test.ts`, `test/integration/editor-menu.test.ts`, `test/integration/deprecation-workflow.test.ts` — test names only
- none — command id unchanged, so no `when` clause, `registerCommand` or `setContext` changes; no `.vscodeignore` entry, workflow job, `dependencies`/`mainFields` or setting added
