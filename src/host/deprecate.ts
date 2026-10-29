/**
 * Carrying a deprecation out (spec 015), the write side of what diagnostics.ts
 * reads: deprecate a token with a reason and a replacement, move one use at a
 * time onto that replacement with a quick fix, list every use that is left,
 * and say how many remain before removing the token.
 *
 * The replacement is the first `{reference}` in the `$deprecated` reason
 * (docs/adr/ADR-003-deprecation-replacement.md). Every use offered or counted
 * here is one the existing readers already report — `deprecatedReferences`
 * in token files, `tokenUsages` (as the strike-through does) in code — so no
 * third matcher decides what counts. A quick fix is per use on purpose: a
 * replacement need not be value-identical, so nothing here sweeps a workspace.
 *
 * The write side is behind `tokenAtlas.deprecationWorkflow`, off by default
 * (spec 019): with it off the commands refuse and the quick fix is not
 * offered. Reading `$deprecated` — the hover, the strike-through — is not,
 * and neither is the visual editor's removal guard on an already-deprecated
 * token: `mayDelete` runs `mayRemove` before it reads the setting.
 * With it on, deleting a token that is still used offers to deprecate it
 * instead, and rename keeps the old name (rename.ts).
 */
import * as vscode from "vscode"
import {
  findNodeAtLocation,
  getLocation,
  parseTree,
  type Node,
} from "jsonc-parser"
import {
  aliasCandidates,
  computeDeleteEdits,
  computeDeprecateEdits,
  computeRetargetEdits,
  deprecatedReferences,
  deprecation,
  deprecationReplacement,
  indexTokens,
  inlineSources,
  isGeneratedCode,
  parseTokens,
  retargetIdentifier,
  tokenReferences,
  tokenUsages,
  type Edit,
  type Fragment,
  type TokenDocumentModel,
  type TokenNode,
} from "../core"
import { codeUsages } from "./codeUsages"
import { LANGUAGES } from "./exportFeatures"
import { TokenEditorProvider } from "./tokenEditorProvider"
import {
  TOKEN_SELECTOR,
  buildWorkspaceIndex,
  findResolverFiles,
  findTokenFiles,
  isResolverDocument,
  isTokenDocument,
  keyRange,
  localScopeFor,
  rowTarget,
  type IndexedToken,
} from "./workspaceIndex"

/** Whether the deprecation workflow is on: `tokenAtlas.deprecationWorkflow`, off by default. */
export function deprecationWorkflow(): boolean {
  return (
    vscode.workspace
      .getConfiguration("tokenAtlas")
      .get<boolean>("deprecationWorkflow") ?? false
  )
}

/** Says why a workflow command did nothing while the setting is off. */
function workflowOff(): boolean {
  if (deprecationWorkflow()) return false
  void vscode.window.showInformationMessage(
    "The deprecation workflow is off. Turn on the tokenAtlas.deprecationWorkflow setting to use it.",
  )
  return true
}

/** Every token in the workspace index, except those from `uri` — as diagnostics resolves. */
export function externalFor(
  ws: Map<string, IndexedToken>,
  uri?: vscode.Uri,
): Map<string, TokenNode> {
  const here = uri?.toString()
  const out = new Map<string, TokenNode>()
  for (const [key, hit] of ws)
    if (hit.uri.toString() !== here) out.set(key, hit.token)
  return out
}

/** The reference string at `path`, quotes excluded: where diagnostics strikes it through. */
function stringRange(
  document: vscode.TextDocument,
  root: Node | undefined,
  path: Array<string | number>,
  base = 0,
): vscode.Range | undefined {
  const node = root && findNodeAtLocation(root, path)
  if (!node) return undefined
  return new vscode.Range(
    document.positionAt(base + node.offset + 1),
    document.positionAt(base + node.offset + node.length - 1),
  )
}

/** The fragments of `document` that hold tokens: the whole file, or a resolver's inline sources. */
function fragmentsOf(document: vscode.TextDocument): Fragment[] {
  if (isTokenDocument(document))
    return [{ text: document.getText(), path: [], offset: 0 }]
  return isResolverDocument(document) ? inlineSources(document.getText()) : []
}

type Reader<R> = (
  model: TokenDocumentModel,
  external?: Map<string, TokenNode>,
  localScope?: (key: string) => boolean,
) => R[]

/**
 * The references in one token document or resolver that `read` reports —
 * `deprecatedReferences` or `tokenReferences` — each with its range in `document`. A
 * whole token file resolves against the index minus itself and its
 * active-set scope, as its diagnostics do; an inline resolver source against
 * the whole index.
 */
