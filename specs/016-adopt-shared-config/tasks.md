# Tasks: Adopt the shared configs from chrisgriffin/config

**Input**: [spec.md](./spec.md), [plan.md](./plan.md)

## Phase 1: Test first

- [x] T001 `test/ci/shared-config.test.ts`: the dependency, the `prettier` field and no own config, `eslint.config.mjs` spreading the base first, `tsconfig.json` extending the base.
- [x] T002 Run it against `develop` and record the red run (4 of 4 fail).

## Phase 2: Adopt

- [x] T003 `npm install --save-dev github:chrisgriffin/config#v1 eslint@^9 globals` — `package.json`, `package-lock.json`.
- [x] T004 `package.json`: `"prettier": "@chrisgriffin/config/prettier"`, `"lint": "eslint ."`; delete `.prettierrc.json`.
- [x] T005 `eslint.config.mjs` on the shared base; fix the findings in `src/core/fileName.ts` and `test/integration-run.mjs`.
- [x] T006 `tsconfig.json` extends `@chrisgriffin/config/tsconfig.json`.
- [x] T007 `.github/workflows/build-check.yml`: `npm run lint` in the gate; `test/ci/workflow-stub-guards.test.ts` pins it.
- [x] T008 `npm run format` — reformat the repo once.

## Phase 3: Verification

- [x] T009 Run the gate: `npm run format:check && npm run lint && npm run typecheck && npm test && npm run build && npm run test:integration`, and the runnable line.

## Phase 4: Surfaces

- [x] T010 `package.json` / `package-lock.json` — dependency, `prettier` field, `lint` script (T003, T004).
- [x] T011 `.prettierrc.json` removed; `.vscodeignore` lists `eslint.config.mjs` instead.
- [x] T012 `eslint.config.mjs`, `tsconfig.json` (T005, T006).
- [x] T013 `.github/workflows/build-check.yml` — lint step, job name unchanged (T007).
- [x] T014 `test/ci/shared-config.test.ts`, `test/ci/workflow-stub-guards.test.ts` (T001, T007).
- [x] T015 Every Prettier-checked file reformatted (T008).
- [x] T016 `CLAUDE.md` — Commands block and Build gate line.
- [x] T017 `docs/architecture.md` and `docs/testing.md` — the gate chain and the `test/ci/` list.
- [x] T018 Fleet surfaces — confirmed none other apply.
