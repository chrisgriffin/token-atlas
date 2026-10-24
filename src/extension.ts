import * as vscode from "vscode";
import { TokenEditorProvider } from "./host/tokenEditorProvider";
import { registerDiagnostics } from "./host/diagnostics";
import { registerColorProvider } from "./host/colorProvider";
import { registerLanguageFeatures } from "./host/languageFeatures";
import { registerExportFeatures } from "./host/exportFeatures";
import { registerCodeUsageInvalidation } from "./host/codeUsages";
import { codeSwatches, registerCodeColorSwatches } from "./host/codeColorSwatches";
import { registerHardcodedValues } from "./host/hardcodedValues";
import { registerRename } from "./host/rename";
import { registerTokenTree, type TokenTreeHandle } from "./host/tokenTree";
import { registerActiveSet } from "./host/activeSet";
import { openInVisualEditor, registerDefaultEditor } from "./host/defaultEditor";
import { isTokenDocument, registerIndexInvalidation } from "./host/workspaceIndex";
import { registerNewTokenFile } from "./host/newTokenFile";
import { registerLegacyFix } from "./host/legacyFix";
import { registerDeprecation, setRemovalPrompt } from "./host/deprecate";

/**
 * Not a public API. Returned only so `test/integration/` can see the Tokens
 * panel's contents and visibility, the group a visual editor is scoped to,
 * and a way to send the visual editor an intent the way its webview would,
 * none of which VS Code exposes any other way.
 */
export interface TokenAtlasTestHooks {
  tokenTree: TokenTreeHandle;
  tokenEditor: {
    receive: typeof TokenEditorProvider.receive;
    scopeOf: typeof TokenEditorProvider.scopeOf;
    /** The saved table column widths every editor opens with. */
    columnWidths: () => unknown;
  };
  /** The color swatches last drawn in a code document. */
  codeSwatches: typeof codeSwatches;
  /** Answers the prompt before a still-used deprecated token is removed. */
  setRemovalPrompt: typeof setRemovalPrompt;
}

export function activate(context: vscode.ExtensionContext): TokenAtlasTestHooks {
  // Text-editor language features (the primary experience).
  registerLanguageFeatures(context);
  // Hovers + go-to-definition on exported identifiers in CSS/Sass/Less/JS/TS.
  registerExportFeatures(context);
  registerHardcodedValues(context);
  // F2 rename: key + every {reference} across the workspace in one edit.
  registerRename(context);
  registerIndexInvalidation(context);
  // Token usages in exported code, for Find References and the unused hint.
  registerCodeUsageInvalidation(context);
  // Swatches beside color tokens used in that code.
  registerCodeColorSwatches(context);
  // Which files a {reference} resolves against, when several define the same
  // paths (multi-brand, multi-theme).
  registerActiveSet(context);
  registerDiagnostics(context);
  // Lightbulb: rewrite a pre-2025.10 "#hex" / "16px" / "200ms" $value.
  registerLegacyFix(context);
  // Carry a deprecation out: deprecate with a replacement, move each use by
  // quick fix, list what is left, and warn before removing a used token.
  registerDeprecation(context);
  // "Tokens" tree in its own activity-bar container: navigation without
  // spending editor width.
  const tokenTree = registerTokenTree(context);
  registerColorProvider(context);
  // Visual editor — opt-in via "Reopen Editor With… → Token Atlas", or by
  // default when `tokenAtlas.defaultEditor` says so.
  context.subscriptions.push(TokenEditorProvider.register(context));
  registerDefaultEditor(context);

  // Context key behind the editor-title "open in Token Atlas" button: true only
  // while the active editor is a token document (same check every provider uses).
  const updateContext = (editor = vscode.window.activeTextEditor) => {
    void vscode.commands.executeCommand(
      "setContext",
      "tokenAtlas.isTokenDocument",
      editor !== undefined && isTokenDocument(editor.document),
    );
  };
  updateContext();
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(updateContext),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document === vscode.window.activeTextEditor?.document) updateContext();
    }),
  );

  context.subscriptions.push(
    // The editor-title button passes the file of the editor it sits on, which
    // with split editors need not be the active one; the palette passes none.
    vscode.commands.registerCommand("tokenAtlas.openCurrent", async (target?: vscode.Uri) => {
      const uri =
        target instanceof vscode.Uri ? target : vscode.window.activeTextEditor?.document.uri;
      if (!uri) {
        void vscode.window.showInformationMessage(
          "Open a JSON token file first, then run this command.",
        );
        return;
      }
      await openInVisualEditor(uri);
    }),
  );

  registerNewTokenFile(context);

  return {
    tokenTree,
    tokenEditor: {
      receive: TokenEditorProvider.receive,
      scopeOf: TokenEditorProvider.scopeOf,
      columnWidths: () => context.globalState.get(TokenEditorProvider.columnWidthsKey),
    },
    codeSwatches,
    setRemovalPrompt,
  };
}

export function deactivate(): void {
  /* nothing to clean up */
}
