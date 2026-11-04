# Spec: design.md's message contract lists the renamed and deleted messages the host sends the webview

**Issue**: [#64](https://github.com/chrisgriffin/token-atlas/issues/64)

## Overview

`docs/design.md` § 6 describes the messages the extension and its visual editor pass to each other, and says `src/shared/protocol.ts` is right wherever the two disagree. Today they disagree: the code's `HostToWebview` union has `renamed` and `deleted`, which § 6 never lists, and its `init`/`update` payload line leaves out `uri`. The doc now matches the code. Docs only.

## User scenarios

- A reader working from § 6 learns that the host tells the webview when a rename or delete lands, and that an open detail panel follows the renamed node or closes on the deleted one.
- A reader checking the `init`/`update` payload finds every field of `State`, `uri` included.

## Functional requirements

1. § 6's **Host → webview** list carries `renamed { path, newName }` and `deleted { path }`, each with what the webview does with it.
2. § 6's `init`/`update` payload line names `uri` alongside the fields it already names, and says what it is.

## Success criteria

- [x] Every message in `protocol.ts`'s `HostToWebview` union appears in § 6's **Host → webview** list, with its fields and what the webview does with it.
- [x] § 6's `init`/`update` payload line names every field of `State`.
- [x] **Runnable:** `grep -cE '^- `(renamed|deleted) ' docs/design.md`prints`2`(it prints`0`on`develop` today).

## Out of scope

- Any code change; `protocol.ts` is the truth and stays as it is.
