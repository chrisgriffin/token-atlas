/**
 * Token hovers, go-to-definition and completion inside *exported* code — CSS,
 * Sass, Less, JS, TS. The identifier under the cursor (`--color-brand-primary`,
 * `$color-brand-primary`, `colorBrandPrimary`, `tokens.color.brand.primary`)
 * is matched back to a token path in the workspace index (see
 * core/exportNames.ts); a miss returns nothing, so ordinary CSS/JS stays quiet.
 * In CSS, Sass and Less, each `var(--token)` also gets an inlay hint with the
 * value the token resolves to, labelled as the JSON hint is.
 */
import * as vscode from "vscode";
import {
  cssVarUsages,
  describeValue,
  EXPORT_IDENTIFIER,
  exportCompletionContext,
  exportName,
  findTokenForIdentifier,
  inlayValue,
  isReference,
  learnPrefix,
  memberCompletions,
  tokenMatcher,
  type TokenNode,
} from "../core";
import { toHex } from "../core/color";
import { buildTokenHover } from "./languageFeatures";
import {
  buildWorkspaceIndex,
  definitionLocation,
  onDidInvalidateWorkspaceIndex,
  type IndexedToken,
} from "./workspaceIndex";

export const STYLESHEET_LANGUAGES = ["css", "scss", "sass", "less"];

export const LANGUAGES = [
  ...STYLESHEET_LANGUAGES,
  "javascript",
  "javascriptreact",
  "typescript",
  "typescriptreact",
];

// No scheme filter — see TOKEN_SELECTOR in workspaceIndex.ts.
const SELECTOR: vscode.DocumentSelector = LANGUAGES.map((language) => ({ language }));
const STYLESHEET_SELECTOR: vscode.DocumentSelector = STYLESHEET_LANGUAGES.map((language) => ({
  language,
}));

const NO_LOCAL = new Map<string, TokenNode>();

async function tokenAt(
  document: vscode.TextDocument,
  position: vscode.Position,
  cancel: vscode.CancellationToken,
): Promise<{ hit: IndexedToken; range: vscode.Range } | undefined> {
  const range = document.getWordRangeAtPosition(position, EXPORT_IDENTIFIER);
  if (!range) return;
  const ws = await buildWorkspaceIndex();
  if (cancel.isCancellationRequested || ws.size === 0) return;
  const key = findTokenForIdentifier(document.getText(range), ws.keys());
  const hit = key ? ws.get(key) : undefined;
  return hit ? { hit, range } : undefined;
}

class ExportHoverProvider implements vscode.HoverProvider {
  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    cancel: vscode.CancellationToken,
  ) {
    const found = await tokenAt(document, position, cancel);
    if (!found) return;
    const ws = await buildWorkspaceIndex();
    if (cancel.isCancellationRequested) return;
    return buildTokenHover(found.hit.token, NO_LOCAL, ws, undefined, found.range, found.hit.uri);
  }
}

class ExportDefinitionProvider implements vscode.DefinitionProvider {
  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    cancel: vscode.CancellationToken,
  ) {
    const found = await tokenAt(document, position, cancel);
    return found ? definitionLocation(found.hit) : undefined;
  }
}

/**
 * Token names as you type them: `--` / `$` / `@` offers every token in the
 * file's own export spelling (prefix learnt from the names already there), and
 * `tokens.color.` in JS/TS offers the paths under that group.
 */
