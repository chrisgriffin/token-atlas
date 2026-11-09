# Tasks: Grant id-token: write for Open VSX trusted publishing

## Phase 1 — foundational

- [ ] T001 In `.github/workflows/create-github-release.yml`, add `id-token: write` to the `permissions:` block beside `contents: write`, with a comment naming trusted publishing and the `Open VSX publish skipped: no OVSX_PAT secret, and no id-token: write` notice it answers.
- [ ] T002 Confirm nothing else moved: the `uses:` line, every `with:` input and the `secrets:` block (`VSCE_PAT`, `OVSX_PAT`) are byte-identical to `develop`'s, and `contents: write` is still present.

## Phase 2 — gate

- [ ] T003 Run the spec's runnable line and confirm it now exits 0 printing `granted`.
- [ ] T004 `npm run format:check && npm run lint && npm run typecheck && npm test && npm run build && npm run test:integration` — the repo's gate, unchanged by this edit but run so the PR is not the first to find out.

## Phase 3 — surfaces

- [ ] T005 `docs/releasing.md` — say how Open VSX is authenticated: trusted publishing from the run's OIDC token, not a stored `OVSX_PAT`.
- [ ] T006 `CLAUDE.md` § Releasing — verify the existing line that merging the release PR "publishes it to the Marketplace and Open VSX" and leave it as the one statement of the rule; do not add a second copy in `docs/releasing.md`.
- [ ] T007 `docs/adr/` — add a short record: Open VSX is published by trusted publishing rather than a stored token, linking `chrisgriffin/ops#2002` rather than copying its history. Link the record from the PR.
- [ ] T008 Confirm in the PR body: the `release` job name and every check name are unchanged, so the branch ruleset needs no edit; and no other stub and no shared workflow body is touched.
- [ ] T009 Cost: none. Confirm in the PR body that no trigger, cron, schedule or agent fire changed.
- [ ] T010 The vault's Build Loop and System Map notes describe the release flow by registry. Neither can appear in a repo diff: record as done in the PR body, one line each, if this makes either stale.
- [ ] T011 (after merge) The next release's `release / marketplace` job no longer prints the `no OVSX_PAT secret, and no id-token: write` notice: it either verifies the new version on `https://open-vsx.org/api/chrisgriffinio/token-atlas` or fails red on the trusted-publishing exchange. A green run that skips Open VSX again means the grant did not take, and a red one means the open-vsx.org registration is the remaining cause — which is `chrisgriffin/ops#2002` and Chris's.
