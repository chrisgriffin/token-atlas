/**
 * The visual editor's right-click menu (spec 022): the commands its
 * `webview/context` entries run that nothing else offers. Each gets the
 * row's merged `data-vscode-context` (`rowTarget`); the deprecation commands
 * on the same menu read it in `deprecate.ts` and `rename.ts`.
 *
 * Rename and Delete go through the editor's own intent queue, so they are
 * the edits the name cell and the panels make: the rename alias, the delete
 * prompt and the name errors are theirs, and the detail panel follows the
 * renamed node or closes on the deleted one. Delete asks first (spec 054):
 * the panel's button wants a second click, which a menu has no room for.
 */
import * as vscode from "vscode"
import { applyEdits } from "jsonc-parser"
import {
  computeDeleteEdits,
  countTokens,
  expandExtends,
  indexTokens,
  parseTokens,
  type GroupNode,
  type TokenNode,
} from "../core"
import { TokenEditorProvider } from "./tokenEditorProvider"
import { findGroup } from "./tokenTree"
import { externalIndexFor, keyRange, rowTarget } from "./workspaceIndex"

/** The row a menu command acts on; run from anywhere else, it says it needs one. */
function noRow(arg: unknown): { uri: vscode.Uri; path: string[] } | undefined {
  const row = rowTarget(arg)
  if (!row)
    void vscode.window.showInformationMessage(
      "Right-click a token or group in the Token Editor to use this.",
    )
  return row
}

/** Copy `{path}`, the reference another token's `$value` would use. Returns it. */
async function copyReference(arg?: unknown) {
  const row = noRow(arg)
  if (!row) return undefined
  const reference = `{${row.path.join(".")}}`
  await vscode.env.clipboard.writeText(reference)
  vscode.window.setStatusBarMessage(`Copied ${reference}`, 3000)
  return reference
}

/** Where the key of `path` starts in the document, inside its quotes. */
async function keyPosition(uri: vscode.Uri, path: string[]) {
  const document = await vscode.workspace.openTextDocument(uri)
  const range = keyRange(document, path)
  return range && { document, range, at: range.start.translate(0, 1) }
}

/** The references Shift+F12 on the key finds, in the references view. Returns them. */
async function findReferences(arg?: unknown) {
  const row = noRow(arg)
  const key = row && (await keyPosition(row.uri, row.path))
  if (!row || !key) return []
  const found =
    (await vscode.commands.executeCommand<vscode.Location[]>(
      "vscode.executeReferenceProvider",
      row.uri,
      key.at,
    )) ?? []
  if (!found.length) {
    void vscode.window.showInformationMessage(
      `Nothing references {${row.path.join(".")}}.`,
    )
    return found
  }
  // The peek opens the file as text: marked first, as Show in JSON is.
  TokenEditorProvider.preferText(row.uri)
  void vscode.commands.executeCommand(
    "editor.action.showReferences",
    row.uri,
    key.at,
    found,
  )
  return found
}

/**
 * The file as text beside the editor, with the key selected. Marked as
 * wanting text first, as Open as JSON is, or `tokenAtlas.defaultEditor`
 * would turn the tab straight back into the visual editor.
 */
async function showInJson(arg?: unknown) {
  const row = noRow(arg)
  const key = row && (await keyPosition(row.uri, row.path))
  if (!row || !key) return undefined
  TokenEditorProvider.preferText(row.uri)
  return vscode.window.showTextDocument(key.document, {
    viewColumn: vscode.ViewColumn.Beside,
    selection: key.range,
  })
}

/** Rename the row's token or group; `newName` is asked for unless given. */
async function renameNode(arg?: unknown, newName?: unknown) {
  const row = noRow(arg)
  if (!row) return
  // Trimmed, as the name cell trims; nothing left is no rename.
  const name = (
    typeof newName === "string"
      ? newName
      : await vscode.window.showInputBox({
          title: `Rename ${row.path.join(".")}`,
          value: row.path[row.path.length - 1],
        })
  )?.trim()
  if (!name || name === row.path[row.path.length - 1]) return
  await TokenEditorProvider.receive(row.uri, {
    type: "renameNode",
    path: row.path,
    newName: name,
  })
}

/** Asks before the menu deletes; replaceable by the integration tests. */
let confirmDelete = async (message: string): Promise<boolean> =>
  (await vscode.window.showWarningMessage(
    message,
    { modal: true },
    "Delete",
  )) === "Delete"

/** Not a public API: lets `test/` answer the menu's delete prompt and see its text. */
export function setMenuDeletePrompt(
  prompt: (message: string) => Promise<boolean>,
): () => void {
  const previous = confirmDelete
  confirmDelete = prompt
  return () => {
    confirmDelete = previous
  }
}

/** The keys the editor shows: the file's own plus what `$extends` gives it. */
function viewKeys(text: string, external: Map<string, TokenNode>): Set<string> {
  const model = parseTokens(text)
  expandExtends(model.root, external)
  return new Set(indexTokens(model).keys())
}

