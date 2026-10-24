/**
 * Carrying a deprecation out (spec 015), the write side of what diagnostics.ts
 * reads: deprecate a token with a reason and a replacement, move one use at a
 * time onto that replacement with a quick fix, list every use that is left,
 * and say how many remain before removing the token.
 *
 * The replacement is the first `{reference}` in the `$deprecated` reason
 * (docs/adr/ADR-003-deprecation-replacement.md). Every use offered or counted
 * here is one the existing readers already report — `deprecatedReferences`
 * in token files, `tokenUsages` (as the strike-through does) in code — so no
 * third matcher decides what counts. A quick fix is per use on purpose: a
 * replacement need not be value-identical, so nothing here sweeps a workspace.
 */
import * as vscode from "vscode";
import { findNodeAtLocation, getLocation, parseTree, type Node } from "jsonc-parser";
import {
  aliasCandidates,
  computeDeleteEdits,
  computeDeprecateEdits,
  computeRetargetEdits,
  deprecatedReferences,
  deprecation,
  deprecationReplacement,
  indexTokens,
  inlineSources,
  isGeneratedCode,
  parseTokens,
  retargetIdentifier,
  tokenUsages,
  type DeprecatedReference,
  type Edit,
  type Fragment,
  type TokenNode,
} from "../core";
import { codeUsages } from "./codeUsages";
import { LANGUAGES } from "./exportFeatures";
import {
  TOKEN_SELECTOR,
  buildWorkspaceIndex,
  findResolverFiles,
  findTokenFiles,
  isResolverDocument,
  isTokenDocument,
  keyRange,
  localScopeFor,
  type IndexedToken,
} from "./workspaceIndex";

/** Every token in the workspace index, except those from `uri` — as diagnostics resolves. */
function externalFor(ws: Map<string, IndexedToken>, uri?: vscode.Uri): Map<string, TokenNode> {
  const here = uri?.toString();
  const out = new Map<string, TokenNode>();
  for (const [key, hit] of ws) if (hit.uri.toString() !== here) out.set(key, hit.token);
  return out;
}

/** The reference string at `path`, quotes excluded: where diagnostics strikes it through. */
function stringRange(
  document: vscode.TextDocument,
  root: Node | undefined,
  path: Array<string | number>,
  base = 0,
): vscode.Range | undefined {
  const node = root && findNodeAtLocation(root, path);
  if (!node) return undefined;
  return new vscode.Range(
    document.positionAt(base + node.offset + 1),
    document.positionAt(base + node.offset + node.length - 1),
  );
}

/** The fragments of `document` that hold tokens: the whole file, or a resolver's inline sources. */
function fragmentsOf(document: vscode.TextDocument): Fragment[] {
  if (isTokenDocument(document)) return [{ text: document.getText(), path: [], offset: 0 }];
  return isResolverDocument(document) ? inlineSources(document.getText()) : [];
}

/**
 * The deprecated uses in one token document or resolver: each reference
 * `deprecatedReferences` reports, with its range in `document`. A whole token
 * file resolves against the index minus itself and its active-set scope, as
 * its diagnostics do; an inline resolver source against the whole index.
 */
function usesIn(
  document: vscode.TextDocument,
  ws: Map<string, IndexedToken>,
): Array<{ ref: DeprecatedReference; range: vscode.Range; fragment: Fragment }> {
  const out: Array<{ ref: DeprecatedReference; range: vscode.Range; fragment: Fragment }> = [];
  const whole = isTokenDocument(document);
  const external = externalFor(ws, whole ? document.uri : undefined);
  const scope = whole ? localScopeFor(document.uri) : undefined;
  for (const fragment of fragmentsOf(document)) {
    const root = parseTree(fragment.text);
    for (const ref of deprecatedReferences(parseTokens(fragment.text), external, scope)) {
      const range = stringRange(document, root, ref.path, fragment.offset);
      if (range) out.push({ ref, range, fragment });
    }
  }
  return out;
}

/** Whether `key` is deprecated in the workspace index — what a code use is judged against. */
function deprecatedInIndex(ws: Map<string, IndexedToken>, key: string): boolean {
  const token = ws.get(key)?.token;
  return token !== undefined && deprecation(token) !== undefined;
}

