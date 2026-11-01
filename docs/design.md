# Token Atlas — DTCG Token Editor (VS Code Extension Design)

This is the design document behind Token Atlas — the scope, layered architecture, DTCG data model, editor-surface decision and milestone plan for a visual and code editor for design tokens that lives entirely inside VS Code and conforms to the **Design Tokens Format Module 2025.10** (the first stable DTCG release, Oct 2025).

**Name & identifiers:** brand name **Token Atlas** (a map of every token: where it is defined, what it aliases and what it resolves to, across files, brands and themes). Marketplace extension ID `token-atlas` (under your publisher), clear on the Marketplace and Open VSX as of 2026-10-10; command prefix `Token Atlas:` (e.g. `Token Atlas: New Token File`); setting and command IDs `tokenAtlas.*`; repo `token-atlas`. The npm names `token-atlas` and `tokenatlas` were unclaimed on 2026-10-10 — irrelevant for Marketplace publishing.

---

## 1. Scope

**In scope**

- A VS Code extension that edits `.tokens` / `.tokens.json` files.
- Full DTCG 2025.10 support: all token types (primitive + composite), aliasing, the modern color model, and round-trip preservation of `$extensions`, `$description`, `$deprecated`.
- A rich visual UI (color pickers, type-specific editors, group/category tree, alias picker) **and** direct JSON editing, kept in sync.

**Out of scope (this exercise)**

- Any standalone / desktop / web-app surface.
- Figma sync or import.
- Token transformation/build output (Style Dictionary-style codegen). Could be a later add-on, noted but not designed here.

**Why VS Code:** tokens live next to code, in git, editable with normal diffs and PRs — no subscription, no plugin sandbox. Everything below is biased toward protecting that: **clean, minimal git diffs** are a first-class requirement, not an afterthought.

---

## 2. Layered architecture

Even scoped to VS Code only, a three-layer split pays for itself in testability and keeps editor-mechanics bugs away from token logic.

```
┌─────────────────────────────────────────────┐
│  UI layer (React, runs in the webview)        │  no vscode imports, no fs
│  render model → emit edit intents             │
└───────────────▲───────────────────────────────┘
                │  typed postMessage protocol
┌───────────────┴───────────────────────────────┐
│  Host adapter (extension host)                 │  the ONLY vscode-aware code
│  CustomTextEditorProvider, doc sync, fs, msgs  │
└───────────────▲───────────────────────────────┘
                │  plain function calls
┌───────────────┴───────────────────────────────┐
│  Core (pure TypeScript)                         │  zero vscode, zero DOM
│  parse · serialize · resolve aliases · validate │
└─────────────────────────────────────────────────┘
```

- **Core** — the valuable, durable part. Parses DTCG JSON into an in-memory model, resolves aliases, validates, and serializes back with format preservation. Unit-tested in isolation with no VS Code or browser dependency.
- **Host adapter** — the thin VS Code shell: registers the custom editor, owns the `TextDocument`, applies edits, brokers the webview message channel. The only place `import vscode` appears.
- **UI** — a React app that renders the core's model and emits _intent_ messages ("set this value", "create alias"). It never touches the filesystem and never serializes JSON itself.

**The rule that keeps this honest:** no `vscode` import outside the host adapter, and no DOM/React in the core. If the UI ever needs to "save", it sends an intent; it doesn't write a file.

### 2.1 `src/host/` — the file map

