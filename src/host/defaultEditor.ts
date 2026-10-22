/**
 * `tokenAtlas.defaultEditor`: which editor a token file opens in.
 *
 * VS Code's own `workbench.editorAssociations` can only match filenames, and
 * Token Atlas's detection is content-based (invariant 3) — a `tokens.json` and a
 * `theme.json` are both token files, `package.json` is not. So the swap is
 * done here: a token document that opens as text is reopened in the visual
 * editor, unless the user asked for text on that file.
 */
import * as vscode from "vscode";
import { TokenEditorProvider } from "./tokenEditorProvider";
import { isTokenDocument } from "./workspaceIndex";

export function defaultsToVisual(uri?: vscode.Uri): boolean {
  return (
    vscode.workspace.getConfiguration("tokenAtlas", uri).get<string>("defaultEditor") === "visual"
  );
}

/**
 * Open `uri` in the visual editor, replacing the text tab it came from rather
 * than leaving two tabs for one file side by side. When a Token Atlas editor for
 * the file is already open, `openWith` reveals that one — so a second text tab
 * for an already-open file collapses back into it.
 */
export async function openInVisualEditor(uri: vscode.Uri): Promise<void> {
  const replaced = vscode.window.tabGroups.activeTabGroup.tabs.filter(
    (tab) =>
      tab.input instanceof vscode.TabInputText &&
      tab.input.uri.toString() === uri.toString() &&
      !tab.isDirty,
  );
  await vscode.commands.executeCommand("vscode.openWith", uri, TokenEditorProvider.viewType);
  if (replaced.length) await vscode.window.tabGroups.close(replaced);
}

export function registerDefaultEditor(context: vscode.ExtensionContext): void {
  const swap = async (uri: vscode.Uri) => {
    if (uri.scheme === "untitled") return;
    if (!defaultsToVisual(uri)) return;
    if (TokenEditorProvider.prefersText(uri)) return;
    // The tab can open before its document is loaded, and the DTCG sniff
    // reads the text — so ask for the document rather than looking it up.
    let doc: vscode.TextDocument;
    try {
      doc = await vscode.workspace.openTextDocument(uri);
    } catch {
      return;
    }
    if (!isTokenDocument(doc)) return;
    await openInVisualEditor(uri);
  };

  // Files already open when the window came up.
  if (vscode.window.activeTextEditor) void swap(vscode.window.activeTextEditor.document.uri);

  context.subscriptions.push(
    vscode.window.tabGroups.onDidChangeTabs(async (e) => {
      // "Reopen Editor With… → Text Editor" closes the Token Atlas tab as the
      // text tab opens. That is the user choosing JSON for this file, and
      // swapping it back would make the command impossible to use.
      const leftVisual = new Set(
        e.closed
          .filter(
            (t) =>
              t.input instanceof vscode.TabInputCustom &&
              t.input.viewType.startsWith("tokenAtlas."),
          )
          .map((t) => (t.input as vscode.TabInputCustom).uri.toString()),
      );
      for (const tab of e.opened) {
        if (!(tab.input instanceof vscode.TabInputText)) continue;
        const uri = tab.input.uri;
        if (leftVisual.has(uri.toString())) TokenEditorProvider.preferText(uri);
        else await swap(uri);
      }
      // Closing the file ends that choice: opening it again decides afresh.
      for (const tab of e.closed) {
        if (tab.input instanceof vscode.TabInputText) TokenEditorProvider.forgetText(tab.input.uri);
      }
    }),
  );
}