/**
 * Every remaining use of the deprecated token `key` across the workspace: each
 * `{reference}` or `$ref` to it in a token file or a resolver's inline tokens,
 * and each use of its exported name in CSS, Sass, Less, JS or TS. Read from
 * the workspace's files rather than its open editors, so a file nobody has
 * opened counts. A declaration in exported code defines the name, and a
 * comment mentions it; neither is a use. The list and the removal guard both
 * count with this, so they cannot disagree about "unused".
 */
export async function deprecatedUses(key: string): Promise<vscode.Location[]> {
  const ws = await buildWorkspaceIndex();
  const out: vscode.Location[] = [];
  const files = [...(await findTokenFiles()), ...(await findResolverFiles())];
  for (const { uri } of files) {
    let doc: vscode.TextDocument;
    try {
      doc = await vscode.workspace.openTextDocument(uri);
    } catch {
      continue; // unreadable file — skip
    }
    for (const { ref, range } of usesIn(doc, ws)) {
      if (ref.reference === key) out.push(new vscode.Location(uri, range));
    }
  }
  if (!deprecatedInIndex(ws, key)) return out;
  // Code: the files Find References has a use in, each confirmed by the
  // reader the strike-through uses, which skips comments and declarations.
  const keys = [...ws.keys()];
  const byFile = new Map<string, vscode.Uri>();
  for (const usage of (await codeUsages(keys)).get(key) ?? []) {
    if (!usage.declaration) byFile.set(usage.location.uri.toString(), usage.location.uri);
  }
  for (const uri of byFile.values()) {
    let doc: vscode.TextDocument;
    try {
      doc = await vscode.workspace.openTextDocument(uri);
    } catch {
      continue;
    }
    const pick = (k: string) => (k === key ? true : undefined);
    for (const u of tokenUsages(doc.getText(), keys, pick, doc.languageId)) {
      out.push(
        new vscode.Location(
          uri,
          new vscode.Range(u.line, u.character, u.line, u.character + u.length),
        ),
      );
    }
  }
  return out;
}

/** The token whose key (or anything inside it) is at `position`, with the fragment it is in. */
function tokenAt(
  document: vscode.TextDocument,
  position: vscode.Position,
): { path: string[]; fragment: Fragment } | undefined {
  const offset = document.offsetAt(position);
  const fragment = fragmentsOf(document).find(
    (f) => offset >= f.offset && offset <= f.offset + f.text.length,
  );
  if (!fragment) return undefined;
  const at = getLocation(document.getText(), offset).path.slice(fragment.path.length);
  const names: string[] = [];
  for (const seg of at) {
    if (typeof seg !== "string" || seg.startsWith("$")) break;
    names.push(seg);
  }
  const local = indexTokens(parseTokens(fragment.text));
  for (let i = names.length; i > 0; i--) {
    if (local.has(names.slice(0, i).join("."))) return { path: names.slice(0, i), fragment };
  }
  return undefined;
}

/** Where a deprecate or remove command acts: its arguments, else the token under the cursor. */
async function targetOf(
  uri: unknown,
  path: unknown,
): Promise<{ document: vscode.TextDocument; path: string[]; fragment: Fragment } | undefined> {
  if (uri instanceof vscode.Uri && Array.isArray(path)) {
    const document = await vscode.workspace.openTextDocument(uri);
    const fragment = fragmentsOf(document).find((f) =>
      indexTokens(parseTokens(f.text)).has(path.join(".")),
    );
    return fragment ? { document, path: path.map(String), fragment } : undefined;
  }
  const editor = vscode.window.activeTextEditor;
  const found = editor && tokenAt(editor.document, editor.selection.active);
  return found && editor ? { document: editor.document, ...found } : undefined;
}

function applyIn(
  edit: vscode.WorkspaceEdit,
  document: vscode.TextDocument,
  edits: Edit[],
  base = 0,
) {
  for (const e of edits) {
    edit.replace(
      document.uri,
      new vscode.Range(
        document.positionAt(base + e.offset),
        document.positionAt(base + e.offset + e.length),
      ),
      e.content,
    );
  }
}

