/**
 * `tokenAtlas.hardcodedValues`: in CSS, SCSS, Sass and Less, a colour or
 * px/rem literal equal to a token in the active set is reported, and the
 * lightbulb replaces it with the token's exported name (core/hardcoded.ts).
 * Off by default, and silent in a workspace without token files, so ordinary
 * stylesheets are never touched unless asked (CLAUDE.md invariant 3).
 */
import * as vscode from "vscode";
import {
  findLiterals,
  indexTokenValues,
  matchingTokens,
  learnPrefix,
  replacementFor,
  sigilFor,
  type TokenValueIndex,
} from "../core";
import { STYLESHEET_LANGUAGES as LANGUAGES } from "./exportFeatures";
import { buildWorkspaceIndex, onDidInvalidateWorkspaceIndex } from "./workspaceIndex";

const SELECTOR: vscode.DocumentSelector = LANGUAGES.map((language) => ({ language }));
const CODE = "hardcoded-value";

/** What each reported range matched at the last refresh, and the file's export prefix, for the quick fix. */
const found = new Map<
  string,
  { prefix: string; entries: Array<{ range: vscode.Range; keys: string[] }> }
>();

function severity(): vscode.DiagnosticSeverity | undefined {
  const setting = vscode.workspace.getConfiguration("tokenAtlas").get<string>("hardcodedValues");
  if (setting === "warning") return vscode.DiagnosticSeverity.Warning;
  if (setting === "hint") return vscode.DiagnosticSeverity.Hint;
  return undefined;
}

let cached: { from: unknown; rootPx: number; index: TokenValueIndex } | undefined;

/** The active set's values, rebuilt only when the workspace index or root size changes. */
async function valueIndex(): Promise<TokenValueIndex | undefined> {
  const ws = await buildWorkspaceIndex();
  if (ws.size === 0) return undefined;
  const rootPx = vscode.workspace.getConfiguration("tokenAtlas").get<number>("rootFontSize") ?? 16;
  if (cached?.from !== ws || cached.rootPx !== rootPx) {
    const tokens = [...ws].map(([key, hit]) => [key, hit.token] as [string, typeof hit.token]);
    cached = { from: ws, rootPx, index: indexTokenValues(tokens, rootPx) };
  }
  return cached.index;
}

export function registerHardcodedValues(context: vscode.ExtensionContext): void {
  const collection = vscode.languages.createDiagnosticCollection("token-atlas-hardcoded");
  context.subscriptions.push(collection);

  const clear = (uri: vscode.Uri) => {
    collection.delete(uri);
    found.delete(uri.toString());
  };

  const refresh = async (document: vscode.TextDocument) => {
    if (!LANGUAGES.includes(document.languageId)) return;
    const level = severity();
    const index = level === undefined ? undefined : await valueIndex();
    if (level === undefined || !index) return clear(document.uri);
    const text = document.getText();
    const entries: Array<{ range: vscode.Range; keys: string[] }> = [];
    const diagnostics: vscode.Diagnostic[] = [];
    for (const literal of findLiterals(text, document.languageId)) {
      const keys = matchingTokens(literal, index);
      if (!keys.length) continue;
      const range = new vscode.Range(
        document.positionAt(literal.start),
        document.positionAt(literal.end),
      );
      const d = new vscode.Diagnostic(
        range,
        keys.length === 1
          ? `${literal.text} matches token ${keys[0]}`
          : `${literal.text} matches ${keys.length} tokens: ${keys.join(", ")}`,
        level,
      );
      d.source = "Token Atlas";
      d.code = CODE;
      diagnostics.push(d);
      entries.push({ range, keys });
    }
    const prefix = entries.length
      ? learnPrefix(text, sigilFor(document.languageId), (await buildWorkspaceIndex()).keys())
      : "";
    // Fixes before diagnostics: a lightbulb asked for between the two would
    // otherwise find the diagnostic but no fix for it.
    found.set(document.uri.toString(), { prefix, entries });
    collection.set(document.uri, diagnostics);
  };

  const refreshAll = () => {
    for (const doc of vscode.workspace.textDocuments) void refresh(doc);
  };

  const timers = new Map<string, NodeJS.Timeout>();
  const schedule = (doc: vscode.TextDocument) => {
    const key = doc.uri.toString();
    clearTimeout(timers.get(key));
    timers.set(
      key,
      setTimeout(() => void refresh(doc), 250),
    );
  };

  refreshAll();
  context.subscriptions.push(
    { dispose: () => timers.forEach(clearTimeout) },
    vscode.workspace.onDidOpenTextDocument((doc) => void refresh(doc)),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (LANGUAGES.includes(e.document.languageId)) schedule(e.document);
    }),
    vscode.workspace.onDidCloseTextDocument((doc) => clear(doc.uri)),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("tokenAtlas")) refreshAll();
    }),
    onDidInvalidateWorkspaceIndex(() => refreshAll()),
    vscode.languages.registerCodeActionsProvider(SELECTOR, new ReplaceWithToken(), {
      providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
    }),
  );
}

class ReplaceWithToken implements vscode.CodeActionProvider {
  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    const { prefix = "", entries = [] } = found.get(document.uri.toString()) ?? {};
    const actions: vscode.CodeAction[] = [];
    for (const diagnostic of context.diagnostics) {
      if (diagnostic.code !== CODE) continue;
      const entry = entries.find((e) => e.range.isEqual(diagnostic.range));
      for (const key of entry?.keys ?? []) {
        const name = replacementFor(key, document.languageId, prefix);
        const action = new vscode.CodeAction(
          `Replace with ${name}`,
          vscode.CodeActionKind.QuickFix,
        );
        action.edit = new vscode.WorkspaceEdit();
        action.edit.replace(document.uri, diagnostic.range, name);
        action.diagnostics = [diagnostic];
        // Never isPreferred: Auto Fix would then apply it unasked (Chris, #387).
        actions.push(action);
      }
    }
    return actions;
  }
}
