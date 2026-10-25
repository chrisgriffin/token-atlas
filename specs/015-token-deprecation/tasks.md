# Tasks: Carry out a token deprecation — mark it, move its uses, remove it once unused

Feature directory: `specs/015-token-deprecation`

## Phase 1 — setup

- [x] T001 `npm ci`, then record the red baseline: `npx vitest run test/core/deprecated.test.ts -t "replacement" 2>&1 | grep -qE "Tests +[1-9][0-9]* passed"` exits 1, with the summary reading `Tests  7 skipped (7)`

## Phase 2 — core (pure, no `vscode`, no DOM)

- [x] T002 Add a pure reader in `src/core/validate.ts` that returns a deprecated token's replacement path from the first `{reference}` in its `$deprecated` string, and nothing when the string carries none
- [x] T003 Resolve that path the way any other reference resolves, document-first then the external index, so a replacement in another file is found (invariant 4)
- [x] T004 Tests in `test/core/deprecated.test.ts` naming `replacement`: a string with a reference, a string with none, a reference that does not resolve, a replacement in another file, and a group-inherited deprecation whose string carries a reference
- [x] T005 Add the `$deprecated` write as a format-preserving edit through `src/core/serialize.ts`, returning ranges — never a whole-document stringify (invariant 1)
- [x] T006 Test that the write changes the file by the `$deprecated` line alone, on a file with comments and unusual spacing

## Phase 3 — host

- [x] T007 Surface the deprecate action from the text editor, as a command registered in `package.json` and wired in `src/host/`
- [x] T008 Offer a quick fix on a deprecated use that has a resolvable replacement, attached to the existing diagnostic in `src/host/diagnostics.ts`, rewriting that one use
- [x] T009 Make the quick fix's use set the one the existing readers already report — `deprecatedReferences()` for token files, `src/host/codeUsages.ts` for stylesheets and code. Do not add a third matcher (plan § Risk)
- [x] T010 List every remaining use of a deprecated token across the workspace from `src/host/workspaceIndex.ts`, so a use in an unopened file is included
- [x] T011 Warn before removing a deprecated token that still has uses, naming the count, from the same count the list uses; remove silently when there are none
- [x] T012 Report by name a `$deprecated` whose replacement reference does not resolve (success criterion 7) — no crash, no silence

## Phase 4 — visual editor

- [x] T013 Add the deprecate intent to `src/shared/protocol.ts` and the affordance in `src/webview/`, emitting the intent only — the webview applies no edit

## Phase 5 — acceptance

- [x] T014 `npx vitest run test/core/deprecated.test.ts -t "replacement" 2>&1 | grep -qE "Tests +[1-9][0-9]* passed"` exits 0 (the runnable line). Do not drop the `grep`: the bare `vitest run -t` exits 0 when nothing matches
- [x] T015 Integration tests in `test/integration/` for the code action, the remaining-uses list and the removal prompt — the four host-level success criteria cannot be covered by vitest
- [x] T016 `npm run format:check && npm run typecheck && npm test && npm run build && npm run test:integration` is green

## Phase 6 — surfaces

- [x] T017 `package.json`'s `contributes.commands` / `contributes.menus` — add the command entries, and move the `setContext("tokenAtlas.isTokenDocument", …)` call in `src/extension.ts` with any new `when` clause
- [x] T018 `docs/design.md` § 2.1 — update the file-by-file host map for the code action, the remaining-uses view and the removal guard
- [x] T019 `README.md` — add the capability to the feature list, since the published Marketplace listing reads from it
- [x] T020 `CHANGELOG.md` — nothing to hand-edit; the release tooling writes it from conventional commits. Confirm in the PR body rather than editing the file
- [x] T021 `docs/adr/` — record the decision to carry the replacement inside `$deprecated` as a `{reference}`, and why a sibling `$`-field was rejected; link it from the PR
- [x] T022 Confirm in the PR body that no `.vscodeignore` entry, no branch-ruleset change and no `dependencies`/`mainFields` change is owed, with the reason for each (plan § Surfaces touched)