/** Asks before removing a token that is still used; replaceable by the integration tests. */
let confirmRemoval = async (message: string): Promise<boolean> =>
  (await vscode.window.showWarningMessage(message, { modal: true }, "Remove")) === "Remove";

/** Not a public API: lets `test/integration/` answer the removal prompt and see its text. */
export function setRemovalPrompt(prompt: (message: string) => Promise<boolean>): () => void {
  const previous = confirmRemoval;
  confirmRemoval = prompt;
  return () => {
    confirmRemoval = previous;
  };
}

/**
 * Whether removing the token at `path` may go ahead: always for one that is
 * not deprecated, silently for a deprecated one nothing uses, and only after
 * a warning naming the count for one still in use.
 */
export async function mayRemove(
  document: vscode.TextDocument,
  path: string[],
  text = document.getText(),
) {
  const key = path.join(".");
  const token = indexTokens(parseTokens(text)).get(key);
  if (!token || !deprecation(token)) return true;
  const uses = (await deprecatedUses(key)).length;
  if (!uses) return true;
  return confirmRemoval(
    `"${key}" is deprecated and still has ${uses} ${uses === 1 ? "use" : "uses"}. Remove it anyway?`,
  );
}

/**
 * Deprecate a token with a reason and an optional replacement. From the
 * editor it asks for both; `test/integration/` passes them as arguments. The
 * edit is the core's `$deprecated` line alone (invariant 1).
 */
async function deprecate(uri?: unknown, path?: unknown, reason?: unknown, replacement?: unknown) {
  const target = await targetOf(uri, path);
  if (!target) {
    void vscode.window.showInformationMessage("Put the cursor on a token to deprecate it.");
    return false;
  }
  const { document, fragment } = target;
  const key = target.path.join(".");
  const local = indexTokens(parseTokens(fragment.text));
  const token = local.get(key)!;
  const current = typeof token.deprecated === "string" ? token.deprecated : "";
  let why = typeof reason === "string" ? reason : undefined;
  let next = typeof replacement === "string" ? replacement : undefined;
  if (why === undefined) {
    why = await vscode.window.showInputBox({
      title: `Deprecate ${key}`,
      prompt: "Why is it deprecated? (optional)",
      value: current,
    });
    if (why === undefined) return false;
    const ws = await buildWorkspaceIndex();
    const all = new Map([...externalFor(ws, document.uri), ...local]);
    const items: Array<vscode.QuickPickItem & { key: string }> = [
      { label: "No replacement", key: "" },
      ...aliasCandidates(all.values(), key, token.type, all).map((t) => ({
        label: t.path.join("."),
        description: t.type,
        key: t.path.join("."),
      })),
    ];
    const picked = await vscode.window.showQuickPick(items, {
      title: `Deprecate ${key}: replace it with`,
      placeHolder: "The token its uses should move to",
    });
    if (!picked) return false;
    next = picked.key;
  }
  const edit = new vscode.WorkspaceEdit();
  applyIn(
    edit,
    document,
    computeDeprecateEdits(fragment.text, target.path, why, next),
    fragment.offset,
  );
  return vscode.workspace.applyEdit(edit);
}

/** List the remaining uses of a deprecated token in the references view; returns them too. */
async function findUses(uri?: unknown, path?: unknown) {
  const target = await targetOf(uri, path);
  if (!target) {
    void vscode.window.showInformationMessage("Put the cursor on a deprecated token first.");
    return [];
  }
  const key = target.path.join(".");
  const token = indexTokens(parseTokens(target.fragment.text)).get(key)!;
  if (!deprecation(token)) {
    void vscode.window.showInformationMessage(`"${key}" is not deprecated.`);
    return [];
  }
  const uses = await deprecatedUses(key);
  if (!uses.length) {
    void vscode.window.showInformationMessage(`"${key}" has no remaining uses: it can be removed.`);
    return uses;
  }
  const at = keyRange(target.document, [...target.fragment.path, ...target.path]);
  void vscode.commands.executeCommand(
    "editor.action.showReferences",
    target.document.uri,
    at?.start ?? new vscode.Position(0, 0),
    uses,
  );
  return uses;
}

