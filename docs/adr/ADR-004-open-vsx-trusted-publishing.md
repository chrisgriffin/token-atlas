---
status: accepted
date: 2026-11-09
---

# ADR-004: Open VSX is published by trusted publishing, not a stored token

Implemented by [#87](https://github.com/chrisgriffin/token-atlas/issues/87).

## Context

Release v1.1.0 reached the VS Code Marketplace and skipped Open VSX, and the
run was green: the shared release workflow prints `Open VSX publish skipped:
no OVSX_PAT secret, and no id-token: write` and exits 0. Open VSX kept serving
1.0.0.

The shared workflow offers two routes to Open VSX: a stored `OVSX_PAT` secret,
or trusted publishing, which trades the run's OIDC token for a short-lived
publishing token and needs `id-token: write` from the caller. The shared body
has no `permissions:` key, so the caller's grant is the whole ceiling, and this
repo's stub granted `contents: write` only. The open-vsx.org registration and
the `OVSX_PAT` question are tracked in chrisgriffin/ops#2002.

## Decision

- `create-github-release.yml` grants `id-token: write` beside
  `contents: write`, with a comment saying why, so Open VSX publishes by
  trusted publishing.
- The stub keeps passing `OVSX_PAT` by name; if the secret is ever set, the
  shared workflow prefers it.
- `test/ci/workflow-stub-guards.test.ts` pins the grant, and pins that it is
  the only permission added.

## Consequences

- No long-lived Open VSX token has to be created, stored or rotated.
- A release whose trusted-publishing exchange fails now goes red instead of
  green-with-a-notice, so a missing or mismatched open-vsx.org registration
  is visible on the first release after this.
- Every step of the release job can request an OIDC token, not only the
  Open VSX publish: the shared body has no `permissions:` key, so the grant
  reaches its `build_command` (`npm ci && …`) and whatever that installs
  (chrisgriffin/workflows#31). Open VSX trusts that token, so a dependency's
  install script running in the release job could mint it and publish to
  `chrisgriffinio.token-atlas`. The token is scoped to the run, but within
  the run it is a publishing credential.
- Worth revisiting if Open VSX drops trusted publishing, or if the stub's
  workflow file is renamed: Open VSX matches its registration on the ID
  token's `workflow_ref`, the stub's file (chrisgriffin/workflows#22).
