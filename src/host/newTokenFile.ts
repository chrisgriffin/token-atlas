/**
 * "New Token File": ask for a name, write an empty `<name>.tokens.json`, and
 * open it in the visual editor so a token set can be built from nothing.
 */
import * as vscode from "vscode"
import { tokenFileName } from "../core"
import { openInVisualEditor } from "./defaultEditor"

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri)
    return true
  } catch {
    return false
  }
}

/** The folder to create in: the only one, the one picked, or none (save dialog). */
async function pickFolder(): Promise<vscode.Uri | null | undefined> {
  const folders = vscode.workspace.workspaceFolders ?? []
  if (folders.length === 0) return null
  if (folders.length === 1) return folders[0].uri
  const picked = await vscode.window.showWorkspaceFolderPick({
    placeHolder: "Create the token file in which folder?",
  })
  return picked?.uri
}

/**
 * Creates the file and returns its URI, or undefined when cancelled or the
 * name is taken. `name` skips the prompt (tests, other commands); an existing
 * file is never overwritten either way.
 */
export async function newTokenFile(
  name?: string,
): Promise<vscode.Uri | undefined> {
  const folder = await pickFolder()
  if (folder === undefined) return undefined

  let uri: vscode.Uri | undefined
  if (folder === null) {
    uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(tokenFileNameOrDefault(name)),
      filters: { "Design tokens": ["tokens.json"] },
      saveLabel: "Create",
    })
    if (!uri) return undefined
    const valid = tokenFileName(uri.path.slice(uri.path.lastIndexOf("/") + 1))
    if ("error" in valid) {
      void vscode.window.showErrorMessage(valid.error)
      return undefined
    }
    uri = vscode.Uri.joinPath(uri, "..", valid.name)
  } else {
    const input =
      name ??
      (await vscode.window.showInputBox({
        title: "New Token File",
        prompt: "Saved as <name>.tokens.json in the workspace folder",
        value: "tokens",
        validateInput: async value => {
          const valid = tokenFileName(value)
          if ("error" in valid) return valid.error
          return (await exists(vscode.Uri.joinPath(folder, valid.name)))
            ? `${valid.name} already exists.`
            : undefined
        },
      }))
    if (input === undefined) return undefined
    const valid = tokenFileName(input)
    if ("error" in valid) {
      void vscode.window.showErrorMessage(valid.error)
      return undefined
    }
    uri = vscode.Uri.joinPath(folder, valid.name)
  }

  // Checked again at write time: the prompt's check can be stale, and a
  // save dialog's "Replace" must not replace anything.
  if (await exists(uri)) {
    void vscode.window.showErrorMessage(
      `${vscode.workspace.asRelativePath(uri)} already exists; nothing was overwritten.`,
    )
    return undefined
  }
  await vscode.workspace.fs.writeFile(uri, Buffer.from("{}\n", "utf8"))
  // Whatever tokenAtlas.defaultEditor says: an empty file is only useful visually.
  await openInVisualEditor(uri)
  return uri
}

function tokenFileNameOrDefault(name: string | undefined): string {
  const valid = tokenFileName(name ?? "tokens")
  return "name" in valid ? valid.name : "tokens.tokens.json"
}

export function registerNewTokenFile(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "tokenAtlas.newTokenFile",
      (name?: unknown) =>
        newTokenFile(typeof name === "string" ? name : undefined),
    ),
  )
}
