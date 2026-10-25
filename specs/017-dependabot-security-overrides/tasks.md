# Tasks: Pin patched serialize-javascript and @azure/msal-node through overrides

**Input**: [spec.md](./spec.md), [plan.md](./plan.md)

## Phase 1: Test first

- [x] T001 `test/ci/security-overrides.test.ts`: every locked copy of each package is at or past its first patched version.
- [x] T002 Run it against `develop`'s lockfile and record the red run (2 of 2 fail).

## Phase 2: Pin

- [x] T003 `package.json` `overrides`: `serialize-javascript ^7.1.4`, `@azure/msal-node ^7.1.1`; `npm install` regenerates `package-lock.json`.

## Phase 3: Verification

- [x] T004 Run the gate: `npm run format:check && npm run lint && npm run typecheck && npm test && npm run build && npm run test:integration`, plus `vsce package` and an `@azure/identity` load smoke.
- [ ] T005 (after merge) Dependabot's next npm update run concludes `success`.

## Phase 4: Surfaces

- [x] T006 `package.json` / `package-lock.json` (T003).
- [x] T007 `test/ci/security-overrides.test.ts` (T001).
- [x] T008 `docs/testing.md` — the `test/ci/` list.
- [x] T009 Fleet surfaces — confirmed none apply.
