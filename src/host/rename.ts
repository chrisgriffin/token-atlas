/**
 * Rename a token or group and every `{reference}` to it, across the workspace,
 * as one WorkspaceEdit — so VS Code's native rename preview and a single undo
 * cover it. F2 in the text editor and "Rename" in the visual editor both come
 * through buildRenameEdit; the core computes the per-file edits. Tokens
 * written inline in a resolver document rename there too, and references to
 * a renamed token inside them are rewritten. So are its usages in CSS, Sass,
 * Less, JS and TS (codeUsages.ts), each re-spelled in its own convention;
 * a file that says it was generated is left to the export tool.
 */
import * as vscode from "vscode";
import { getLocation } from "jsonc-parser";
import {
  computeReferenceRenameEdits,
  computeRenameEdits,
  indexTokens,
  inlineSources,
  isGeneratedCode,
  parseTokens,
  renameInIdentifier,
  type Edit,
  type Fragment,
} from "../core";
import { codeUsages } from "./codeUsages";
import {
  TOKEN_SELECTOR,
  buildWorkspaceIndex,
  findResolverFiles,
  findTokenFiles,
  isResolverDocument,
  isTokenDocument,
  keyRange,
  tokenScopeAt,
} from "./workspaceIndex";

/** A name rename refuses: empty, a `$` property, or one that splits a path or a reference. */
const ILLEGAL_NAME = /^$|^\$|[{}.]/;

/** Thrown by `buildRenameEdit` for a name no token may have; the file is left alone. */
export class IllegalNameError extends Error {
  constructor() {
    super('Token names may not be empty, start with "$", or contain "{", "}", or ".".');
    this.name = "IllegalNameError";
  }
}

/**
 * Rename the node at `nodePath` in `document` (inside `scope` when it is an
 * inline resolver source), rewriting references in every token file and every
 * inline resolver source.
 */
export async function buildRenameEdit(
  document: vscode.TextDocument,
  nodePath: string[],
  newName: string,
  scope: Fragment = { text: document.getText(), path: [], offset: 0 },
): Promise<vscode.WorkspaceEdit> {
  // Both rename paths come through here, F2 and the visual editor's.
  if (ILLEGAL_NAME.test(newName)) throw new IllegalNameError();
  const edit = new vscode.WorkspaceEdit();
  add(edit, document, computeRenameEdits(scope.text, nodePath, newName), scope.offset);

  const oldKey = nodePath.join(".");
  const newKey = [...nodePath.slice(0, -1), newName].join(".");
  // Every token file, not just index winners (the index is first-file-wins
  // per key). Open each as a TextDocument so offsets match what VS Code edits,
  // unsaved changes included. computeReferenceRenameEdits skips a file that
  // defines the path itself (local-first, invariant 4).
  for (const { uri } of await findTokenFiles()) {
    if (uri.toString() === document.uri.toString()) continue;
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      add(edit, doc, computeReferenceRenameEdits(doc.getText(), oldKey, newKey));
    } catch {
      /* unreadable file — skip */
    }
  }
  // Each inline source is its own scope, local-first like a file.
  for (const { uri } of await findResolverFiles()) {
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      const self = doc.uri.toString() === document.uri.toString();
      for (const s of inlineSources(doc.getText())) {
        if (self && s.offset === scope.offset) continue;
        add(edit, doc, computeReferenceRenameEdits(s.text, oldKey, newKey), s.offset);
      }
    } catch {
      /* unreadable file — skip */
    }
  }
  await addCodeUsages(edit, scope.text, oldKey, nodePath.length - 1, newName);
  return edit;
}

const CODE_USAGE: vscode.WorkspaceEditEntryMetadata = {
  label: "Code usages",
  needsConfirmation: false,
};

/**
 * Rewrite the code usages of `oldKey`, or of every token under it when it is
 * a group, renaming its segment at `depth`. Identifiers are matched against
 * the same keys Find References uses, so rename moves exactly what it lists.
 * Declarations move too, keeping a hand-written file consistent; a generated
 * file is skipped whole (isGeneratedCode).
 */
async function addCodeUsages(
  edit: vscode.WorkspaceEdit,
  text: string,
  oldKey: string,
  depth: number,
  newName: string,
): Promise<void> {
  const local = indexTokens(parseTokens(text));
  const renamed = [...local.keys()].filter((k) => k === oldKey || k.startsWith(oldKey + "."));
  if (!renamed.length) return;
  const keys = new Set([...(await buildWorkspaceIndex()).keys(), ...local.keys()]);
  const usages = await codeUsages(keys);
  const docs = new Map<string, vscode.TextDocument | undefined>();
  for (const key of renamed) {
    for (const { location } of usages.get(key) ?? []) {
      const uri = location.uri.toString();
      if (!docs.has(uri)) {
        try {
          const doc = await vscode.workspace.openTextDocument(location.uri);
          docs.set(uri, isGeneratedCode(doc.getText()) ? undefined : doc);
        } catch {
          docs.set(uri, undefined); // unreadable file — skip
        }
      }
      const doc = docs.get(uri);
      if (!doc) continue;
      const r = renameInIdentifier(doc.getText(location.range), key, depth, newName);
      if (!r) continue;
      const at = location.range.start;
      edit.replace(
        doc.uri,
        new vscode.Range(at.translate(0, r.start), at.translate(0, r.end)),
        r.text,
        CODE_USAGE,
      );
    }
  }
}

function add(
  edit: vscode.WorkspaceEdit,
  document: vscode.TextDocument,
  edits: Edit[],
  base = 0,
): void {
  for (const e of edits) {
    const start = base + e.offset;
    edit.replace(
      document.uri,
      new vscode.Range(document.positionAt(start), document.positionAt(start + e.length)),
      e.content,
    );
  }
}

/** The token or group whose key is under `position`, or undefined. */
function renameTargetAt(
  document: vscode.TextDocument,
  position: vscode.Position,
): { path: string[]; range: vscode.Range; scope: Fragment } | undefined {
  const offset = document.offsetAt(position);
  const loc = getLocation(document.getText(), offset);
  if (!loc.isAtPropertyKey) return;
  // A token document, or a source written inline in a resolver.
  const scope = tokenScopeAt(document, offset);
  if (!scope) return;
  const path = loc.path.slice(scope.path.length);
  if (!path.length) return;
  if (!path.every((s): s is string => typeof s === "string" && !s.startsWith("$"))) return;
  const key = path.join(".");
  const local = indexTokens(parseTokens(scope.text));
  const known = local.has(key) || [...local.keys()].some((k) => k.startsWith(key + "."));
  if (!known) return;
  const range = keyRange(document, [...scope.path, ...path]);
  return range ? { path, range, scope } : undefined;
}

const renamable = (document: vscode.TextDocument) =>
  isTokenDocument(document) || isResolverDocument(document);

class TokenRenameProvider implements vscode.RenameProvider {
  prepareRename(document: vscode.TextDocument, position: vscode.Position) {
    if (!renamable(document)) return;
    const target = renameTargetAt(document, position);
    if (!target) throw new Error("Put the cursor on a token or group name to rename it.");
    return { range: target.range, placeholder: target.path[target.path.length - 1] };
  }

  async provideRenameEdits(
    document: vscode.TextDocument,
    position: vscode.Position,
    newName: string,
  ) {
    if (!renamable(document)) return;
    const target = renameTargetAt(document, position);
    if (!target) return;
    return buildRenameEdit(document, target.path, newName, target.scope);
  }
}

export function registerRename(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerRenameProvider(TOKEN_SELECTOR, new TokenRenameProvider()),
  );
}