The only vscode-aware code — all 18 files, alphabetical:
`activeSet.ts` (the status-bar chooser for which files a `{reference}`
resolves against: DTCG resolver resolutions first, stepping through each
modifier when there are more than 12, then Tokens Studio `$themes`),
`codeColorSwatches.ts` (a read-only swatch decoration before each color
token used in CSS/Sass/Less/JS/TS, matching via `src/core/exportNames.ts`),
`codeUsages.ts` (where tokens are used in CSS/Sass/Less/JS/TS, scanned once
per file: the code half of find-references, and the opt-in unused-token hint),
`colorProvider.ts` (inline colour swatches in the raw JSON),
`defaultEditor.ts` (the `tokenAtlas.defaultEditor` setting: reopens a token
document in the visual editor, content-based rather than by filename),
`deprecate.ts` (carrying a deprecation out, mostly behind the
`tokenAtlas.deprecationWorkflow` setting, off by default: the Deprecate Token command,
writing `$deprecated` with a replacement as its first `{reference}`; the quick
fix that moves one struck-through use onto that replacement, in token files,
resolver inline tokens and code; the remaining-uses list, read from the
workspace's files rather than its open editors; and the removal guard, shared
by the Remove Deprecated Token command and the visual editor's delete, that
names how many uses remain before a deprecated token goes — on the visual
editor's delete of an already-deprecated token it works with the setting off
too; with the setting on, the visual editor's delete of a token still in use offers Deprecate
instead / Delete anyway / Cancel — see
[ADR-003](./adr/ADR-003-deprecation-replacement.md)),
`diagnostics.ts` (validation and lint results as squiggles in the Problems panel,
the unused-token hint, a struck-through hint on each use of a deprecated token
in token files, resolver inline tokens and open code files,
the workspace folder's `token-atlas.lint.json`, re-read on every write, and
resolver documents: their structure and that every file and fragment they name exists),
`editorMenu.ts` (the visual editor's right-click menu: Copy Reference, Find
All References, Show in JSON, Rename… and Delete on the row clicked, Copy
Reference alone on an inherited token or a heading `$extends` alone gives, read from
its `data-vscode-context` by `workspaceIndex.ts` `rowTarget`, which the
deprecation commands on the same menu read too; Delete asks first, naming how
many tokens a group takes with it (its own keys in the file plus the inherited
rows that leave the view), those that groups extending it in the same file
inherit named apart,
and refuses a row with no key in the file, saying it is inherited
through `$extends` or `$ref`, no longer in the file, or not found in a file that
does not parse (there, a key the tolerant delete still finds is asked about and
sent); rename and delete go through
`tokenEditorProvider.ts`'s intent queue, and Rename Token Without Keeping Old
Name and Remove Deprecated Token, which do not, tell the open editor through
`TokenEditorProvider.notify`, so the detail panel follows the rename or closes
only on a delete that changed the file),
`exportFeatures.ts` (hover, definition and completion on exported
identifiers in CSS/Sass/Less/JS/TS, matching via `src/core/exportNames.ts`,
and an inlay hint with the resolved value after each `var(--token)` in
CSS/Sass/Less, labelled by `src/core/inlay.ts`),
`hardcodedValues.ts` (the opt-in `tokenAtlas.hardcodedValues` check: a
stylesheet literal equal to a token, with a replace quick fix, matching via
`src/core/hardcoded.ts`),
`languageFeatures.ts` (completion, hover, go-to-def, references, outline,
Go to Symbol in Workspace, matching via `src/core/symbols.ts`, and inlay
hints with each alias's resolved value, labelled by `src/core/inlay.ts`),
`legacyFix.ts` (the quick fix that rewrites a pre-2025.10 `"#ff0000"` /
`"16px"` / `"200ms"` `$value` to its object form, per token or per file),
`newTokenFile.ts` (the New Token File command: writes an empty
`<name>.tokens.json` and opens it),
`rename.ts` (F2 and the visual editor share its workspace-wide reference
rewrite, which also re-spells the token's CSS/Sass/Less/JS/TS usages via
`codeUsages.ts` and `core/exportNames.ts` `renameInIdentifier`, skipping
generated files; with `tokenAtlas.deprecationWorkflow` on it keeps the old
name as a deprecated alias via `core/serialize.ts`
`computeAliasRenameEdits`, offers Remove alias in the notification after,
and backs the Rename Token Without Keeping Old Name command),
`tokenEditorProvider.ts` (the Custom Text Editor provider and message bridge),
`tokenTree.ts` (the Design Tokens panel — every token file in the workspace as
a root, expanding into its groups and tokens),
`typeCodicons.ts` (the type-to-codicon map behind the Design Tokens panel's
icons, kept free of `vscode` imports so vitest can check it),
and `workspaceIndex.ts` (the workspace-wide token index behind cross-file
completion, go-to-def, references and rename, and the scan that finds resolver
documents, and `rowTarget`, the row a right-click menu command acts on).

---

## 3. Editor model — the key decision

You were unsure between a Custom Text Editor and a side-panel webview. Here's the real trade-off and a recommendation.

### Option A — Custom Text Editor (`CustomTextEditorProvider`)

Registers your visual UI as an editor for `*.tokens.json`. The **`TextDocument` stays the single source of truth.**

- **You get for free:** dirty-state, undo/redo, save & hot-exit, file-watching, and git diff/decorations. Your edits are `WorkspaceEdit`s applied to the document; VS Code handles the rest. This is the API Microsoft built for exactly this case.
- **The "can't see both" worry is mostly a non-issue:** you can open the _same_ file in your custom editor in one pane **and** the built-in text editor in a split pane at the same time. Because both bind to the same `TextDocument`, edits in one show live in the other. So "visual on the left, raw JSON on the right, synced" is achievable without you writing any sync code.
- **Watch-outs:**
  - Don't rewrite the whole document on every keystroke — it wrecks undo granularity and cursor position. Apply **targeted edits** (see §5, format-preserving writes).
  - You must reconcile _external_ edits (someone types in the raw JSON, or git switches branches): re-parse on `onDidChangeTextDocument` and reconcile into the UI.

### Option B — Side-panel webview (`WebviewView` / `WebviewPanel`)

A standalone panel; the normal JSON editor stays open beside it.

- **Pros:** visual + JSON visible with no split gymnastics; can show a _workspace-wide_ view (a tree across many token files at once), which a per-file custom editor can't.
- **Cons:** **you own all the sync** — reading, file-watching, reconciling external edits, dirty-state, saving, and undo/redo. That's exactly the bug surface the Custom Text Editor eliminates, and it works against the "git-friendly, no surprises" goal.

### Recommendation

**Primary surface: Custom Text Editor.** It directly serves the reason you're in VS Code — git-clean diffs, native undo, real save semantics — and the split-pane trick covers the "I also want to see raw JSON" desire.

**Optional later: a sidebar `WebviewView`** purely for _navigation_ — a tree of all token files / groups in the workspace, click-to-open. It complements rather than competes, and it stays read-mostly so it doesn't reintroduce the sync problem.

This isn't either/or, which is why "not sure" was the right instinct: start with the custom editor, add the sidebar view only if cross-file overview becomes valuable.

---

## 4. DTCG data model (2025.10)

### 4.1 Structure

- A **token** is any object with a `$value`. A **group** is any object without one. Groups nest arbitrarily and may carry `$type`, `$description`, `$extensions` that descendants inherit.
- Token member props: `$value` (required), `$type`, `$description`, `$deprecated`, `$extensions`.
- **Names** may not contain `{`, `}`, or `.` and may not begin with `$`, except `$root`, a group's root token (§6.2), referenced as `{group.$root}`. The `.` is reserved as the reference path separator.
- File extension `.tokens` or `.tokens.json`; media type `application/design-tokens+json`. Plain JSON — **no comments, no JSON5** (don't offer comment preservation; it isn't valid DTCG). Token Atlas still reads a file with comments or trailing commas, as VS Code's `jsonc` language allows them, so such a file keeps its tokens.

### 4.2 Types to support for "full" conformance

**Primitive**

| `$type`       | Value shape (2025.10)                                                                                                                                                                                                                                                       |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `color`       | **Object**: `{ colorSpace, components, alpha?, hex? }` — supports `srgb`, `srgb-linear`, `hsl`, `hwb`, `lab`, `lch`, `oklab`, `oklch`, `display-p3`, `a98-rgb`, `prophoto-rgb`, `rec2020`, `xyz-d65`, `xyz-d50`. This is the biggest change from the old hex-string format. |
| `dimension`   | **Object**: `{ value: number, unit: "px" \| "rem" }`                                                                                                                                                                                                                        |
| `fontFamily`  | string or array of strings                                                                                                                                                                                                                                                  |
| `fontWeight`  | number (1–1000) or keyword (`thin`…`black`)                                                                                                                                                                                                                                 |
| `duration`    | `{ value: number, unit: "ms" \| "s" }`                                                                                                                                                                                                                                      |
| `cubicBezier` | `[x1, y1, x2, y2]`                                                                                                                                                                                                                                                          |
| `number`      | plain number                                                                                                                                                                                                                                                                |

**Composite** (sub-value names/types are fixed by spec; extra or mistyped sub-values = invalid)

| `$type`       | Sub-values                                                                       |
| ------------- | -------------------------------------------------------------------------------- |
| `strokeStyle` | keyword string, **or** `{ dashArray, lineCap }`                                  |
| `border`      | `{ color, width, style }`                                                        |
| `transition`  | `{ duration, delay, timingFunction }`                                            |
| `shadow`      | object, or array of objects: `{ color, offsetX, offsetY, blur, spread, inset? }` |
| `gradient`    | array of `{ color, position }` stops                                             |
| `typography`  | `{ fontFamily, fontSize, fontWeight, letterSpacing, lineHeight }`                |

Each composite type needs a **dedicated editor** in the UI (a shadow editor, a typography editor, etc.) — this is where most of the visual-UI value lives, since these are painful to hand-edit as JSON.

### 4.3 Aliases / references

- A `$value` of `"{group.subgroup.token}"` is a reference. The referencing token's `$type` is **inherited from the target** when omitted.
- Core must: resolve references to final values, **detect cycles**, flag dangling references, and expose both the raw reference and the resolved value to the UI (so the picker can preview "→ #3B82F6").
- A `$ref` JSON Pointer (`{ "$ref": "#/group/token/$value/components/0" }`) is the second reference syntax: the whole token, or part of its value. Only same-document pointers are read; like aliases, the token path resolves local first, then through the workspace index (spec 071).
- A group's `$extends` (or group-level `$ref`) inherits the target group's tokens; a local token at the same path replaces the inherited one whole. Inherited tokens exist only in the resolved model (`core/extends.ts`), never in the text, so edits, swatches and the outline see the file's own keys; the visual editor turns an edit to an inherited token into an override written in the extending group (spec 071).

### 4.4 Theming / modes

**Update:** the DTCG has since published the [Resolver Module 2025.10](https://www.w3.org/community/reports/design-tokens/CG-FINAL-resolver-20251028/), a `.resolver.json` that composes token files into sets and modifiers (light/dark, sizes) with a defined order. Token Atlas reads it (spec 049): each resolution is a choice in the active-set picker, so the multi-file model below and the spec's own model are the same thing. Inline tokens and file fragments are read too (spec 053); remote URLs are skipped with a warning, because an editor extension fetching over the network is a trust decision the spec leaves optional. The original analysis follows.

When this was written, the **stable DTCG spec did not standardize modes/themes.** Tools solve it differently (separate files per theme; or a `$extensions` convention like Tokens Studio's). So "full DTCG support" technically means _the spec as written_ — theming is a decision **you** make on top:

- **Multi-file** (e.g. `light.tokens.json` / `dark.tokens.json` sharing a primitives file via references) — simplest, most git-friendly, spec-pure.
- **`$extensions` mode convention** — richer, but non-portable and you're inventing semantics.

Recommendation: model themes as **separate files referencing a shared primitives file**, and keep any extra metadata under a namespaced `$extensions` key so round-tripping never drops it. Decide this early — it ripples through the whole resolver.

---

## 5. Format-preserving writes (git-critical)

If the visual editor does `JSON.stringify(model)` on save, it will reorder keys and rewrite whitespace, producing noisy diffs — which defeats the entire reason to be in VS Code.

**Use `jsonc-parser`'s `modify()` / `applyEdits()`** to compute _surgical_ edits against the existing text: change only the bytes that actually changed, preserve key order and indentation everywhere else. The host adapter turns those into a `WorkspaceEdit`. Net effect: editing one color in the UI produces a one-line git diff.

Adding or deleting a property beside a sibling is the exception: `modify()` reformats every line its edit touches, a one-line neighbour such as `"lg": { "$value": 2 }` included, so `computeAddEdits` and `computeDeleteEdits` in `src/core/serialize.ts` write that edit themselves and fall back to `modify()` everywhere else. Setting or removing a `$` property goes through the same two, so a one-line token stays on one line. Every new line takes the file's own indentation (tabs, or its smallest space indent) and line ending, read from the text when the caller passes no formatting options.

---

## 6. Webview ↔ host message contract

Async `postMessage` both ways, as a typed protocol shared by both layers.
**`src/shared/protocol.ts` is the contract** — both sides import its
`WebviewToHost` and `HostToWebview` unions, so the channel cannot drift from the
types. What follows describes that file; when the two disagree, the file is
right.

**Webview → host (intents)** — the webview never writes a file; it asks.

- `ready` — webview booted, request initial state
- `setValue { path, value }`
- `setType { path, tokenType, starterValue? }` · `setDescription { path, description }` · `setDeprecated { path, deprecated, replacement? }`
- `addToken { parentPath, name }` · `addGroup { parentPath, name }`
- `deleteNode { path }` · `renameNode { path, newName }`
- `moveNode { path, direction }` — the detail panel's move up/down · `reorderNodes { parentPath, order[] }` — the full new order under `parentPath`, from a drag-and-drop
- `openAsText` — hand the file back to the text editor
- `setScope { path }` — the table's group scope changed in the webview
- `setColumnWidths { widths }` — a table column was resized; the host saves the widths for every token file
- `setMode { context }` — make this context of the file's resolver modifier the active resolution
- `setModeValue { context, path, value }` — write `$value` at `path` in `context`'s own file
- `setModeView { view }` — the toolbar's one-mode / side-by-side toggle (`single` or `sideBySide`); saved as `tokenAtlas.modeView`

**Host → webview** — the host sends state.

- `init` and `update`, both carrying the same payload: `{ model, validation, externalTokens, settings, scope, selected?, columnWidths, modes? }`. `modes` is set only when the file is a mode of a resolver modifier: its contexts, the one it owns, the active one, and each context's values. `init` is the first push; `update` is every later one, including a change typed into the raw JSON in a split pane — so reconciling an external edit is the same message as any other, not a separate one.
- `error { message }`
- `scope { path, select? }` — the Tokens panel picked a group (or a token, via `select`)

There is no `capabilities` handshake and no separate `validation` message —
`validation` rides `init` and `update`. There is no `$extensions` intent either:
`$extensions` survives a write because §5's surgical edits never rewrite the
bytes around the change, so preserving it is the serializer's property rather
than a message anyone sends.

**Persistence:** use the webview `getState`/`setState` to survive hide/restore cheaply; reserve `retainContextWhenHidden` for when restore cost actually hurts (it holds memory).

---

## 7. Tech choices

- **Extension host:** TypeScript + `vscode` API, bundled with esbuild.
- **Webview UI:** React, bundled by the same esbuild script as the host. Styled with VS Code's theme CSS variables (`--vscode-*`) so the UI matches the user's theme. The deprecated `@vscode/webview-ui-toolkit` is not used: the components are lightweight custom ones over those variables.
- **JSON editing:** `jsonc-parser` for format-preserving edits. Validation is hand-written in `src/core/validate.ts` (structure, value shapes, composite sub-value rules, alias resolution); there is no JSON Schema validator.
- **Color:** `colorjs.io` for the color-space math the 2025.10 color type needs — Oklch/Lab/P3 conversions, gamut mapping, and a `hex` fallback for the swatch.
- **Decorations:** inline color swatches / gutter previews in the _raw_ JSON editor too (`DecorationOptions`), so code-mode editing feels first-class.

---

## 8. Milestone plan

- **M0 — Scaffold.** Extension skeleton, dual build (host + webview), three-layer folders, CI, sample `.tokens.json` fixtures, core unit-test harness.
- **M1 — Read-only render.** Custom editor opens a file; parse → group tree + token detail panel. No editing yet. Reconcile on external change.
- **M2 — Edit primitives, format-preserving.** Change `number`/`dimension`/`fontWeight` values via UI → surgical write → clean diff → undo/redo working through the document.
- **M3 — Full type coverage.** Dedicated editors for every primitive **and** composite type, including the color picker with color-space selection and the typography/shadow/border/gradient editors.
- **M4 — Aliasing.** Reference picker, resolved-value preview, cycle + dangling-ref detection.
- **M5 — Validation & decorations.** Schema + semantic errors surfaced inline; color swatches in raw JSON.
- **M6 — Structure & theming.** Group/token CRUD, rename, reorder, search/filter; implement the chosen multi-file theming model.
- **M7 — Polish.** Theme-matched styling, large-file performance (virtualized tree), packaging, README, publish to Marketplace.

M0 to M6 have shipped, and so has most of M7, including the Marketplace publish. The virtualized tree has not (§10).

A natural **first runnable target is M2** — it proves the whole loop (parse → render → edit → clean save → undo) end to end; everything after is breadth.

---

## 9. Decisions taken

These were open before coding; each is now settled in the code.

1. **Theming model:** multi-file. Theme files reference a shared primitives file; the status-bar active set (`src/host/activeSet.ts`) picks which files a reference resolves against. A DTCG resolver document's resolutions are offered there first (§4.4), then a Tokens Studio export's `$themes`.
2. **Single vs multi-file:** multi-file. A workspace index (`src/host/workspaceIndex.ts`) resolves references across every token file, with the active document's own tokens winning.
3. **Validation strictness:** allow but warn. Problems go to the Problems panel; nothing blocks a save.
4. **`@vscode/webview-ui-toolkit`:** deprecated, so not used; see §7.
5. **Codegen:** still out of scope. Hovers, go-to-definition and completion work on exported identifiers instead ([ADR-001](./adr/ADR-001-exported-identifier-matching.md)).
6. **Resolver sources:** a fragment `file.json#/path` is re-rooted, its children becoming top-level paths, as a JSON `$ref` replaces itself with its target; inline sources resolve the same way, pointing into the resolver. Remote URLs are not fetched (spec 053).

---

### Sources

- [Design Tokens Format Module 2025.10](https://www.designtokens.org/tr/2025.10/format/)
- [Design Tokens specification reaches first stable version — DTCG / W3C](https://www.w3.org/community/design-tokens/2025/10/28/design-tokens-specification-reaches-first-stable-version/)
- [Design Tokens Community Group](https://www.designtokens.org/)
- [Style Dictionary — DTCG support](https://styledictionary.com/info/dtcg/)

## 10. Known gaps / next candidates

- Within the active set, the workspace index is first-file-wins on a token
  path defined in more than one file (sorted by URI, so stable). Each collision
  is reported on the losing file's token at `tokenAtlas.pathCollisions`
  severity (`information` by default), except paths the active document
  defines itself and paths shared only by one resolver modifier's files.
- No virtualized tree in the visual editor (filter and panel scoping instead).
