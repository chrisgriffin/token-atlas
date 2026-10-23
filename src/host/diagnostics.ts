/**
 * Surfaces core validation as VS Code diagnostics (squiggles + Problems panel).
 *
 * Issue paths from the core are mapped to document ranges with jsonc-parser:
 * we highlight the offending token/group *key* where possible, falling back to
 * the value node.
 *
 * Lint findings ride the same per-document collection, driven by the
 * `token-atlas.lint.json` at the document's workspace folder root; that file's own
 * problems go in a collection of their own, on the config file.
 *
 * A DTCG resolver document is not a token file but gets checked too, in a
 * collection of its own: its structure, and that every file it names exists.
 *
 * Every use of a deprecated token is a hint, struck through: a `{reference}`
 * in a token file or a resolver's inline tokens, and an exported name in an
 * open code document (open ones only, so no code file is scanned unasked).
 */
import * as vscode from "vscode";
import { findNodeAtLocation, parseTree, type JSONPath, type Node } from "jsonc-parser";
import {
  collectReferences,
  deprecatedReferences,
  deprecation,
  deprecationMessage,
  findPathCollisions,
  indexTokens,
  inlineSources,
  lintTokens,
  modifierFiles,
  parseLintConfig,
  parseResolver,
  pointerTarget,
  parseTokens,
  resolveAliases,
  tokenUsages,
  validate,
  type DeprecatedReference,
  type LintConfig,
  type LintConfigIssue,
  type ValidationIssue,
} from "../core";
import {
  buildWorkspaceIndex,
  externalIndexFor,
  findResolverFiles,
  findTokenFiles,
  inPrecedenceOrder,
  isResolverDocument,
  isTokenDocument,
  keyRange,
  localScopeFor,
  onDidInvalidateWorkspaceIndex,
} from "./workspaceIndex";
import { codeUsages, onDidChangeCodeUsages } from "./codeUsages";
import { LANGUAGES } from "./exportFeatures";