function usesIn<R extends { path: Array<string | number>; reference: string }>(
  document: vscode.TextDocument,
  ws: Map<string, IndexedToken>,
  read: Reader<R>,
): Array<{ ref: R; range: vscode.Range; fragment: Fragment }> {
  const out: Array<{ ref: R; range: vscode.Range; fragment: Fragment }> = []
  const whole = isTokenDocument(document)
  const external = externalFor(ws, whole ? document.uri : undefined)
  const scope = whole ? localScopeFor(document.uri) : undefined
  for (const fragment of fragmentsOf(document)) {
    const root = parseTree(fragment.text)
    for (const ref of read(parseTokens(fragment.text), external, scope)) {
      const range = stringRange(document, root, ref.path, fragment.offset)
      if (range) out.push({ ref, range, fragment })
    }
  }
  return out
}

/** Whether `key` is deprecated in the workspace index — what a code use is judged against. */
function deprecatedInIndex(
  ws: Map<string, IndexedToken>,
  key: string,
): boolean {
  const token = ws.get(key)?.token
  return token !== undefined && deprecation(token) !== undefined
}

/**
 * Every remaining use of the deprecated token `key` across the workspace: each
 * `{reference}` or `$ref` to it in a token file or a resolver's inline tokens,
 * and each use of its exported name in CSS, Sass, Less, JS or TS. Read from
 * the workspace's files rather than its open editors, so a file nobody has
 * opened counts. A declaration in exported code defines the name, and a
 * comment mentions it; neither is a use. The list and the removal guard both
 * count with this, so they cannot disagree about "unused".
 */
export async function deprecatedUses(key: string): Promise<vscode.Location[]> {
  const ws = await buildWorkspaceIndex()
  const out = await fileUses(doc =>
    usesIn(doc, ws, deprecatedReferences).filter(
      ({ ref }) => ref.reference === key,
    ),
  )
  if (!deprecatedInIndex(ws, key)) return out
  return [...out, ...(await codeUses(ws, key))]
}

/**
 * Every use of the token `key` defined in `document`, deprecated or not: the
 * delete prompt's count (spec 019). The same readers as deprecatedUses, with
 * every reference rather than only the deprecated ones; a file that defines
 * `key` itself resolves its references to its own token (invariant 4), so
 * they are not uses of this one.
 */
async function tokenUses(
  document: vscode.TextDocument,
  key: string,
): Promise<vscode.Location[]> {
  const ws = await buildWorkspaceIndex()
  const self = document.uri.toString()
  const out = await fileUses(doc =>
    usesIn(doc, ws, tokenReferences).filter(
      ({ ref, fragment }) =>
        ref.reference === key &&
        (doc.uri.toString() === self ||
          !indexTokens(parseTokens(fragment.text)).has(key)),
    ),
  )
  return [...out, ...(await codeUses(ws, key))]
}

/** The locations `pick` finds in every token file and resolver, read from the workspace's files. */
async function fileUses(
  pick: (doc: vscode.TextDocument) => Array<{ range: vscode.Range }>,
): Promise<vscode.Location[]> {
  const out: vscode.Location[] = []
  const files = [...(await findTokenFiles()), ...(await findResolverFiles())]
  for (const { uri } of files) {
    let doc: vscode.TextDocument
    try {
      doc = await vscode.workspace.openTextDocument(uri)
    } catch {
      continue // unreadable file — skip
    }
    for (const { range } of pick(doc)) out.push(new vscode.Location(uri, range))
  }
  return out
}

/**
 * The uses of `key`'s exported name in CSS, Sass, Less, JS and TS: the files
 * Find References has a use in, each confirmed by the reader the
 * strike-through uses, which skips comments and declarations.
 */
async function codeUses(
  ws: Map<string, IndexedToken>,
  key: string,
): Promise<vscode.Location[]> {
  const out: vscode.Location[] = []
  const keys = [...ws.keys()]
  const byFile = new Map<string, vscode.Uri>()
  for (const usage of (await codeUsages(keys)).get(key) ?? []) {
    if (!usage.declaration)
      byFile.set(usage.location.uri.toString(), usage.location.uri)
  }
  for (const uri of byFile.values()) {
    let doc: vscode.TextDocument
    try {
      doc = await vscode.workspace.openTextDocument(uri)
    } catch {
      continue
    }
    const pick = (k: string) => (k === key ? true : undefined)
    for (const u of tokenUsages(doc.getText(), keys, pick, doc.languageId)) {
      out.push(
        new vscode.Location(
          uri,
          new vscode.Range(u.line, u.character, u.line, u.character + u.length),
        ),
      )
    }
  }
  return out
}

