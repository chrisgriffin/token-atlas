/**
 * Rename a token or group and every `{reference}` to it, across the workspace,
 * as one WorkspaceEdit — so VS Code's native rename preview and a single undo
 * cover it. F2 in the text editor and "Rename" in the visual editor both come
 * through buildRenameEdit; the core computes the per-file edits. Tokens
 * written inline in a resolver document rename there too, and references to
 * a renamed token inside them are rewritten. So are its usages in CSS, Sass,
 * Less, JS and TS (codeUsages.ts), each re-spelled in its own convention;
 * a file that says it was generated is left to the export tool.
 *
 * With `tokenAtlas.deprecationWorkflow` on (spec 019) the old name stays, as
 * a deprecated alias of the new one, and every `$deprecated` replacement that
 * named it moves too; a notification offers to remove the alias, and
 * `Rename Token Without Keeping Old Name` renames as the setting being off does.
 */
import * as vscode from "vscode"
import { getLocation } from "jsonc-parser"
import {
  InvalidNameError,
  NameTakenError,
  computeAliasRenameEdits,
  computeReferenceRenameEdits,
  computeRemoveAliasEdits,
  computeRenameEdits,
  computeReplacementRenameEdits,
  indexTokens,
  inlineSources,
  isGeneratedCode,
  parseTokens,
  renameInIdentifier,
  type Edit,
  type Fragment,
} from "../core"
import { codeUsages } from "./codeUsages"
import { deprecationWorkflow, externalFor } from "./deprecate"
import {
  TOKEN_SELECTOR,
  buildWorkspaceIndex,
  findResolverFiles,
  findTokenFiles,
  isResolverDocument,
  isTokenDocument,
  keyRange,
  tokenScopeAt,
} from "./workspaceIndex"

/**
 * Rename the node at `nodePath` in `document` (inside `scope` when it is an
 * inline resolver source), rewriting references in every token file and every
 * inline resolver source.
 */
export async function buildRenameEdit(
  document: vscode.TextDocument,
  nodePath: string[],
  newName: string,
  scope: Fragment = { text: document.getText(), path: [], offset: 0 },
  keepAlias = deprecationWorkflow(),
): Promise<vscode.WorkspaceEdit> {
  // Both rename paths come through here, F2 and the visual editor's:
  // computeRenameEdits throws InvalidNameError for an illegal name before
  // anything is edited.
  const edit = new vscode.WorkspaceEdit()
  const ws = keepAlias ? await buildWorkspaceIndex() : undefined
  // A replacement is looked up in the file first, then the rest of the index.
  const outside = (uri: vscode.Uri) => {
    const external = ws && externalFor(ws, uri)
    return (key: string) => external?.get(key)
  }
  add(
    edit,
    document,
    keepAlias
      ? computeAliasRenameEdits(
          scope.text,
          nodePath,
          newName,
          outside(document.uri),
        )
      : computeRenameEdits(scope.text, nodePath, newName),
    scope.offset,
  )

  const oldKey = nodePath.join(".")
  const newKey = [...nodePath.slice(0, -1), newName].join(".")
  const uses = (text: string, uri: vscode.Uri) => [
    ...computeReferenceRenameEdits(text, oldKey, newKey),
    ...(keepAlias
      ? computeReplacementRenameEdits(text, oldKey, newKey, outside(uri))
      : []),
  ]
  // Every token file, not just index winners (the index is first-file-wins
  // per key). Open each as a TextDocument so offsets match what VS Code edits,
  // unsaved changes included. computeReferenceRenameEdits skips a file that
  // defines the path itself (local-first, invariant 4).
  for (const { uri } of await findTokenFiles()) {
    if (uri.toString() === document.uri.toString()) continue
    try {
      const doc = await vscode.workspace.openTextDocument(uri)
      add(edit, doc, uses(doc.getText(), uri))
    } catch {
      /* unreadable file — skip */
    }
  }
  // Each inline source is its own scope, local-first like a file.
  for (const { uri } of await findResolverFiles()) {
    try {
      const doc = await vscode.workspace.openTextDocument(uri)
      const self = doc.uri.toString() === document.uri.toString()
      for (const s of inlineSources(doc.getText())) {
        if (self && s.offset === scope.offset) continue
        add(edit, doc, uses(s.text, uri), s.offset)
      }
    } catch {
      /* unreadable file — skip */
    }
  }
  await addCodeUsages(edit, scope.text, oldKey, nodePath.length - 1, newName)
  return edit
}

/**
 * Rename and apply, as the visual editor and the escape-hatch command do,
 * then offer to remove the alias when one was kept. Returns whether the
 * edit applied.
 */
export async function applyRename(
  document: vscode.TextDocument,
  nodePath: string[],
  newName: string,
  scope?: Fragment,
  keepAlias = deprecationWorkflow(),
): Promise<boolean> {
  const ok = await vscode.workspace.applyEdit(
    await buildRenameEdit(document, nodePath, newName, scope, keepAlias),
  )
  if (ok && keepAlias)
    void offerAliasRemoval(document, nodePath, newName, scope?.path ?? [])
  return ok
}

