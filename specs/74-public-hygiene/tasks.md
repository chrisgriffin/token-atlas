# Tasks

## Phase 1: Retired section

- [x] T001 Delete the retired section from the 21 spec files where it says `none`.
- [x] T002 `specs/004-ovsx-release-secret/spec.md`: move the owner steps under `### Edge Cases`.
- [x] T003 `specs/52-gate-release-pr-token/spec.md`: move the precondition into `## Overview` and repoint the `## Corrections` bullet.

## Phase 2: Private references

- [x] T004 `specs/52-gate-release-pr-token/{spec,plan}.md`: drop the private issue refs and repo name.
- [x] T005 `specs/021-unique-spec-numbers/{spec,plan,tasks}.md`: drop the private issue refs.
- [x] T006 `.github/workflows/evaluator-gate.yml`: reword the comment.
- [x] T007 `test/ci/workflow-stub-guards.test.ts`: refuse any job-level `uses:` outside the public workflows repo.

## Phase 3: Check

- [x] T008 Run the Runnable line (prints `0`) and the build gate.
