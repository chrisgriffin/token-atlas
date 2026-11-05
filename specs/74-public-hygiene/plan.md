# Plan: Committed files carry no retired spec section and no references to a repository that is not public

## Approach

- 21 spec files whose retired section says only `none`: delete the heading and its body.
- `specs/004-ovsx-release-secret/spec.md`: its two owner steps move under `### Edge Cases`; the first was already there as a bullet, the second (creating the Open VSX secret) becomes one.
- `specs/52-gate-release-pr-token/spec.md`: its one precondition moves into `## Overview`; the `## Corrections` bullet that named the section now names the overview; the two private issue refs drop from the overview sentence, which keeps its meaning.
- `specs/52-gate-release-pr-token/plan.md`, `specs/021-unique-spec-numbers/{spec,plan,tasks}.md`: private issue refs and repo names go; each sentence says "the operator" or drops the citation.
- `.github/workflows/evaluator-gate.yml`: the comment's private issue ref and repo name go; the comment keeps its meaning.
- `test/ci/workflow-stub-guards.test.ts`: the guard that a stub never calls a private repo's workflow named that repo; it now refuses any job-level `uses:` outside the public workflows repo, which covers the same case without the name.

## Surfaces touched

- `.github/workflows/evaluator-gate.yml`: comment only; no job name changes, so no branch ruleset edit.
- `test/ci/workflow-stub-guards.test.ts`: one assertion, stricter than before.
- none other: no `package.json`, `.vscodeignore`, `dependencies`/`mainFields`, published surface or `docs/` change; the new `specs/74-public-hygiene/` folder sits in `specs/`, which already exists.