const REMOVE_ALIAS = "Remove alias"

/** Says a rename kept the old name; replaceable by the integration tests. */
let noticeAlias = async (message: string): Promise<string | undefined> =>
  vscode.window.showInformationMessage(message, REMOVE_ALIAS)

/** Not a public API: lets `test/integration/` answer the rename notification and see its text. */
export function setAliasNotice(
  notice: (message: string) => Promise<string | undefined>,
): () => void {
  const previous = noticeAlias
  noticeAlias = notice
  return () => {
    noticeAlias = previous
  }
}

/** The fragment of `document` at `path`: the whole file, or the resolver's inline source there. */
function fragmentAt(
  document: vscode.TextDocument,
  path: Array<string | number>,
): Fragment | undefined {
  const text = document.getText()
  if (!path.length) return { text, path: [], offset: 0 }
  return inlineSources(text).find(
    s => JSON.stringify(s.path) === JSON.stringify(path),
  )
}

/**
 * The notification after a rename that kept the old name, with its Remove
 * alias action; none when no alias was left. The alias goes only while it is
 * still the one the rename left (computeRemoveAliasEdits), checked again on
 * the click. Returns whether it was removed.
 */
async function offerAliasRemoval(
  document: vscode.TextDocument,
  nodePath: string[],
  newName: string,
  scopePath: Array<string | number>,
): Promise<boolean> {
  const oldKey = nodePath.join(".")
  const newKey = [...nodePath.slice(0, -1), newName].join(".")
  const kept = fragmentAt(document, scopePath)
  // An empty group leaves no alias, so there is nothing to say.
  if (!kept || !computeRemoveAliasEdits(kept.text, nodePath, newKey).length)
    return false
  const answer = await noticeAlias(
    `Renamed "${oldKey}" to "${newKey}". "${oldKey}" stays as a deprecated alias, so its uses outside this workspace keep working.`,
  )
  if (answer !== REMOVE_ALIAS) return false
  const fragment = fragmentAt(document, scopePath)
  const edits = fragment
    ? computeRemoveAliasEdits(fragment.text, nodePath, newKey)
    : []
  if (!edits.length) {
    void vscode.window.showInformationMessage(
      `"${oldKey}" is no longer the alias the rename left, so it stays.`,
    )
    return false
  }
  const edit = new vscode.WorkspaceEdit()
  add(edit, document, edits, fragment!.offset)
  return vscode.workspace.applyEdit(edit)
}

/**
 * F2 hands its edit to VS Code, which applies it now or after the refactor
 * preview, or never. The notification waits for the alias to appear in the
 * document, and gives up after ten minutes.
 */
function offerWhenApplied(
  document: vscode.TextDocument,
  nodePath: string[],
  newName: string,
  scopePath: Array<string | number>,
): void {
  const newKey = [...nodePath.slice(0, -1), newName].join(".")
  const done = () => {
    clearTimeout(timer)
    listener.dispose()
  }
  const listener = vscode.workspace.onDidChangeTextDocument(e => {
    if (e.document !== document) return
    const fragment = fragmentAt(document, scopePath)
    if (!fragment?.text) return
    if (!computeRemoveAliasEdits(fragment.text, nodePath, newKey).length) return
    done()
    void offerAliasRemoval(document, nodePath, newName, scopePath)
  })
  const timer = setTimeout(done, 10 * 60_000)
}

const CODE_USAGE: vscode.WorkspaceEditEntryMetadata = {
  label: "Code usages",
  needsConfirmation: false,
}

/**
 * Rewrite the code usages of `oldKey`, or of every token under it when it is
 * a group, renaming its segment at `depth`. Identifiers are matched against
 * the same keys Find References uses, so rename moves exactly what it lists.
 * Declarations move too, keeping a hand-written file consistent; a generated
 * file is skipped whole (isGeneratedCode).
 */
async function addCodeUsages(
  edit: vscode.WorkspaceEdit,
  text: string,
  oldKey: string,
  depth: number,
  newName: string,
): Promise<void> {
  const local = indexTokens(parseTokens(text))
  const renamed = [...local.keys()].filter(
    k => k === oldKey || k.startsWith(oldKey + "."),
  )
  if (!renamed.length) return
  const keys = new Set([
    ...(await buildWorkspaceIndex()).keys(),
    ...local.keys(),
  ])
  const usages = await codeUsages(keys)
  const docs = new Map<string, vscode.TextDocument | undefined>()
  for (const key of renamed) {
    for (const { location } of usages.get(key) ?? []) {
      const uri = location.uri.toString()
      if (!docs.has(uri)) {
        try {
          const doc = await vscode.workspace.openTextDocument(location.uri)
          docs.set(uri, isGeneratedCode(doc.getText()) ? undefined : doc)
        } catch {
          docs.set(uri, undefined) // unreadable file — skip
        }
      }
      const doc = docs.get(uri)
      if (!doc) continue
      const r = renameInIdentifier(
        doc.getText(location.range),
        key,
        depth,
        newName,
      )
      if (!r) continue
      const at = location.range.start
      edit.replace(
        doc.uri,
        new vscode.Range(at.translate(0, r.start), at.translate(0, r.end)),
        r.text,
        CODE_USAGE,
      )
    }
  }
}

