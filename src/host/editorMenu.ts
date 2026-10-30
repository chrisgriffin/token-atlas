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
import { countTokens, indexTokens, parseTokens, type GroupNode } from "../core"
import { TokenEditorProvider } from "./tokenEditorProvider"
import { keyRange, rowTarget } from "./workspaceIndex"

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

/** What the prompt asks: a group says how many tokens go with it. */
function deletePrompt(text: string, path: string[]): string {
  const key = path.join(".")
  const model = parseTokens(text)
  if (indexTokens(model).has(key)) return `Delete "${key}"?`
  let group: GroupNode | undefined = model.root
  for (const name of path)
    group = group?.children.find(
      (c): c is GroupNode => c.kind === "group" && c.name === name,
    )
  const n = group ? countTokens(group) : 0
  return `Delete group "${key}" and the ${n} ${n === 1 ? "token" : "tokens"} in it?`
}

/**
 * Delete the row's token or group once the user confirms; the editor's own
 * delete then asks what the panel's does about a token still in use.
 */
async function deleteNode(arg?: unknown) {
  const row = noRow(arg)
  if (!row) return
  const document = await vscode.workspace.openTextDocument(row.uri)
  if (!(await confirmDelete(deletePrompt(document.getText(), row.path)))) return
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
