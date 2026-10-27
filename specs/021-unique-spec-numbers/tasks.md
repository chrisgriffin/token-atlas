# Tasks: Give every spec folder a unique number

Spec: [`spec.md`](./spec.md) · Plan: [`plan.md`](./plan.md) · Branch: `021-unique-spec-numbers`

## Phase 1 — setup

- [ ] [T001] Record the starting state: run `ls specs | cut -d- -f1 | sort | uniq -d` and `ls -d specs/*/` from the repo root and paste both outputs into the PR body, so the before/after is on the record and not only in this spec.
- [ ] [T002] List the free numbers: compute which three-digit values from `001` upward are unused by any folder under `specs/`, and pick the lowest free values for the folders that must move. Write the chosen old → new mapping into the PR body before renaming anything.

## Phase 2 — decide which drop-changelog spec survives

- [ ] [T003] Read `specs/019-drop-changelog-tooling/tasks.md` and `specs/020-drop-changelog-tooling/tasks.md` side by side against `develop`'s tree (`changelog-preset.config.mjs` absent, `package.json` and `package-lock.json` as they stand, `.vscodeignore`) and state in the PR body which one describes what actually merged.
- [ ] [T004] `git rm -r` the folder T003 rejected. Do not merge the two folders into one — two divergent records of one change is the defect being removed, and a hand-merge recreates it in a single file.

## Phase 3 — renumber the remaining collisions

- [ ] [T005] `git mv` each folder in the `002` collision that does not keep the number to its mapped free number, slug unchanged.
- [ ] [T006] `git mv` each folder still colliding on `019` or `020` after T004 to its mapped free number, slug unchanged.
- [ ] [T007] Update every in-repo reference to a moved path: `specs/019-deprecation-workflow-setting/tasks.md` and `specs/020-inline-issue-reasons/tasks.md` cite their own folders today, and `grep -rn "specs/0" specs/ src/ test/ docs/ .github/ README.md` must name no path that is not on disk. Do not edit anything under `.agents/` — it is operator content laid at runtime and is not part of this repo's tree.

## Phase 4 — verify

- [ ] [T008] `ls specs | cut -d- -f1 | sort | uniq -d` prints nothing and exits 0.
- [ ] [T009] `ls -d specs/*-drop-changelog-tooling | wc -l` prints `1`.
- [ ] [T010] `npm run format:check && npm run lint && npm run typecheck && npm test && npm run build` exits 0, and `npm run test:integration` under `xvfb-run -a` where a display is available.

## Phase 5 — surfaces

- [ ] [T011] `docs/architecture.md` — read it and confirm it names no spec folder number; if it does, correct that line. Otherwise say in the PR body that it needed no change.
- [ ] [T012] `README.md` — confirm it names no spec folder; say so in the PR body.
- [ ] [T013] A rule stated in more than one doc — none: confirm no rule text moves in this change.
- [ ] [T014] A published surface (`bin`, export, command, config schema, report shape) — none: confirm no runtime surface moves, so no CHANGELOG entry is owed.
- [ ] [T015] `.vscodeignore` and `test/ci/package-contents.test.ts` — confirm the packaged-contents allow-list still passes with the renamed folders (covered by T010's `npm test`; name the result).
- [ ] [T016] A required check name — none: confirm no workflow job name changes, so no branch ruleset edit is owed.
- [ ] [T017] `docs/adr/` — none: confirm this is cleanup after a known incident rather than a new decision, and link [chrisgriffin/ops#1746](https://github.com/chrisgriffin/ops/issues/1746) and [chrisgriffin/ops#1726](https://github.com/chrisgriffin/ops/issues/1726) in the PR body.
- [ ] [T018] A vault living doc whose `covers:` names a path in this repo — cannot appear in a repo diff. With vault access, run `grep -rl "token-atlas:specs" AI/` and record the result as one line in the PR body; without it, say the check could not run rather than claiming it passed.