export function registerDiagnostics(context: vscode.ExtensionContext): void {
  const collection = vscode.languages.createDiagnosticCollection("token-atlas");
  // Workspace-wide: a token path defined in more than one file. Kept apart
  // from the per-document collection because one pass writes many files.
  const collisions = vscode.languages.createDiagnosticCollection("token-atlas-collisions");
  const lintConfigs = vscode.languages.createDiagnosticCollection("token-atlas-lint-config");
  // Opt-in (`tokenAtlas.unusedTokens`): needs a scan of every code file.
  const unused = vscode.languages.createDiagnosticCollection("token-atlas-unused");
  const resolvers = vscode.languages.createDiagnosticCollection("token-atlas-resolver");
  const deprecatedCode = vscode.languages.createDiagnosticCollection("token-atlas-deprecated");
  context.subscriptions.push(
    collection,
    collisions,
    lintConfigs,
    unused,
    resolvers,
    deprecatedCode,
  );

  const refresh = async (document: vscode.TextDocument) => {
    if (!diagnosable(document)) return;
    const off =
      vscode.workspace.getConfiguration("tokenAtlas", document.uri).get<string>("validation") ===
      "off";
    /** Publish, unless the document closed while its problems were worked out. */
    const publish = (into: vscode.DiagnosticCollection, found: vscode.Diagnostic[]) => {
      if (!document.isClosed) into.set(document.uri, found);
    };
    if (LANGUAGES.includes(document.languageId)) {
      if (off) deprecatedCode.delete(document.uri);
      else publish(deprecatedCode, await deprecatedCodeDiagnostics(document));
      return;
    }
    if (!off && isResolverDocument(document)) {
      publish(resolvers, await resolverDiagnostics(document));
      return;
    }
    resolvers.delete(document.uri);
    if (off || !isTokenDocument(document)) {
      collection.delete(document.uri); // validation off, or stopped sniffing as tokens
      return;
    }
    publish(collection, await computeDiagnostics(document));
  };

  const refreshAllOpen = () => {
    for (const doc of vscode.workspace.textDocuments) void refresh(doc);
    void refreshCollisions(collisions);
    void refreshLintConfigs(lintConfigs);
    void refreshUnused(unused);
  };

  // Debounce: a keystroke in any token file affects cross-file references
  // everywhere, so re-validate every open document — but once per pause in
  // typing, not once per keystroke.
  let timer: NodeJS.Timeout | undefined;
  const scheduleRefreshAll = () => {
    clearTimeout(timer);
    timer = setTimeout(refreshAllOpen, 250);
  };

  // Only the opt-in unused-token hint reads code usages, so a code edit
  // refreshes that and nothing else — and only while the hint is on.
  let unusedTimer: NodeJS.Timeout | undefined;
  const scheduleRefreshUnused = () => {
    if (unusedTokensMode() === "off") return;
    clearTimeout(unusedTimer);
    unusedTimer = setTimeout(() => void refreshUnused(unused), 250);
  };

  // A code document's own deprecation hints, once per pause in typing too.
  const codeTimers = new Map<string, NodeJS.Timeout>();
  const scheduleRefresh = (document: vscode.TextDocument) => {
    const key = document.uri.toString();
    clearTimeout(codeTimers.get(key));
    codeTimers.set(
      key,
      setTimeout(() => {
        codeTimers.delete(key);
        void refresh(document);
      }, 250),
    );
  };

  // Initial pass over already-open documents.
  refreshAllOpen();

  context.subscriptions.push(
    {
      dispose: () => {
        clearTimeout(timer);
        clearTimeout(unusedTimer);
        for (const t of codeTimers.values()) clearTimeout(t);
      },
    },
    vscode.workspace.onDidOpenTextDocument((doc) => void refresh(doc)),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (isTokenDocument(e.document) || isResolverDocument(e.document)) scheduleRefreshAll();
      else if (LANGUAGES.includes(e.document.languageId)) scheduleRefresh(e.document);
    }),
    vscode.workspace.onDidCloseTextDocument((doc) => {
      clearTimeout(codeTimers.get(doc.uri.toString()));
      codeTimers.delete(doc.uri.toString());
      collection.delete(doc.uri);
      resolvers.delete(doc.uri);
      deprecatedCode.delete(doc.uri);
      unused.delete(doc.uri);
    }),
    // The active document's own definitions are exempt (local-first), so the
    // set of reported collisions depends on which editor is active.
    vscode.window.onDidChangeActiveTextEditor(() => void refreshCollisions(collisions)),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("tokenAtlas")) refreshAllOpen();
    }),
    // What a reference resolves to depends on the active token set and on
    // every other token file; when the index goes stale, so do these.
    onDidInvalidateWorkspaceIndex(() => scheduleRefreshAll()),
    onDidChangeCodeUsages(scheduleRefreshUnused),
    vscode.workspace.onDidOpenTextDocument(() => void refreshUnused(unused)),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      lintConfigCache.clear();
      refreshAllOpen();
    }),
  );

  // Config edits apply live: a write, create or delete re-reads it everywhere.
  const watcher = vscode.workspace.createFileSystemWatcher(`**/${LINT_CONFIG}`);
  const reload = () => {
    lintConfigCache.clear();
    refreshAllOpen();
  };
  watcher.onDidChange(reload);
  watcher.onDidCreate(reload);
  watcher.onDidDelete(reload);
  context.subscriptions.push(watcher);
}

const LINT_CONFIG = "token-atlas.lint.json";

/**
 * True for a document whose problems belong in the Problems panel: a file on
 * disk, an untitled buffer, or a file of a (virtual) workspace folder. Not a
 * second view of a file under another scheme, such as a diff's `git:` side,
 * which would report every problem twice.
 */
export function diagnosable(document: vscode.TextDocument): boolean {
  const { scheme } = document.uri;
  return (
    scheme === "file" ||
    scheme === "untitled" ||
    vscode.workspace.getWorkspaceFolder(document.uri) !== undefined
  );
}

/** Parsed config per workspace folder, cleared whenever any config file changes. */
const lintConfigCache = new Map<string, Promise<LintFile | undefined>>();

interface LintFile {
  uri: vscode.Uri;
  text: string;
  config: LintConfig;
  issues: LintConfigIssue[];
}

/** The lint config governing `uri`: its workspace folder's, or none. */
function lintConfigFor(uri: vscode.Uri): Promise<LintFile | undefined> {
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  return folder ? lintConfigIn(folder) : Promise.resolve(undefined);
}