/** The token whose key (or anything inside it) is at `position`, with the fragment it is in. */
function tokenAt(
  document: vscode.TextDocument,
  position: vscode.Position,
): { path: string[]; fragment: Fragment } | undefined {
  const offset = document.offsetAt(position)
  const fragment = fragmentsOf(document).find(
    f => offset >= f.offset && offset <= f.offset + f.text.length,
  )
  if (!fragment) return undefined
  const at = getLocation(document.getText(), offset).path.slice(
    fragment.path.length,
  )
  const names: string[] = []
  for (const seg of at) {
    if (typeof seg !== "string" || seg.startsWith("$")) break
    names.push(seg)
  }
  const local = indexTokens(parseTokens(fragment.text))
  for (let i = names.length; i > 0; i--) {
    if (local.has(names.slice(0, i).join(".")))
      return { path: names.slice(0, i), fragment }
  }
  return undefined
}

/**
 * Where a deprecate or remove command acts: the visual editor row it was
 * right-clicked on, its arguments, else the token under the cursor.
 */
async function targetOf(
  uri: unknown,
  path: unknown,
): Promise<
  | { document: vscode.TextDocument; path: string[]; fragment: Fragment }
  | undefined
> {
  const row = rowTarget(uri)
  if (row) ({ uri, path } = row)
  if (uri instanceof vscode.Uri && Array.isArray(path)) {
    const document = await vscode.workspace.openTextDocument(uri)
    const fragment = fragmentsOf(document).find(f =>
      indexTokens(parseTokens(f.text)).has(path.join(".")),
    )
    return fragment ? { document, path: path.map(String), fragment } : undefined
  }
  const editor = vscode.window.activeTextEditor
  const found = editor && tokenAt(editor.document, editor.selection.active)
  return found && editor ? { document: editor.document, ...found } : undefined
}

function applyIn(
  edit: vscode.WorkspaceEdit,
  document: vscode.TextDocument,
  edits: Edit[],
  base = 0,
) {
  for (const e of edits) {
    edit.replace(
      document.uri,
      new vscode.Range(
        document.positionAt(base + e.offset),
        document.positionAt(base + e.offset + e.length),
      ),
      e.content,
    )
  }
}

/** Asks before removing a token that is still used; replaceable by the integration tests. */
let confirmRemoval = async (message: string): Promise<boolean> =>
  (await vscode.window.showWarningMessage(
    message,
    { modal: true },
    "Remove",
  )) === "Remove"

/** Not a public API: lets `test/integration/` answer the removal prompt and see its text. */
export function setRemovalPrompt(
  prompt: (message: string) => Promise<boolean>,
): () => void {
  const previous = confirmRemoval
  confirmRemoval = prompt
  return () => {
    confirmRemoval = previous
  }
}

/**
 * Whether removing the token at `path` may go ahead: always for one that is
 * not deprecated, silently for a deprecated one nothing uses, and only after
 * a warning naming the count for one still in use.
 */
export async function mayRemove(
  document: vscode.TextDocument,
  path: string[],
  text = document.getText(),
) {
  const key = path.join(".")
  const token = indexTokens(parseTokens(text)).get(key)
  if (!token || !deprecation(token)) return true
  const uses = (await deprecatedUses(key)).length
  if (!uses) return true
  return confirmRemoval(
    `"${key}" is deprecated and still has ${uses} ${uses === 1 ? "use" : "uses"}. Remove it anyway?`,
  )
}

/** The delete prompt's answer: deprecate (with a reason and replacement when given), or delete. */
export type DeleteAnswer =
  | { action: "deprecate"; reason?: string; replacement?: string }
  | { action: "delete" }
  | undefined

/** Asks before deleting a token that is still used; replaceable by the integration tests. */
let askDelete = async (message: string): Promise<DeleteAnswer> => {
  const picked = await vscode.window.showWarningMessage(
    message,
    { modal: true },
    "Deprecate instead",
    "Delete anyway",
  )
  if (picked === "Deprecate instead") return { action: "deprecate" }
  return picked === "Delete anyway" ? { action: "delete" } : undefined
}

