# Spec: Grant id-token: write so releases reach Open VSX by trusted publishing

## Overview

Token Atlas's releases reach the VS Code Marketplace and silently stop at Open
VSX. The Marketplace serves **1.1.0**; Open VSX still serves **1.0.0** from
2026-10-24. The release run was **green**, because the shared workflow
deliberately gates "no token yet" inside the publish step and emits a notice
rather than failing.

The notice from the v1.1.0 run names both missing routes at once:

```
##[notice]Open VSX publish skipped: no OVSX_PAT secret, and no id-token: write, on chrisgriffin/token-atlas.
```

`OVSX_PAT` is a repository secret only the owner can set, and the step's env
dump shows it empty. The other route needs no secret:
`_reusable-create-github-release.yml` publishes to Open VSX by **trusted
publishing** when the caller grants `id-token: write`, trading the run's OIDC
token for a short-lived publishing token. Chris has said the trusted-publishing
registration on open-vsx.org is done (ops#2002, 2026-11-08).

This repo's `create-github-release.yml` grants `permissions: contents: write`
only, so that branch of the shared workflow could never be taken, whatever is
registered. Adding the grant is a one-line change in this repo and is the only
part of this that is not the owner's.

**Either outcome of that change is an improvement.** If the registration is in
place, Open VSX starts receiving releases. If it is not, the shared workflow's
`--trusted-publishing` fails rather than falling back, so the next release goes
**red** instead of green-with-a-notice — which turns an invisible gap into a
visible one and is the information needed to finish ops#2002.

## User scenarios

1. **A release merges to `main`.** The `release / marketplace` job publishes the
   `.vsix` to the Marketplace with `VSCE_PAT` and to Open VSX with a
   trusted-publishing token, and the shared workflow's read-back verifies both
   versions on their public APIs.
2. **The registration is missing or does not match.** The Open VSX publish
   fails, the job goes red, and the release is visibly incomplete instead of
   quietly half-done.
3. **Someone installs the extension from an Open VSX-based editor** (VSCodium,
   Cursor, Gitpod) and gets the current version rather than one three weeks old.

## Non-goals

- Setting an `OVSX_PAT` secret. That is the owner's and is tracked on
  `chrisgriffin/ops#2002`; this spec takes the route that needs no secret.
- Any change to `_reusable-create-github-release.yml` in
  `chrisgriffin/workflows`. The shared body already supports both routes and is
  behaving as designed; only this caller's `permissions:` is short.
- Republishing 1.1.0 to Open VSX by hand, or any change to what the release
  builds or attaches.
- A check that a release reached every registry its stub names — the systemic
  gap, filed as `chrisgriffin/ops#2273`.

## Success criteria

- [ ] **Runnable:** `node -e 'const y=require("fs").readFileSync(".github/workflows/create-github-release.yml","utf8"); if(!/id-token:\s*write/.test(y)){console.error("no id-token: write grant in the release stub");process.exit(1)} console.log("granted")'` exits 0. Red on `develop`, where it prints `no id-token: write grant in the release stub` and exits 1.
- [ ] The stub grants `contents: write` **and** `id-token: write`, and nothing else — the grant is additive and no existing permission is widened or dropped.
- [ ] The `with:` inputs and the `secrets:` block are unchanged, so `VSCE_PAT` keeps publishing to the Marketplace and `OVSX_PAT` is still passed in case the secret is ever set.
- [ ] A comment in the stub says why the grant is there, naming trusted publishing, so nobody removes it as unused.
- [ ] after-merge: the next release's `release / marketplace` job no longer prints `Open VSX publish skipped: no OVSX_PAT secret, and no id-token: write`. It either verifies the new version on `https://open-vsx.org/api/chrisgriffinio/token-atlas` or fails red on the trusted-publishing exchange; a green run that skips Open VSX again means the grant did not take.