function lintConfigIn(folder: vscode.WorkspaceFolder): Promise<LintFile | undefined> {
  const key = folder.uri.toString();
  let hit = lintConfigCache.get(key);
  if (!hit) {
    const uri = vscode.Uri.joinPath(folder.uri, LINT_CONFIG);
    hit = Promise.resolve(vscode.workspace.fs.readFile(uri)).then(
      (bytes) => {
        const text = Buffer.from(bytes).toString("utf8");
        return { uri, text, ...parseLintConfig(text) };
      },
      () => undefined, // no config file: lint is silent
    );
    lintConfigCache.set(key, hit);
  }
  return hit;
}

/** Each workspace folder's config problems, shown on that config file. */
async function refreshLintConfigs(lintConfigs: vscode.DiagnosticCollection): Promise<void> {
  const files = await Promise.all((vscode.workspace.workspaceFolders ?? []).map(lintConfigIn));
  lintConfigs.clear();
  for (const file of files) {
    if (!file?.issues.length) continue;
    const document = await vscode.workspace.openTextDocument(file.uri);
    const root = parseTree(file.text);
    lintConfigs.set(
      file.uri,
      file.issues.map((issue) => {
        const range =
          issue.offset !== undefined
            ? new vscode.Range(
                document.positionAt(issue.offset),
                document.positionAt(issue.offset + 1),
              )
            : rangeForPath(document, root, issue.path);
        const d = new vscode.Diagnostic(range, issue.message, vscode.DiagnosticSeverity.Error);
        d.source = "Token Atlas";
        return d;
      }),
    );
  }
}

/**
 * Report, once per collision, on every losing file's token, naming the file
 * whose definition the workspace index kept. A path the active document
 * defines itself is not a collision: local-first resolution (invariant 4) makes
 * that the intended multi-brand / multi-theme behaviour. Nor is a path shared
 * only by one resolver modifier's files (its contexts, such as light and dark),
 * which never load beside each other.
 */
async function refreshCollisions(collisions: vscode.DiagnosticCollection): Promise<void> {
  // `tokenAtlas.pathCollisions`: identical paths across files are often
  // deliberate in multi-brand repos, so it is an information unless raised.
  const mode =
    vscode.workspace.getConfiguration("tokenAtlas").get<string>("pathCollisions") ?? "information";
  if (mode === "off") {
    collisions.clear();
    return;
  }
  const severity =
    mode === "warning" ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Information;
  // The index's own visiting order, so the file named as winning is the one that does.
  const files = inPrecedenceOrder(await findTokenFiles());
  const labelled = files.map((f) => ({
    uri: f.uri,
    label: vscode.workspace.asRelativePath(f.uri),
    model: parseTokens(f.text),
  }));
  const active = vscode.window.activeTextEditor?.document;
  const activeKeys = new Set(
    active && isTokenDocument(active) ? indexTokens(parseTokens(active.getText())).keys() : [],
  );
  const byLabel = new Map(labelled.map((f) => [f.label, f.uri]));
  const perFile = new Map<vscode.Uri, vscode.Diagnostic[]>();
  // Each modifier's files, labelled as the token files are, from every resolver.
  const alternatives = (await findResolverFiles()).flatMap(({ uri, text }) => {
    const { resolver } = parseResolver(text);
    const dir = vscode.Uri.joinPath(uri, "..");
    return (resolver ? modifierFiles(resolver) : []).map((group) =>
      group.map((file) => vscode.workspace.asRelativePath(vscode.Uri.joinPath(dir, file))),
    );
  });

  for (const { path, files: labels } of findPathCollisions(labelled, alternatives)) {
    if (activeKeys.has(path)) continue;
    const [winner, ...losers] = labels;
    for (const loser of losers) {
      const uri = byLabel.get(loser)!;
      const doc = await vscode.workspace.openTextDocument(uri);
      const range = keyRange(doc, path.split(".")) ?? new vscode.Range(0, 0, 0, 0);
      const d = new vscode.Diagnostic(
        range,
        `"${path}" is also defined in ${winner}, whose definition wins for files that reference it; this one is only used inside ${loser}.`,
        severity,
      );
      d.source = "Token Atlas";
      perFile.set(uri, [...(perFile.get(uri) ?? []), d]);
    }
  }

  collisions.clear();
  for (const [uri, diags] of perFile) collisions.set(uri, diags);
}

