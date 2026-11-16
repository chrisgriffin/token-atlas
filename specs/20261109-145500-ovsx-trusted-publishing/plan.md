# Plan: Grant id-token: write for Open VSX trusted publishing

## Technical context

- `.github/workflows/create-github-release.yml` is a thin `uses:` stub on
  `chrisgriffin/workflows/.github/workflows/_reusable-create-github-release.yml@v1`,
  triggered by a merged `pull_request` into `main`.
- It grants `permissions: contents: write` and passes `VSCE_PAT` and
  `OVSX_PAT` under `secrets:`.
- The shared body's publish step reads `ACTIONS_ID_TOKEN_REQUEST_URL`, which the
  runner sets **only** when the caller grants `id-token: write`. With no
  `OVSX_PAT` and no grant it prints the skip notice and exits 0.
- The shared body has **no `permissions:` key of its own**, deliberately, so the
  caller's grant is the whole ceiling. That is why this is a caller-side change
  and not a change to the shared workflow.

## Design decisions

1. **One line, additive.** Add `id-token: write` beside `contents: write`. A
   called workflow cannot be granted more than its caller holds, and
   `contents: write` is still needed to create the Release, so neither is
   dropped.
2. **Keep `OVSX_PAT` in the `secrets:` block.** It costs nothing while the
   secret is unset — the shared body prefers a stored `OVSX_PAT` over trusted
   publishing when both are available — and removing it would silently change
   the route if the secret is ever set.
3. **A comment, not a bare line.** An unexplained `id-token: write` reads as
   over-broad and invites removal; the comment names trusted publishing and the
   notice it answers.
4. **The verification is an `after-merge:` criterion, not a pre-merge one.**
   Nothing before merge can exercise the publish path: the job runs only on a
   merged `release/*` PR into `main`. The pre-merge criteria therefore check the
   grant's presence and shape, and the daily PM pass checks the run.
5. **Do not touch the other five stubs.** Only this one reaches a registry.
   `publish.yml` does not exist in this repo.

## Surfaces touched

- a workflow job name that is a required check — **not touched.** The job name (`release`) and the check names are unchanged, so the branch ruleset needs no edit. This row is listed rather than omitted because a `permissions:` change in a stub is the kind that looks like it might rename a check, and it does not.
- `_reusable-*.yml` in chrisgriffin/workflows and its other callers — **not touched.** The shared body already supports both routes; only this caller's ceiling is short. No other stub needs the grant, because no other stub publishes to a registry.
- a published surface — the extension's Open VSX listing. `docs/releasing.md` describes the release flow and names the registries, so it says how Open VSX is authenticated now.
- `CLAUDE.md` § Releasing — it states that merging the release PR "publishes it to the Marketplace and Open VSX". That is currently not true for Open VSX; it becomes true with this change, so the line is verified rather than edited blind.
- `docs/adr/` — a record, short: Open VSX is published by trusted publishing rather than a stored token, and why. Links `chrisgriffin/ops#2002` for the registration history rather than copying it.
- cost — none. No trigger, cron, schedule or agent fire is added or changed; this alters only the token the existing `release / marketplace` job can request. The job already runs once per release.
- a path named in a vault living doc's `covers:` — the release flow is described in the vault's Build Loop and System Map notes by registry. Neither can appear in a repo diff: record each as done in the PR body, one line, if the change makes either stale.