/** Not a public API: lets `test/integration/` answer the delete prompt and see its text. */
export function setDeletePrompt(
  prompt: (message: string) => Promise<DeleteAnswer>,
): () => void {
  const previous = askDelete
  askDelete = prompt
  return () => {
    askDelete = previous
  }
}

/**
 * Whether deleting the node at `path` from the visual editor may go ahead. A
 * deprecated token still in use asks as mayRemove does, setting or not. With
 * the deprecation workflow on, a token that is not deprecated and still has
 * uses offers Deprecate instead / Delete anyway / Cancel (spec 019); Cancel,
 * and Deprecate instead, leave it in place.
 */
export async function mayDelete(
  document: vscode.TextDocument,
  path: string[],
): Promise<boolean> {
  if (!(await mayRemove(document, path))) return false
  if (!deprecationWorkflow()) return true
  const key = path.join(".")
  const token = indexTokens(parseTokens(document.getText())).get(key)
  if (!token || deprecation(token)) return true
  const uses = (await tokenUses(document, key)).length
  if (!uses) return true
  const answer = await askDelete(
    `"${key}" still has ${uses} ${uses === 1 ? "use" : "uses"}. Deprecate it instead?`,
  )
  if (answer?.action === "delete") return true
  if (answer?.action === "deprecate")
    await deprecate(document.uri, path, answer.reason, answer.replacement)
  return false
}

/**
 * Deprecate a token with a reason and an optional replacement. From the
 * editor it asks for both; `test/integration/` passes them as arguments. The
 * edit is the core's `$deprecated` line alone (invariant 1).
 */
async function deprecate(
  uri?: unknown,
  path?: unknown,
  reason?: unknown,
  replacement?: unknown,
) {
  if (workflowOff()) return false
  const target = await targetOf(uri, path)
  if (!target) {
    void vscode.window.showInformationMessage(
      "Put the cursor on a token to deprecate it.",
    )
    return false
  }
  const { document, fragment } = target
  const key = target.path.join(".")
  const local = indexTokens(parseTokens(fragment.text))
  const token = local.get(key)!
  const current = typeof token.deprecated === "string" ? token.deprecated : ""
  let why = typeof reason === "string" ? reason : undefined
  let next = typeof replacement === "string" ? replacement : undefined
  if (why === undefined) {
    why = await vscode.window.showInputBox({
      title: `Deprecate ${key}`,
      prompt: "Why is it deprecated? (optional)",
      value: current,
    })
    if (why === undefined) return false
    const ws = await buildWorkspaceIndex()
    const all = new Map([...externalFor(ws, document.uri), ...local])
    const items: Array<vscode.QuickPickItem & { key: string }> = [
      { label: "No replacement", key: "" },
      ...aliasCandidates(all.values(), key, token.type, all).map(t => ({
        label: t.path.join("."),
        description: t.type,
        key: t.path.join("."),
      })),
    ]
    const picked = await vscode.window.showQuickPick(items, {
      title: `Deprecate ${key}: replace it with`,
      placeHolder: "The token its uses should move to",
    })
    if (!picked) return false
    next = picked.key
  }
  const edit = new vscode.WorkspaceEdit()
  applyIn(
    edit,
    document,
    computeDeprecateEdits(fragment.text, target.path, why, next),
    fragment.offset,
  )
  return vscode.workspace.applyEdit(edit)
}

/** List the remaining uses of a deprecated token in the references view; returns them too. */
async function findUses(uri?: unknown, path?: unknown) {
  if (workflowOff()) return []
  const target = await targetOf(uri, path)
  if (!target) {
    void vscode.window.showInformationMessage(
      "Put the cursor on a deprecated token first.",
    )
    return []
  }
  const key = target.path.join(".")
  const token = indexTokens(parseTokens(target.fragment.text)).get(key)!
  if (!deprecation(token)) {
    void vscode.window.showInformationMessage(`"${key}" is not deprecated.`)
    return []
  }
  const uses = await deprecatedUses(key)
  if (!uses.length) {
    void vscode.window.showInformationMessage(
      `"${key}" has no remaining uses: it can be removed.`,
    )
    return uses
  }
  const at = keyRange(target.document, [
    ...target.fragment.path,
    ...target.path,
  ])
  // The peek opens the file as text; from a visual editor row, mark it so
  // `tokenAtlas.defaultEditor` does not swap that tab straight back.
  if (rowTarget(uri)) TokenEditorProvider.preferText(target.document.uri)
  void vscode.commands.executeCommand(
    "editor.action.showReferences",
    target.document.uri,
    at?.start ?? new vscode.Position(0, 0),
    uses,
  )
  return uses
}