/** Remove a deprecated token, warning first while it is still used. Returns whether it went. */
async function remove(uri?: unknown, path?: unknown) {
  const target = await targetOf(uri, path);
  if (!target) {
    void vscode.window.showInformationMessage("Put the cursor on a deprecated token to remove it.");
    return false;
  }
  const { document, fragment } = target;
  const key = target.path.join(".");
  if (!deprecation(indexTokens(parseTokens(fragment.text)).get(key)!)) {
    void vscode.window.showInformationMessage(
      `"${key}" is not deprecated. Deprecate it first, move its uses, then remove it.`,
    );
    return false;
  }
  if (!(await mayRemove(document, target.path, fragment.text))) return false;
  const edit = new vscode.WorkspaceEdit();
  applyIn(edit, document, computeDeleteEdits(fragment.text, target.path), fragment.offset);
  return vscode.workspace.applyEdit(edit);
}

/**
 * The lightbulb on a struck-through use whose deprecated token names a
 * replacement that resolves: switch that one use to it. Attached to the
 * `deprecated-token` hint diagnostics.ts already reports there.
 */
class ReplacementFixProvider implements vscode.CodeActionProvider {
  static readonly kinds = [vscode.CodeActionKind.QuickFix];

  async provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
    context: vscode.CodeActionContext,
  ): Promise<vscode.CodeAction[]> {
    const hints = context.diagnostics.filter(
      (d) =>
        d.source === "Token Atlas" && d.code === "deprecated-token" && d.range.intersection(range),
    );
    if (!hints.length) return [];
    const ws = await buildWorkspaceIndex();
    const actions: vscode.CodeAction[] = [];
    const offer = (
      from: string,
      to: string,
      at: vscode.Range,
      build: (e: vscode.WorkspaceEdit) => void,
    ) => {
      const action = new vscode.CodeAction(
        `Replace {${from}} with {${to}}`,
        vscode.CodeActionKind.QuickFix,
      );
      action.edit = new vscode.WorkspaceEdit();
      build(action.edit);
      action.diagnostics = hints.filter((d) => d.range.intersection(at));
      // Not isPreferred, like the legacy fix: Auto Fix would apply it unasked.
      actions.push(action);
    };

    if (LANGUAGES.includes(document.languageId)) {
      if (isGeneratedCode(document.getText())) return []; // the export tool's to rewrite, as rename leaves it
      const lookup = (k: string) => ws.get(k)?.token;
      const pick = (k: string) => {
        const token = lookup(k);
        const next = token && deprecationReplacement(token, lookup);
        return next?.token ? { key: k, next: next.key } : undefined;
      };
      for (const u of tokenUsages(document.getText(), ws.keys(), pick, document.languageId)) {
        const at = new vscode.Range(u.line, u.character, u.line, u.character + u.length);
        if (!at.intersection(range)) continue;
        const text = retargetIdentifier(document.getText(at), u.value.key, u.value.next);
        if (text !== undefined)
          offer(u.value.key, u.value.next, at, (e) => e.replace(document.uri, at, text));
      }
      return actions;
    }

    for (const { ref, range: at, fragment } of usesIn(document, ws)) {
      if (!ref.replacement || !at.intersection(range)) continue;
      const edits = computeRetargetEdits(fragment.text, ref.path, ref.reference, ref.replacement);
      if (edits.length)
        offer(ref.reference, ref.replacement, at, (e) =>
          applyIn(e, document, edits, fragment.offset),
        );
    }
    return actions;
  }
}

export function registerDeprecation(context: vscode.ExtensionContext): void {
  const code = LANGUAGES.map((language) => ({ language }));
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      [...(TOKEN_SELECTOR as vscode.DocumentFilter[]), ...code],
      new ReplacementFixProvider(),
      { providedCodeActionKinds: ReplacementFixProvider.kinds },
    ),
    vscode.commands.registerCommand("tokenAtlas.deprecateToken", deprecate),
    vscode.commands.registerCommand("tokenAtlas.findDeprecatedUses", findUses),
    vscode.commands.registerCommand("tokenAtlas.removeDeprecatedToken", remove),
  );
}
