# Feature Specification: Host layer fixes before 1.0

**Feature Branch**: `012-host-layer-fixes`
**Status**: Built

## Summary

A review of the VS Code side of Token Atlas before the 1.0.0 release found that every keystroke in a token file rescanned the whole workspace from disk, that half-typed JSON in one file made other files report false "unresolved" errors, that the visual editor's rename accepted names F2 refuses, and that editing the active resolver changed nothing until it was picked again. It also found smaller gaps: stale index entries, settings read without the file they apply to, hints left on closed files and a mode toggle written where it has no effect. This fixes all of them in `src/host/` and `src/extension.ts`, each with a test that fails before the fix. Chris requested this on 2026-10-22.

## User Scenarios & Testing

### User Story 1 - Typing stays cheap and correct (Priority: P1)

Someone types in a token file in a workspace with hundreds of other JSON files. Each keystroke updates only that file's entry in the index; nothing is searched or read from disk, and other files keep resolving against the edited file's last tokens that parsed.

**Independent Test**: `npx vitest run test/host/workspaceIndex.test.ts`.

**Acceptance Scenarios**:

1. **Given** five token files among 495 other JSON files, **When** one token file is edited, **Then** the next index query runs no search and reads no file.
2. **Given** a cold index, **When** five callers ask at once, **Then** one search runs and each file is read once.
3. **Given** a scan in progress, **When** a keystroke lands, **Then** the scan is kept and holds the keystroke.
4. **Given** ten quick keystrokes, **Then** listeners hear about it once.
5. **Given** `primitives.tokens.json` open, **When** the user types `"new` into it, **Then** `light.tokens.json` reports no errors.

### User Story 2 - Rename refuses bad names everywhere (Priority: P1)

A rename from the visual editor refuses an empty, dotted, braced or `$`-prefixed name and says why, as F2 does; F2 refuses a leading `$` too.

### User Story 3 - The active resolver follows its own edits (Priority: P1)

With a resolver resolution active, editing the resolver re-resolves references without picking it again; renaming a file inside the active token set keeps it in the set.

### User Story 4 - Smaller host gaps (Priority: P2)

- A `.json` file edited so it no longer holds tokens leaves the index.
- `tokenAtlas.include`, `rootFontSize` and `contrastTarget` are read for the file or folder they apply to, and discovery runs per workspace folder.
- Unused-token hints are cleared when their document closes.
- The visual editor's mode-view toggle writes to the most specific settings level that already has a value.
- Reproduced from the unverified list: a discarded edit leaves the index when its file closes; a token file shown under another scheme (a `git:` diff side) gets no diagnostics; a document closed while being checked gets none afterwards; the Tokens panel gives an unknown `$type` a plain icon and a dotted key its own id; the editor-title button opens the file it belongs to.

### Edge Cases

- A file that is still half-typed when first scanned has no last good tokens, so it is indexed as it is.
- The Tokens panel, collisions and other enumerations keep showing a file's current text, so a broken file still shows as broken there; only cross-file resolution uses its last good text.

## Requirements

- **FR-001**: A document change replaces only that file's entry; the index is re-derived in memory.
- **FR-002**: Concurrent callers share one in-flight scan and one in-flight build.
- **FR-003**: Index-change notifications from typing are debounced.
- **FR-004**: The index resolves against a file's last text without JSON syntax errors.
- **FR-005**: The active resolver resolution is stored as resolver and input, and its sources are re-read from the resolver's current text.
- **FR-006**: Both rename paths go through one name check; the visual editor shows its error as a message.
- **FR-007**: Every finding has a test that fails before its fix.

## Success criteria

- [x] A keystroke in a token file searches nothing and reads nothing from disk, callers that arrive together share one scan, a keystroke during a scan keeps the scan, listeners hear once per pause in typing, and half-typed JSON in one file never makes another file's references unresolved.
- [x] The visual editor's rename refuses the names F2 refuses (empty, dotted, braced, or starting with `$`) and says why, and F2 refuses a leading `$`.
- [x] Editing the active resolver changes what references resolve to without picking it again, and a file renamed inside the active token set stays in it.
- [x] A `.json` that stops holding tokens leaves the index; resource-scoped settings are read per file and folder; unused-token hints clear on close; the mode-view toggle takes effect over a workspace value; and each reproduced unverified finding is fixed with a test.
- [x] **Runnable:** `npx vitest run test/host/workspaceIndex.test.ts` exits 0 with 9 tests passed (today 7 of them fail), and `npm run test:integration` exits 0.

## Assumptions

- The core model fixes (#10) add the same name check inside core `computeRenameEdits`; until both land, the host check is the one both rename paths hit.
- `tokenAtlas.modeView` is window-scoped, so the toggle writes to workspace settings when they hold a value and to user settings otherwise.

## Needs from Chris

none
