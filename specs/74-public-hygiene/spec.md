# Spec: Committed files carry no retired spec section and no references to a repository that is not public

**Issue**: [#74](https://github.com/chrisgriffin/token-atlas/issues/74)

## Overview

Twenty-three committed spec files still carry a retired section that listed asks for the repo owner, and a few committed files (one workflow comment, two spec folders, one test) cite issues in, or name, a repository that is not public. A reader of this public repo cannot open those references, and the section is no longer part of the spec format. This removes both while keeping each document's meaning.

## Success criteria

1. No committed file on `develop` carries the retired owner-ask section heading; any real content it held moves under the document's nearest fitting section.
2. No committed file on `develop` cites an issue in, or names, a repository that is not public; each sentence keeps its meaning without the reference.
3. **Runnable:** `{ git grep -l "Needs from [C]hris"; git grep -IohE "[a-z][a-z.-]*#[0-9]+|chrisgriffin/[a-z.-]+" -- . ':!package-lock.json' | grep -vxE "(chrisgriffin/)?(token-atlas|workflows|config)(\.git|#[0-9]+)?"; } | wc -l` prints `0` (prints `38` on `develop`).

## Out of scope

- Generic words such as "vault note" or "the operator" that name no repository.
- The `OPS_GH_TOKEN` secret and the reusable's `ops-token` input: names the public reusable workflow declares, not references to a repository.
