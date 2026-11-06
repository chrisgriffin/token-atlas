# Plan: The workflow stub and timeout tests also check a workflow file named .yaml

## Technical context

- `test/ci/workflow-stub-guards.test.ts`: the per-file loop and the "is the only workflow that runs the gate" check filter `readdirSync` on `.yml`; `wf(name)` always appends `.yml`, and the loop strips `.yml` to call `job(name)`. A `/\.ya?ml$/` pattern replaces both filters, and `wf` takes either a bare name (the named checks, which stay `.yml`) or a file name already ending in either extension, so the loop passes the file through unchanged.
- `test/ci/workflow-timeouts.test.ts`: `FILES` filters on the same pattern.
- Test-only change; the existing suite is the test, and the runnable line plus a matching timeout probe show the red-to-green.

## Surfaces touched

- none — test-only change: no `src/`, `package.json`, workflow or published surface, and no doc names the extension these tests read (`grep -rn "\.yml" docs CLAUDE.md README.md` names no listing rule).
