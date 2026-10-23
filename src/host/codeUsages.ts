/**
 * Where tokens are used in exported code — CSS, Sass, Less, JS, TS — the
 * reverse of exportFeatures.ts. Find References on a token adds these
 * locations, and the opt-in unused-token hint reads them.
 *
 * Each code file is scanned once into identifier spellings
 * (core/exportNames.ts `scanIdentifiers`) and kept until that file changes;
 * matching spellings to tokens is redone per query, so a token edit costs no
 * rescan. Nothing is scanned until a query asks.
 */
import * as vscode from "vscode";
import { scanIdentifiers, tokenMatcher, type IdentifierOccurrence } from "../core";
import { LANGUAGES } from "./exportFeatures";
import { excludeGlobs, readCapped } from "./workspaceIndex";

const CODE_GLOB = "**/*.{css,scss,sass,less,js,jsx,mjs,cjs,ts,tsx,mts,cts}";

export interface CodeUsage {
  location: vscode.Location;
  declaration: boolean;
}

let files: vscode.Uri[] | undefined;
const scans = new Map<string, Map<string, IdentifierOccurrence[]>>();
const changed = new vscode.EventEmitter<void>();
/** Fires when a code file is edited, written, created or deleted. */
export const onDidChangeCodeUsages = changed.event;

async function codeFiles(): Promise<vscode.Uri[]> {
  if (files) return files;
  const exclude = excludeGlobs();
  try {
    files = await vscode.workspace.findFiles(
      CODE_GLOB,
      exclude.length ? `{${exclude.join(",")}}` : null,
    );
  } catch {
    return [];
  }
  return files;
}

async function scanOf(uri: vscode.Uri): Promise<Map<string, IdentifierOccurrence[]>> {
  const key = uri.toString();
  let scan = scans.get(key);
  if (!scan) {
    const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === key);
    // A stylesheet's extension is its language id (css, scss, sass, less).
    const languageId = open?.languageId ?? uri.path.slice(uri.path.lastIndexOf(".") + 1);
    scan = scanIdentifiers((open ? open.getText() : await readCapped(uri)) ?? "", languageId);
    scans.set(key, scan);
  }
  return scan;
}

/**
 * Every code usage of every token in `keys`, by key. An identifier counts for
 * the token `findTokenForIdentifier` would hover it as, so references agree
 * with hover and go-to-definition.
 */
export async function codeUsages(
  keys: Iterable<string>,
  cancel?: vscode.CancellationToken,
): Promise<Map<string, CodeUsage[]>> {
  const match = tokenMatcher(keys);
  const out = new Map<string, CodeUsage[]>();
  for (const uri of await codeFiles()) {
    if (cancel?.isCancellationRequested) break;
    for (const [name, occurrences] of await scanOf(uri)) {
      const key = match(name);
      if (!key) continue;
      const list = out.get(key) ?? [];
      for (const o of occurrences) {
        const range = new vscode.Range(o.line, o.character, o.line, o.character + o.length);
        list.push({ location: new vscode.Location(uri, range), declaration: o.declaration });
      }
      out.set(key, list);
    }
  }
  return out;
}

export function registerCodeUsageInvalidation(context: vscode.ExtensionContext): void {
  const drop = (uri: vscode.Uri) => {
    scans.delete(uri.toString());
    changed.fire();
  };
  const reset = () => {
    files = undefined;
    scans.clear();
    changed.fire();
  };
  const watcher = vscode.workspace.createFileSystemWatcher(CODE_GLOB);
  watcher.onDidChange(drop);
  watcher.onDidCreate(reset);
  watcher.onDidDelete(reset);
  context.subscriptions.push(
    watcher,
    changed,
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (LANGUAGES.includes(e.document.languageId)) drop(e.document.uri);
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(reset),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("tokenAtlas.exclude")) reset();
    }),
  );
}
