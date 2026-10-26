# Tasks: Delete the changelog tooling the release workflow no longer uses

**Input**: [spec.md](./spec.md), [plan.md](./plan.md)

## Phase 1: Remove

- [x] T001 Delete `changelog-preset.config.mjs`.
- [x] T002 `npm uninstall conventional-changelog-cli conventional-changelog-conventionalcommits conventional-recommended-bump` — `package.json`, `package-lock.json`.
- [x] T003 Remove the `version:recommend` script from `package.json`.

## Phase 2: Verification

- [x] T004 Run the runnable line and the gate: `npm run format:check && npm run lint && npm run typecheck && npm test && npm run build && npm run test:integration`.

## Phase 3: Surfaces

- [x] T005 `changelog-preset.config.mjs` deleted (T001).
- [x] T006 `package.json` / `package-lock.json` (T002, T003).
- [x] T007 `.vscodeignore` — the preset's entry removed.
- [x] T008 `README.md`, `docs/`, `CLAUDE.md` — grepped, no reference to update.
- [x] T009 Fleet surfaces — confirmed none apply.