function add(
  edit: vscode.WorkspaceEdit,
  document: vscode.TextDocument,
  edits: Edit[],
  base = 0,
): void {
  for (const e of edits) {
    const start = base + e.offset
    edit.replace(
      document.uri,
      new vscode.Range(
        document.positionAt(start),
        document.positionAt(start + e.length),
      ),
      e.content,
    )
  }
}

/** The token or group whose key is under `position`, or undefined. */
function renameTargetAt(
  document: vscode.TextDocument,
  position: vscode.Position,
): { path: string[]; range: vscode.Range; scope: Fragment } | undefined {
  const offset = document.offsetAt(position)
  const loc = getLocation(document.getText(), offset)
  if (!loc.isAtPropertyKey) return
  // A token document, or a source written inline in a resolver.
  const scope = tokenScopeAt(document, offset)
  if (!scope) return
  const path = loc.path.slice(scope.path.length)
  if (!path.length) return
  if (
    !path.every((s): s is string => typeof s === "string" && !s.startsWith("$"))
  )
    return
  const key = path.join(".")
  const local = indexTokens(parseTokens(scope.text))
  const known =
    local.has(key) || [...local.keys()].some(k => k.startsWith(key + "."))
  if (!known) return
  const range = keyRange(document, [...scope.path, ...path])
  return range ? { path, range, scope } : undefined
}

const renamable = (document: vscode.TextDocument) =>
  isTokenDocument(document) || isResolverDocument(document)

class TokenRenameProvider implements vscode.RenameProvider {
  prepareRename(document: vscode.TextDocument, position: vscode.Position) {
    if (!renamable(document)) return
    const target = renameTargetAt(document, position)
    if (!target)
      throw new Error("Put the cursor on a token or group name to rename it.")
    return {
      range: target.range,
      placeholder: target.path[target.path.length - 1],
    }
  }

  async provideRenameEdits(
    document: vscode.TextDocument,
    position: vscode.Position,
    newName: string,
  ) {
    if (!renamable(document)) return
    const target = renameTargetAt(document, position)
    if (!target) return
    const keepAlias = deprecationWorkflow()
    const edit = await buildRenameEdit(
      document,
      target.path,
      newName,
      target.scope,
      keepAlias,
    )
    if (keepAlias)
      offerWhenApplied(document, target.path, newName, target.scope.path)
    return edit
  }
}

/**
 * `Rename Token Without Keeping Old Name`: rename as the setting being off
 * does, leaving no alias. The token under the cursor, or `uri` and `path`
 * as `test/integration/` passes them, with `newName` asked for unless given.
 * Offered only while the deprecation workflow is on: off, F2 already does it.
 */
async function renameWithoutAlias(
  uri?: unknown,
  path?: unknown,
  newName?: unknown,
): Promise<boolean> {
  if (!deprecationWorkflow()) {
    void vscode.window.showInformationMessage(
      "The deprecation workflow is off, so rename already keeps no old name.",
    )
    return false
  }
  let target: { document: vscode.TextDocument; path: string[]; scope: Fragment }
  if (uri instanceof vscode.Uri && Array.isArray(path)) {
    const document = await vscode.workspace.openTextDocument(uri)
    const nodePath = path.map(String)
    const key = nodePath.join(".")
    const scope = [
      { text: document.getText(), path: [], offset: 0 },
      ...inlineSources(document.getText()),
    ].find(f => {
      const keys = [...indexTokens(parseTokens(f.text)).keys()]
      return keys.some(k => k === key || k.startsWith(key + "."))
    })
    if (!scope) return false
    target = { document, path: nodePath, scope }
  } else {
    const editor = vscode.window.activeTextEditor
    const at =
      editor && renamable(editor.document)
        ? renameTargetAt(editor.document, editor.selection.active)
        : undefined
    if (!editor || !at) {
      void vscode.window.showInformationMessage(
        "Put the cursor on a token or group name to rename it.",
      )
      return false
    }
    target = { document: editor.document, path: at.path, scope: at.scope }
  }
  const name =
    typeof newName === "string"
      ? newName
      : await vscode.window.showInputBox({
          title: `Rename ${target.path.join(".")} without keeping its old name`,
          value: target.path[target.path.length - 1],
        })
  if (name === undefined) return false
  try {
    return await applyRename(
      target.document,
      target.path,
      name,
      target.scope,
      false,
    )
  } catch (err) {
    if (err instanceof NameTakenError || err instanceof InvalidNameError) {
      void vscode.window.showErrorMessage(err.message)
      return false
    }
    throw err
  }
}

export function registerRename(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerRenameProvider(
      TOKEN_SELECTOR,
      new TokenRenameProvider(),
    ),
    vscode.commands.registerCommand(
      "tokenAtlas.renameWithoutAlias",
      renameWithoutAlias,
    ),
  )
}
