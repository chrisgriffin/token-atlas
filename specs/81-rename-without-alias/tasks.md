# Tasks

## Phase 1: Red

- [ ] T001 `test/ci/manifest-couplings.test.ts`: assert `tokenAtlas.renameWithoutAlias` is titled `Rename Without Alias`; it fails on `develop`.

## Phase 2: Rename

- [ ] T002 `package.json`: the command title and the `tokenAtlas.deprecationWorkflow` description.
- [ ] T003 README, `docs/design.md`, `src/host/rename.ts` comments and the three test names.

## Phase 3: Green

- [ ] T004 `grep -rn "Keeping Old Name"` outside merged spec folders finds nothing; the full gate is green.
