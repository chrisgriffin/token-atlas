/**
 * The lightbulb on a legacy `$value` ("#ff0000", "16px", "200ms"): convert it
 * to its DTCG 2025.10 object, or every one in the file at once. The edits are
 * `src/core/legacy.ts`'s, applied as ranged `WorkspaceEdit`s (invariant 1).
 */
import * as vscode from "vscode";
import { computeLegacyFixes, type LegacyFix } from "../core";
import { TOKEN_SELECTOR, isTokenDocument } from "./workspaceIndex";

class LegacyFixProvider implements vscode.CodeActionProvider {
  static readonly kinds = [vscode.CodeActionKind.QuickFix];

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    if (!isTokenDocument(document)) return [];
    const fixes = computeLegacyFixes(document.getText());
    const span = (f: LegacyFix) =>
      new vscode.Range(
        document.positionAt(f.span.offset),
        document.positionAt(f.span.offset + f.span.length),
      );
    const actions = fixes
      .filter((f) => span(f).intersection(range))
      .map((f) => {
        const action = new vscode.CodeAction(
          "Convert to DTCG 2025.10",
          vscode.CodeActionKind.QuickFix,
        );
        action.edit = editFor(document, [f]);
        action.diagnostics = context.diagnostics.filter(
          (d) => d.source === "Token Atlas" && span(f).intersection(d.range),
        );
        // Not isPreferred: Auto Fix and a "quickfix" codeActionsOnSave would
        // then apply it unasked, and Chris wants this strictly opt-in (#387).
        return action;
      });
    if (actions.length && fixes.length > 1) {
      const all = new vscode.CodeAction(
        `Convert all ${fixes.length} legacy values in this file to DTCG 2025.10`,
        vscode.CodeActionKind.QuickFix,
      );
      all.edit = editFor(document, fixes);
      actions.push(all);
    }
    return actions;
  }
}

function editFor(document: vscode.TextDocument, fixes: LegacyFix[]): vscode.WorkspaceEdit {
  const edit = new vscode.WorkspaceEdit();
  for (const { edit: e } of fixes) {
    const start = document.positionAt(e.offset);
    edit.replace(
      document.uri,
      new vscode.Range(start, document.positionAt(e.offset + e.length)),
      e.content,
    );
  }
  return edit;
}

export function registerLegacyFix(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(TOKEN_SELECTOR, new LegacyFixProvider(), {
      providedCodeActionKinds: LegacyFixProvider.kinds,
    }),
  );
}