/** Remove a deprecated token, warning first while it is still used. Returns whether it went. */
async function remove(uri?: unknown, path?: unknown) {
  if (workflowOff()) return false
  const target = await targetOf(uri, path)
  if (!target) {
    void vscode.window.showInformationMessage(
      "Put the cursor on a deprecated token to remove it.",
    )
    return false
  }
  const { document, fragment } = target
  const key = target.path.join(".")
  if (!deprecation(indexTokens(parseTokens(fragment.text)).get(key)!)) {
    void vscode.window.showInformationMessage(
      `"${key}" is not deprecated. Deprecate it first, move its uses, then remove it.`,
    )
    return false
  }
  if (!(await mayRemove(document, target.path, fragment.text))) return false
  const edit = new vscode.WorkspaceEdit()
  applyIn(
    edit,
    document,
    computeDeleteEdits(fragment.text, target.path),
    fragment.offset,
  )
  return vscode.workspace.applyEdit(edit)
}

/**
 * The lightbulb on a struck-through use whose deprecated token names a
 * replacement that resolves: switch that one use to it. Attached to the
 * `deprecated-token` hint diagnostics.ts already reports there.
 */
class ReplacementFixProvider implements vscode.CodeActionProvider {
  static readonly kinds = [vscode.CodeActionKind.QuickFix]

  async provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
    context: vscode.CodeActionContext,
  ): Promise<vscode.CodeAction[]> {
    const hints = context.diagnostics.filter(
      d =>
        d.source === "Token Atlas" &&
        d.code === "deprecated-token" &&
        d.range.intersection(range),
    )
    if (!hints.length || !deprecationWorkflow()) return []
    const ws = await buildWorkspaceIndex()
    const actions: vscode.CodeAction[] = []
    const offer = (
      from: string,
      to: string,
      at: vscode.Range,
      build: (e: vscode.WorkspaceEdit) => void,
    ) => {
      const action = new vscode.CodeAction(
        `Replace {${from}} with {${to}}`,
        vscode.CodeActionKind.QuickFix,
      )
      action.edit = new vscode.WorkspaceEdit()
      build(action.edit)
      action.diagnostics = hints.filter(d => d.range.intersection(at))
      // Not isPreferred, like the legacy fix: Auto Fix would apply it unasked.
      actions.push(action)
    }

    if (LANGUAGES.includes(document.languageId)) {
      if (isGeneratedCode(document.getText())) return [] // the export tool's to rewrite, as rename leaves it
      const lookup = (k: string) => ws.get(k)?.token
      const pick = (k: string) => {
        const token = lookup(k)
        const next = token && deprecationReplacement(token, lookup)
        return next?.token ? { key: k, next: next.key } : undefined
      }
      for (const u of tokenUsages(
        document.getText(),
        ws.keys(),
        pick,
        document.languageId,
      )) {
        const at = new vscode.Range(
          u.line,
          u.character,
          u.line,
          u.character + u.length,
        )
        if (!at.intersection(range)) continue
        const text = retargetIdentifier(
          document.getText(at),
          u.value.key,
          u.value.next,
        )
        if (text !== undefined)
          offer(u.value.key, u.value.next, at, e =>
            e.replace(document.uri, at, text),
          )
      }
      return actions
    }

    for (const { ref, range: at, fragment } of usesIn(
      document,
      ws,
      deprecatedReferences,
    )) {
      if (!ref.replacement || !at.intersection(range)) continue
      const edits = computeRetargetEdits(
        fragment.text,
        ref.path,
        ref.reference,
        ref.replacement,
      )
      if (edits.length)
        offer(ref.reference, ref.replacement, at, e =>
          applyIn(e, document, edits, fragment.offset),
        )
    }
    return actions
  }
}

export function registerDeprecation(context: vscode.ExtensionContext): void {
  const code = LANGUAGES.map(language => ({ language }))
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      [...(TOKEN_SELECTOR as vscode.DocumentFilter[]), ...code],
      new ReplacementFixProvider(),
      { providedCodeActionKinds: ReplacementFixProvider.kinds },
    ),
    vscode.commands.registerCommand("tokenAtlas.deprecateToken", deprecate),
    vscode.commands.registerCommand("tokenAtlas.findDeprecatedUses", findUses),
    vscode.commands.registerCommand("tokenAtlas.removeDeprecatedToken", remove),
  )
}