class ExportCompletionProvider implements vscode.CompletionItemProvider {
  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    cancel: vscode.CancellationToken,
  ) {
    const line = document.lineAt(position.line).text.slice(0, position.character);
    const ctx = exportCompletionContext(line, document.languageId);
    if (!ctx) return;
    const ws = await buildWorkspaceIndex();
    if (cancel.isCancellationRequested || ws.size === 0) return;

    let entries: { key: string; insert: string }[];
    if (ctx.kind === "member") {
      entries = memberCompletions(ctx.chain, ws.keys());
    } else {
      const prefix = learnPrefix(document.getText(), ctx.sigil, ws.keys());
      entries = [...ws.keys()].map((key) => ({ key, insert: exportName(key, ctx.sigil, prefix) }));
    }
    const range = new vscode.Range(position.line, ctx.start, position.line, position.character);
    return entries.map(({ key, insert }) => {
      const token = ws.get(key)!.token;
      const type = token.resolvedType ?? token.type;
      const shown = token.resolvedValue ?? token.value;
      const hex = type === "color" ? toHex(shown) : null;
      const item = new vscode.CompletionItem(
        { label: insert, description: [type, key].filter(Boolean).join(" · ") },
        hex ? vscode.CompletionItemKind.Color : vscode.CompletionItemKind.Variable,
      );
      item.detail = describeValue(shown);
      // The suggest widget draws a swatch for Color items whose documentation is #rrggbb.
      if (hex) item.documentation = hex.slice(0, 7);
      item.insertText = insert;
      item.filterText = insert;
      item.range = range;
      return item;
    });
  }
}

/**
 * `= #0055ff` after each `var(--token)` in a stylesheet: the value the token
 * resolves to in the active set, labelled by core/inlay.ts as the JSON hint
 * is. A name that is no token, or a token that does not resolve, gets nothing.
 * The tooltip is the hover card, built only for the hint you point at.
 */
class CodeInlayHintsProvider implements vscode.InlayHintsProvider {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeInlayHints = this.changed.event;
  private readonly tooltips = new WeakMap<vscode.InlayHint, () => vscode.MarkdownString>();

  refresh(): void {
    this.changed.fire();
  }

  dispose(): void {
    this.changed.dispose();
  }

  async provideInlayHints(
    document: vscode.TextDocument,
    range: vscode.Range,
    cancel: vscode.CancellationToken,
  ): Promise<vscode.InlayHint[]> {
    if (!(vscode.workspace.getConfiguration("tokenAtlas").get<boolean>("inlayHints") ?? true)) {
      return [];
    }
    const usages = cssVarUsages(document.getText(), document.languageId);
    if (!usages.length) return [];
    const ws = await buildWorkspaceIndex();
    if (cancel.isCancellationRequested || ws.size === 0) return [];
    const match = tokenMatcher(ws.keys());
    const hints: vscode.InlayHint[] = [];
    for (const { name, end } of usages) {
      const position = document.positionAt(end);
      if (!range.contains(position)) continue;
      const key = match(name);
      const hit = key ? ws.get(key) : undefined;
      if (!hit) continue;
      const value = hit.token.resolvedValue ?? hit.token.value;
      if (isReference(value)) continue; // dangling or a cycle
      const hint = new vscode.InlayHint(
        position,
        `= ${inlayValue(value, hit.token.resolvedType ?? hit.token.type)}`,
      );
      hint.paddingLeft = true;
      this.tooltips.set(
        hint,
        () =>
          buildTokenHover(hit.token, NO_LOCAL, ws, undefined, undefined, hit.uri)
            .contents[0] as vscode.MarkdownString,
      );
      hints.push(hint);
    }
    return hints;
  }

  resolveInlayHint(hint: vscode.InlayHint): vscode.InlayHint {
    const tooltip = this.tooltips.get(hint);
    if (tooltip) hint.tooltip = tooltip();
    return hint;
  }
}

export function registerExportFeatures(context: vscode.ExtensionContext): void {
  const inlayHints = new CodeInlayHintsProvider();
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(SELECTOR, new ExportHoverProvider()),
    vscode.languages.registerDefinitionProvider(SELECTOR, new ExportDefinitionProvider()),
    vscode.languages.registerCompletionItemProvider(
      SELECTOR,
      new ExportCompletionProvider(),
      "-",
      "$",
      "@",
      ".",
    ),
    vscode.languages.registerInlayHintsProvider(STYLESHEET_SELECTOR, inlayHints),
    inlayHints,
    // Token edits, writes on disk and active-set changes all invalidate the index.
    onDidInvalidateWorkspaceIndex(() => inlayHints.refresh()),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("tokenAtlas")) inlayHints.refresh();
    }),
  );
}