/**
 * Open token files only: a hint on each token that no `{reference}` in any
 * token file and no exported-code identifier uses. A declaration in exported
 * code (`--x:`, `$x:`, `x =`) is the export tool defining the name, so it does
 * not count as a use.
 */
function unusedTokensMode(): string {
  return vscode.workspace.getConfiguration("tokenAtlas").get<string>("unusedTokens") ?? "off";
}

async function refreshUnused(unused: vscode.DiagnosticCollection): Promise<void> {
  const mode = unusedTokensMode();
  const open = vscode.workspace.textDocuments.filter((d) => isTokenDocument(d) && diagnosable(d));
  if (mode === "off" || !open.length) {
    unused.clear();
    return;
  }
  const files = await findTokenFiles();
  const referenced = new Set<string>();
  const keys = new Set<string>();
  const inline = (await findResolverFiles()).flatMap((f) => inlineSources(f.text));
  for (const text of [
    ...files.map((f) => f.text),
    ...open.map((d) => d.getText()),
    ...inline.map((s) => s.text),
  ]) {
    for (const [key, token] of indexTokens(parseTokens(text))) {
      keys.add(key);
      for (const ref of collectReferences(token.value)) referenced.add(ref);
    }
  }
  const used = new Set(
    [...(await codeUsages(keys))]
      .filter(([, usages]) => usages.some((u) => !u.declaration))
      .map(([key]) => key),
  );
  const severity =
    mode === "information" ? vscode.DiagnosticSeverity.Information : vscode.DiagnosticSeverity.Hint;
  unused.clear();
  for (const document of open) {
    const diags: vscode.Diagnostic[] = [];
    for (const [key, token] of indexTokens(parseTokens(document.getText()))) {
      if (referenced.has(key) || used.has(key)) continue;
      const range = keyRange(document, token.path) ?? new vscode.Range(0, 0, 0, 0);
      const d = new vscode.Diagnostic(
        range,
        `"${key}" is not referenced by any token or used in any CSS, Sass, Less, JS or TS file.`,
        severity,
      );
      d.source = "Token Atlas";
      d.code = "unused-token";
      d.tags = [vscode.DiagnosticTag.Unnecessary];
      diags.push(d);
    }
    unused.set(document.uri, diags);
  }
}

async function computeDiagnostics(document: vscode.TextDocument): Promise<vscode.Diagnostic[]> {
  const text = document.getText();
  const external = await externalIndexFor(document.uri);
  const model = parseTokens(text);
  const index = resolveAliases(model, external, localScopeFor(document.uri));
  const { issues } = validate(model, external, localScopeFor(document.uri));
  const lint = await lintConfigFor(document.uri);
  if (lint) {
    // A token a group has through `$extends` has no key here; its origin
    // reports anything wrong with it.
    const inherited = (path: string[]) => index.get(path.join("."))?.inheritedFrom;
    issues.push(
      ...lintTokens(model, lint.config, external, localScopeFor(document.uri)).filter(
        (i) => !inherited(i.path),
      ),
    );
  }

  const root = parseTree(text);
  return [
    ...issues.map((issue) => toDiagnostic(document, root, issue)),
    ...deprecatedReferences(model, external, localScopeFor(document.uri)).map((ref) =>
      deprecatedDiagnostic(document, root, ref),
    ),
  ];
}

/** A hint on the reference string itself, struck through, quotes excluded. */
function deprecatedDiagnostic(
  document: vscode.TextDocument,
  root: Node | undefined,
  { path, message }: DeprecatedReference,
): vscode.Diagnostic {
  const node = root && findNodeAtLocation(root, path);
  const range = node
    ? new vscode.Range(
        document.positionAt(node.offset + 1),
        document.positionAt(node.offset + node.length - 1),
      )
    : new vscode.Range(0, 0, 0, 0);
  return deprecatedHint(range, message);
}

function deprecatedHint(range: vscode.Range, message: string): vscode.Diagnostic {
  const d = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Hint);
  d.source = "Token Atlas";
  d.code = "deprecated-token";
  d.tags = [vscode.DiagnosticTag.Deprecated];
  return d;
}

