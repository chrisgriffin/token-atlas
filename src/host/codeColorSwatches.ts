/**
 * A color swatch before each use of a color token in CSS, Sass, Less, JS and
 * TS (`var(--color-brand-primary)`, `$color-brand-primary`,
 * `tokens.color.brand.primary`), in the color the token resolves to in the
 * active set. Matching is core/exportNames.ts `tokenUsages`, the same matcher
 * hover uses, so a swatch appears exactly where a hover names a color token.
 *
 * A read-only decoration rather than a DocumentColorProvider: VS Code's
 * built-in CSS provider already answers for these documents, and a provider's
 * swatch opens a picker whose edit would land in the code file, not the token.
 * `tokenAtlas.codeColorSwatches` turns it off.
 */
import * as vscode from "vscode";
import { tokenUsages } from "../core";
import { toHex } from "../core/color";
import { LANGUAGES } from "./exportFeatures";
import { buildWorkspaceIndex, onDidInvalidateWorkspaceIndex } from "./workspaceIndex";

/** What each document was last decorated with, for the integration tests: VS Code cannot read decorations back. */
const applied = new Map<string, Array<{ range: vscode.Range; color: string }>>();

export function codeSwatches(uri: vscode.Uri): Array<{ range: vscode.Range; color: string }> {
  return applied.get(uri.toString()) ?? [];
}

function enabled(): boolean {
  return vscode.workspace.getConfiguration("tokenAtlas").get<boolean>("codeColorSwatches") ?? true;
}

export function registerCodeColorSwatches(context: vscode.ExtensionContext): void {
  const swatch = vscode.window.createTextEditorDecorationType({
    before: {
      contentText: " ",
      width: "0.8em",
      height: "0.8em",
      margin: "0.1em 0.2em 0 0.2em",
      border: "0.1em solid",
      borderColor: new vscode.ThemeColor("editorWidget.border"),
    },
  });

  const refresh = async (editor: vscode.TextEditor) => {
    const { document } = editor;
    if (!LANGUAGES.includes(document.languageId)) return;
    const ws = enabled() ? await buildWorkspaceIndex() : undefined;
    const colorOf = (key: string) => {
      const token = ws?.get(key)?.token;
      if (!token || (token.resolvedType ?? token.type) !== "color") return undefined;
      return toHex(token.resolvedValue ?? token.value);
    };
    const found =
      ws && ws.size > 0
        ? tokenUsages(document.getText(), ws.keys(), colorOf, document.languageId).map((u) => ({
            range: new vscode.Range(u.line, u.character, u.line, u.character + u.length),
            color: u.value,
          }))
        : [];
    editor.setDecorations(
      swatch,
      found.map(({ range, color }) => ({
        range,
        renderOptions: { before: { backgroundColor: color } },
      })),
    );
    applied.set(document.uri.toString(), found);
  };

  const refreshAll = () => {
    for (const editor of vscode.window.visibleTextEditors) void refresh(editor);
  };

  const timers = new Map<string, NodeJS.Timeout>();
  const schedule = (document: vscode.TextDocument) => {
    const key = document.uri.toString();
    clearTimeout(timers.get(key));
    timers.set(
      key,
      setTimeout(() => {
        for (const editor of vscode.window.visibleTextEditors) {
          if (editor.document === document) void refresh(editor);
        }
      }, 250),
    );
  };

  refreshAll();
  context.subscriptions.push(
    swatch,
    { dispose: () => timers.forEach(clearTimeout) },
    vscode.window.onDidChangeVisibleTextEditors(refreshAll),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (LANGUAGES.includes(e.document.languageId)) schedule(e.document);
    }),
    vscode.workspace.onDidCloseTextDocument((doc) => applied.delete(doc.uri.toString())),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("tokenAtlas")) refreshAll();
    }),
    // Token edits, writes on disk and active-set changes all invalidate the index.
    onDidInvalidateWorkspaceIndex(refreshAll),
  );
}
