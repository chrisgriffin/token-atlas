# Tasks: CI builds what ships

Spec: `specs/20261111-150711-ci-builds-what-ships/spec.md` · Plan: `plan.md` in the same folder.

The runnable line is `npm run build:production`, red today: npm exits 1 with `Missing script: "build:production"`.

## Phase 1 — setup

- [x] T001 Record the red baseline: `npm run build:production` exiting 1, and the current gate chain from `build-check.yml` (six steps, none of them production). Both in the pull request.
- [x] T002 Record the two builds' sizes for the pull request: `npm run build` (dev) and `node esbuild.mjs --production`, with the four numbers. They are what makes "CI never builds what ships" concrete rather than rhetorical.

## Phase 2 — the script, and the pin

- [x] T003 Add `"build:production": "node esbuild.mjs --production"` to `package.json`'s `scripts`. Leave `vscode:prepublish` as it is.
- [x] T004 `npm run build:production` exits 0 and prints the minified sizes.
- [x] T005 Add a `test/ci/` test asserting that `build:production` and `vscode:prepublish` both run `esbuild.mjs --production`, so neither can drift to a mode nothing publishes. Beside `manifest-couplings.test.ts` or in its own file.
- [x] T006 Prove that pin bites: change one of the two, confirm the test fails, revert. Quote the failure in the pull request.

## Phase 3 — the gate

- [x] T007 `.github/workflows/build-check.yml` — the `run:` chain gains `npm run build:production` then `npm run package`, after `xvfb-run -a npm run test:integration`. Do not rename the `build` job and do not add or remove one.
- [x] T008 Confirm `npm run package` succeeds locally from a clean `npm ci` and produces a `.vsix`, and that `test/ci/package-contents.test.ts` still passes afterwards.
- [x] T009 Confirm `.gitignore` covers `*.vsix`; add it if not, so a local gate run leaves nothing behind.
- [x] T010 Confirm `.vscodeignore` owes no entry: nothing new lands in the packaged set, and the packaged-contents test is what proves it.

## Phase 4 — prove FR-002, which is the point of the ticket

- [x] T011 Construct a break that trips `assertSelfContained` on the **production** bundle and not on the dev one, confirm the gate fails on it and that `npm run build` alone stays green, then revert. Record what was broken and the failure in the pull request.
- [x] T012 If no such break can be constructed, say so plainly in the pull request and do not tick T011 or its criterion. That outcome is a finding about the guard's regex, not a reason to mark the criterion done: report it and file it separately rather than widening the regex here.

## Phase 5 — surfaces

One task per `## Surfaces touched` line in the plan, in its order.

- [x] T013 `package.json` — the `build:production` script exists and `vscode:prepublish` is unchanged (T003).
- [x] T014 `.github/workflows/build-check.yml` — the chain is as T007 says; the `build` job keeps its name, so the required `build / ci` check reports unchanged and no ruleset edit is owed. Say so in the pull request.
- [x] T015 `test/ci/` — carries the pin (T005).
- [x] T016 `esbuild.mjs` — confirm no change was needed, or, if T012's outcome applies, say in the pull request what the guard cannot see and that it is filed rather than widened here.
- [x] T017 `.gitignore` — `*.vsix` covered (T009).
- [x] T018 `.vscodeignore` — no entry owed (T010).
- [x] T019 `docs/testing.md` — the gate's chain with the two new steps, what each is for, and which build `test:integration` runs against.
- [x] T020 `docs/releasing.md` — says the production build and the packaging are green before the release pull request merges, so the release job is no longer the first place they run.
- [x] T021 `CLAUDE.md` — the Commands block gains `build:production`; the Build gate line lists the new chain; invariant 2 says the guard runs on the minified bundle in CI. Then `wc -c CLAUDE.md` is under 8500 and the gate passes on it.
- [ ] T022 cost — read the `build / ci` job's duration before and after and quote both in the pull request, with whether it crosses a billed-minute boundary. Measured from the job, never estimated.
- [x] T023 `docs/adr/` — decide whether FR-004's ordering choice warrants an ADR and write one if so; say either way in the pull request.
- [x] T024 none else — confirm in the pull request: no reusable workflow body in chrisgriffin/workflows touched, no required check renamed, and `contributes`, the commands and the schema unchanged.

## Phase 6 — polish

- [x] T025 Run the whole new chain locally, in order, all green: `format:check`, `lint`, `typecheck`, `test`, `build`, `test:integration`, `build:production`, `package`.
- [x] T026 Confirm `git status` is clean: no `.vsix`, no `out/`, nothing the gate left behind.