/** Each use of a deprecated token's exported name in a code document, in the active set. */
async function deprecatedCodeDiagnostics(
  document: vscode.TextDocument,
): Promise<vscode.Diagnostic[]> {
  const ws = await buildWorkspaceIndex();
  const why = (key: string) => {
    const token = ws.get(key)?.token;
    const value = token && deprecation(token);
    return value ? deprecationMessage(key, value) : undefined;
  };
  return tokenUsages(document.getText(), ws.keys(), why, document.languageId).map((u) =>
    deprecatedHint(new vscode.Range(u.line, u.character, u.line, u.character + u.length), u.value),
  );
}

/** A resolver document's problems, and a warning on every source that is not there. */
async function resolverDiagnostics(document: vscode.TextDocument): Promise<vscode.Diagnostic[]> {
  const text = document.getText();
  const { resolver, issues } = parseResolver(text);
  const root = parseTree(text);
  const out = issues.map((issue) => {
    const range =
      issue.offset !== undefined
        ? new vscode.Range(document.positionAt(issue.offset), document.positionAt(issue.offset + 1))
        : rangeForPath(document, root, issue.path);
    const d = new vscode.Diagnostic(
      range,
      issue.message,
      issue.severity === "error"
        ? vscode.DiagnosticSeverity.Error
        : vscode.DiagnosticSeverity.Warning,
    );
    d.source = "Token Atlas";
    return d;
  });
  // Inline tokens: a reference resolves within its own source first, then the index.
  const inline = inlineSources(text);
  if (inline.length) {
    const external = new Map([...(await buildWorkspaceIndex())].map(([k, hit]) => [k, hit.token]));
    for (const source of inline) {
      for (const ref of deprecatedReferences(parseTokens(source.text), external)) {
        out.push(
          deprecatedDiagnostic(document, root, { ...ref, path: [...source.path, ...ref.path] }),
        );
      }
    }
  }
  const dir = vscode.Uri.joinPath(document.uri, "..");
  const sources = resolver?.steps.flatMap((step) =>
    "files" in step ? step.files : [...step.modifier.contexts.values()].flat(),
  );
  // A set used in several places lists its sources once per use; check each once.
  const seen = new Set<string>();
  for (const source of sources ?? []) {
    const key = JSON.stringify(source.path);
    if (seen.has(key)) continue;
    seen.add(key);
    let problem: string | undefined;
    let target = text;
    if (source.file) {
      try {
        target = new TextDecoder().decode(
          await vscode.workspace.fs.readFile(vscode.Uri.joinPath(dir, source.file)),
        );
      } catch {
        problem = `File not found: ${source.file}`;
      }
    }
    if (!problem && source.pointer !== undefined && !pointerTarget(target, source.pointer))
      problem = `No token group at ${source.file}#${source.pointer}`;
    if (problem) {
      const d = new vscode.Diagnostic(
        rangeForPath(document, root, source.path),
        problem,
        vscode.DiagnosticSeverity.Warning,
      );
      d.source = "Token Atlas";
      out.push(d);
    }
  }
  return out;
}

function toDiagnostic(
  document: vscode.TextDocument,
  root: Node | undefined,
  issue: ValidationIssue,
): vscode.Diagnostic {
  const range = rangeForPath(document, root, issue.path);
  const diagnostic = new vscode.Diagnostic(
    range,
    issue.message,
    issue.severity === "error"
      ? vscode.DiagnosticSeverity.Error
      : vscode.DiagnosticSeverity.Warning,
  );
  diagnostic.source = "Token Atlas";
  if (issue.code) diagnostic.code = issue.code;
  return diagnostic;
}

function rangeForPath(
  document: vscode.TextDocument,
  root: Node | undefined,
  path: JSONPath,
): vscode.Range {
  if (root) {
    const node = findNodeAtLocation(root, path);
    if (node) {
      // Prefer the property key for a tighter, more legible squiggle.
      const prop = node.parent;
      const target =
        prop && prop.type === "property" && prop.children?.[0] ? prop.children[0] : node;
      return new vscode.Range(
        document.positionAt(target.offset),
        document.positionAt(target.offset + target.length),
      );
    }
  }
  return new vscode.Range(0, 0, 0, 0);
}
