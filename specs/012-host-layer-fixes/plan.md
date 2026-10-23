# Implementation Plan: Host layer fixes before 1.0

**Branch**: `012-host-layer-fixes` | **Spec**: [spec.md](./spec.md)

## Summary

Make the workspace index incremental: one scan, then each edit, write, close or delete replaces only its own file's entry, and the index is re-derived in memory from those entries. Share in-flight work, debounce the change event for typing, and resolve against each file's last text without syntax errors. Move the active resolver resolution into the index so its sources follow the resolver's text. Route both rename paths through one name check. Fix the smaller gaps where they live.

## Technical context

- `src/host/workspaceIndex.ts` keeps `candidates` (every URI the globs matched), the token and resolver file lists with `text` and `good`, one shared scan promise and one shared build promise. `invalidateWorkspaceIndex` is now the full rescan only (globs, folders, a new file); typing calls `updateFile`.
- Open buffers are read after the scan's last await, so a keystroke mid-scan is in its result.
- Enumerations (`findTokenFiles`) keep returning current text, so the Tokens panel still shows a broken file as broken; only `indexFrom` reads `good`.
- Discovery and the file watchers run per workspace folder with that folder's `tokenAtlas.include`.
- `setActiveSet(entries, inOrder, resolution)`: with a resolution, `syncResolution` recomputes the entries from the resolver's last good text after every scan and every edit to that resolver. `entriesFor` and `activeResolution` move from `activeSet.ts` to the index, their one home. `activeSet.ts` remaps entries on `onDidRenameFiles`.
- `buildRenameEdit` checks the name for both paths and throws `IllegalNameError`; the visual editor shows it as a message, as it does `NameTakenError`.
- Diagnostics skip documents outside `file`, `untitled` and the workspace folders' schemes, publish nothing for a document that closed meanwhile, and clear unused-token hints on close; the hardcoded-value check does the same.
- Tests: `test/host/` loads the index, diagnostics and hover against `vscode-stub.ts`, which counts searches and reads; `test/integration/` covers what needs a real VS Code.

## Surfaces touched

- `src/host/workspaceIndex.ts`, `activeSet.ts`, `rename.ts`, `tokenEditorProvider.ts`, `diagnostics.ts`, `hardcodedValues.ts`, `languageFeatures.ts`, `exportFeatures.ts`, `tokenTree.ts`, `src/extension.ts`.
- `test/host/` (new stub and three suites), `test/integration/` (two new suites, five extended).
- `docs/testing.md` and `docs/architecture.md`: what `test/host/` holds now, and how the index updates.
- `specs/012-host-layer-fixes/`: this folder; `specs/**` is already in `.vscodeignore`.
- CLAUDE.md couplings: no `contributes.menus` `when` clause, esbuild entry, workflow job or ignore file changes. The `editor/title` menu entry for `tokenAtlas.openCurrent` is unchanged; the command now uses the URI it already passed.
- Fleet surfaces: none apply (no published surface, workflow, ruleset, schema or doc rule changes).