/** Whether one dotted key is the other or lies under it. */
const overlaps = (a: string, b: string): boolean =>
  a === b || a.startsWith(b + ".") || b.startsWith(a + ".")

/**
 * The key, `$extends` or `$ref`, that hands `key` to the view. With
 * `deleted`, it is the one on the extending group whose target is the
 * deleted key, lies under it or above it: the group whose source went away,
 * not the deepest extending group on the row's path (an inner `$ref` to
 * some other group still holds). Without, or when none matches, the deepest
 * one. Run per row, the keys are named together when more than one is at
 * work.
 */
function viaOf(root: GroupNode, keys: string[], deleted?: string): string {
  const vias = new Set<string>()
  for (const key of keys) {
    let deepest: string | undefined
    let lost: string | undefined
    let group: GroupNode | undefined = root
    for (const segment of key.split(".")) {
      const next: TokenNode | GroupNode | undefined = group.children.find(
        c => c.kind === "group" && c.name === segment,
      )
      if (!next || next.kind !== "group") break
      group = next
      if (!group.extends) continue
      deepest = group.extends.via
      const { via, target } = group.extends
      if (deleted && target && overlaps(target, deleted)) lost ??= via
    }
    const via = lost ?? deepest
    if (via) vias.add(via)
  }
  return [...vias].sort().join(" or ") || "$extends"
}

/** Whether the tolerant delete finds `path` in `text`; it throws on some broken text. */
function hasDelete(text: string, path: string[]): boolean {
  try {
    return computeDeleteEdits(text, path).length > 0
  } catch {
    return false
  }
}

/**
 * What the menu says before it deletes: `ask` is the prompt, `tell` why
 * there is nothing to delete. A row `$extends` (or a group-level `$ref`)
 * gives the view has no key in the file; a row in neither the file nor the
 * view (it changed under the panel) is gone. A group counts the rows that
 * leave the view: its own, inherited ones included, then those that groups
 * extending it lose with it. A row the extension still gives once the key
 * is gone stays, so it is not counted. A file that does not parse has no
 * model to count from, so the key the tolerant delete still finds gets the
 * token's prompt, as the menu's Delete did before it asked.
 */
function deletePrompt(
  text: string,
  path: string[],
  external: Map<string, TokenNode>,
): { ask: string } | { tell: string } {
  const key = path.join(".")
  const model = parseTokens(text)
  if (model.issues?.some(i => i.message.startsWith("JSON syntax error")))
    return hasDelete(text, path)
      ? { ask: `Delete "${key}"?` }
      : { tell: `"${key}" is not in this file, which does not parse.` }
  if (indexTokens(model).has(key)) return { ask: `Delete "${key}"?` }
  const before = viewKeys(text, external)
  const group = findGroup(model.root, path)
  if (!group) {
    const inView = [...before].some(k => k === key || k.startsWith(key + "."))
    return {
      tell: inView
        ? `"${key}" is inherited through ${viaOf(model.root, [key])} and has no key in this file to delete.`
        : `"${key}" is no longer in this file.`,
    }
  }
  const after = viewKeys(
    applyEdits(text, computeDeleteEdits(text, path)),
    external,
  )
  const gone = [...before].filter(k => !after.has(k))
  const own = gone.filter(k => k.startsWith(key + "."))
  const n = own.length
  const others = gone.filter(k => !own.includes(k))
  const more = others.length
  const also = more
    ? ` ${more} more ${more === 1 ? "row" : "rows"} that ${viaOf(model.root, others, key)} gives other groups ${more === 1 ? "leaves" : "leave"} the view with it.`
    : ""
  if (!n && countTokens(group)) return { ask: `Delete group "${key}"?${also}` }
  return {
    ask: `Delete group "${key}" and the ${n} ${n === 1 ? "token" : "tokens"} in it?${also}`,
  }
}

/**
 * Delete the row's token or group once the user confirms; the editor's own
 * delete then asks what the panel's does about a token still in use.
 */
async function deleteNode(arg?: unknown) {
  const row = noRow(arg)
  if (!row) return
  const document = await vscode.workspace.openTextDocument(row.uri)
  const said = deletePrompt(
    document.getText(),
    row.path,
    await externalIndexFor(row.uri),
  )
  if ("tell" in said) {
    void vscode.window.showInformationMessage(said.tell)
    return
  }
  if (!(await confirmDelete(said.ask))) return
  await TokenEditorProvider.receive(row.uri, {
    type: "deleteNode",
    path: row.path,
  })
}

export function registerEditorMenu(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("tokenAtlas.copyReference", copyReference),
    vscode.commands.registerCommand(
      "tokenAtlas.findReferences",
      findReferences,
    ),
    vscode.commands.registerCommand("tokenAtlas.showInJson", showInJson),
    vscode.commands.registerCommand("tokenAtlas.renameNode", renameNode),
    vscode.commands.registerCommand("tokenAtlas.deleteNode", deleteNode),
  )
}
