# Tasks: Put the deprecation workflow behind `tokenAtlas.deprecationWorkflow`, and wire rename into it

Feature directory: `specs/019-deprecation-workflow-setting`

## Phase 1 — setup

- [x] T001 `npm ci`, then record the red baseline: `grep -q '"tokenAtlas.deprecationWorkflow"' package.json` exits 1

## Phase 2 — core (pure, no `vscode`, no DOM)

- [x] T002 Tests in `test/core/rename-alias.test.ts`, red first: token rename keeps an alias; group rename; `a → b → c` collapses to `c`; renaming back onto the alias; a replacement that is itself deprecated; per-file brand renames; a file with unusual indentation changes only where it must
- [x] T003 `computeAliasRenameEdits` and `computeReplacementRenameEdits` in `src/core/serialize.ts`, exported from `src/core/index.ts`
- [x] T004 `tokenReferences` in `src/core/validate.ts`, with `deprecatedReferences` built on it

## Phase 3 — host

- [x] T005 `tokenAtlas.deprecationWorkflow` in `package.json`, read once in `src/host/deprecate.ts`; the three spec-015 commands and the quick fix refuse while it is off, and their menus hide
- [x] T006 `buildRenameEdit` uses the alias edits while the setting is on; F2 and the visual editor both notify with **Remove alias**, which removes only the alias the rename wrote
- [x] T007 `tokenAtlas.renameWithoutAlias` — `Rename Token Without Keeping Old Name`
- [x] T008 The visual editor's delete of a used, non-deprecated token asks **Deprecate instead / Delete anyway / Cancel** while the setting is on

## Phase 4 — acceptance

- [x] T009 `test/integration/deprecation-workflow.test.ts`: off is inert; on keeps an alias and moves every use; Remove alias; the escape-hatch command; the delete prompt's three answers; a generated file is skipped and still resolves
- [x] T010 `test/integration/deprecation-flow.test.ts` turns the setting on for spec 015's tests
- [x] T011 `npm run format:check && npm run lint && npm run typecheck && npm test && npm run build && npm run test:integration` is green, and the runnable line exits 0

## Phase 5 — surfaces

- [x] T012 `README.md` — the setting in the settings table and the commands table
- [x] T013 `docs/design.md` § 2.1 — rename and deprecate rows
- [x] T014 `specs/015-token-deprecation` — the setting and the rename integration
- [x] T015 `test/ci/configuration-defaults.test.ts` — the new fallback site
- [x] T016 PR body: CHANGELOG from release tooling; no `.vscodeignore`, ruleset or `dependencies`/`mainFields` change owed
