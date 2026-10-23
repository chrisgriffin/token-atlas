# Implementation Plan: Visual editor fixes before 1.0

**Branch**: `006-webview-editor-fixes` | **Spec**: [spec.md](./spec.md)

## Summary

Webview-only fixes, each pinned by a test in the existing test file for its subject.

## Technical context

- React 18 under jsdom with Testing Library, run by vitest.
- Composite sub-values: `src/webview/editors/composite.tsx` routes every sub-field through one `Field` wrapper that shows a reference read-only (`RefValue` in `editors/fields.tsx`); `EditorProps` gains an optional `resolved` so Unlink can write the resolved sub-value. `DimensionField`/`DurationField` stop spreading non-objects.
- Colours: one helper in `editors/color.ts` turns a typed or picked hex into a colour object in a given space, keeping alpha on a pick; `ColorSubField`, `Glyph` and `ColorEditor` share it. `lib/defaults.ts` builds starter colours through `buildFromHex` in the configured space.
- Last value sent: `Detail.tsx` holds the value it last sent and hands that to the editors until the host's next update.
- `App.tsx`: one `rename` for the table and both panels (sibling check, selection follows); `addNode` falls back to the scope and counts names already posted; + Group opens the new group.
- `Table.tsx`: sections come straight from the walk, so an empty group gets a section; section names open their group; the value cell shows `resolvedValue` for a `$ref` property reference; inline cells and the table swatch are Tab stops only in the selected row.
- `InlineCell.tsx`: closing on Enter/Escape focuses the table wrapper; composition Enter is ignored (also `shared.tsx`, `fields.tsx`, `AliasPicker.tsx`).
- `ColorSwatchInput` commits on the native `change` event and previews drag steps locally.
- `styles.ts`: High Contrast outline on selected rows (`--vscode-contrastActiveBorder`), a `:focus-visible` ring on `.table-wrap`, and a button reset for the panel name.
- `lib/inline.ts` accepts strokeStyle keywords; the keyword list lives once in `lib/css.ts`. `lib/css.ts` `summarize` never prints `[object Object]`.

## Surfaces touched

- `src/webview/**`: the fixes above.
- `test/webview/**`: one regression test per finding, titled with the issue number.
- `specs/006-webview-editor-fixes/`: this spec folder (already covered by `specs/**` in `.vscodeignore`).
- `src/shared/protocol.ts`: no change; no message needs a new field.
- `docs/architecture.md`: no directory added, removed or renamed, and no part's job changes; no change.
- CLAUDE.md couplings table: none of its left-hand files change.
- Fleet surfaces: none apply (no published surface, workflow, ruleset or doc rule changes).
