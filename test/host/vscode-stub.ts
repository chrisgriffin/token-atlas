/**
 * A stand-in for the `vscode` module, just big enough to load the host's
 * workspace index under vitest: `vi.mock("vscode", () => import("./vscode-stub"))`.
 * Files live in `disk`, open documents in `workspace.textDocuments`, and
 * `stats` counts what the index asks the file system for, so a test can pin
 * how much work an event costs. `emit` fires the workspace events the index
 * subscribes to. `commands` and `applyEdit` are enough to run a command the
 * host registers and see the edit it makes, with `applyEditRefuses` standing
 * in for VS Code turning an edit down.
 */
export class EventEmitter<T> {
  private listeners: Array<(e: T) => void> = []
  event = (listener: (e: T) => void) => {
    this.listeners.push(listener)
    return {
      dispose: () =>
        (this.listeners = this.listeners.filter(l => l !== listener)),
    }
  }
  fire(e: T): void {
    for (const l of this.listeners) l(e)
  }
  dispose(): void {
    this.listeners = []
  }
}

export class Uri {
  readonly scheme = "file"
  constructor(readonly path: string) {}
  get fsPath(): string {
    return this.path
  }
  toString(): string {
    return `file://${this.path}`
  }
  static file(path: string): Uri {
    return new Uri(path)
  }
  static parse(value: string): Uri {
    return new Uri(value.replace(/^file:\/\//, ""))
  }
  static joinPath(base: Uri, ...parts: string[]): Uri {
    const segments: string[] = []
    for (const s of [
      ...base.path.split("/"),
      ...parts.flatMap(p => p.split("/")),
    ]) {
      if (s === "..") segments.pop()
      else if (s && s !== ".") segments.push(s)
    }
    return new Uri(`/${segments.join("/")}`)
  }
}

export class RelativePattern {
  readonly baseUri: Uri
  constructor(
    base: Uri | { uri: Uri },
    readonly pattern: string,
  ) {
    this.baseUri = base instanceof Uri ? base : base.uri
  }
}

export class Position {
  constructor(
    readonly line: number,
    readonly character: number,
  ) {}
}

export class Range {
  constructor(
    readonly start: unknown,
    readonly end: unknown,
    ..._rest: unknown[]
  ) {}
}

export class Location {
  constructor(
    readonly uri: Uri,
    readonly range: Range,
  ) {}
}

/** Replacements by document; offsets are a stub document's `positionAt` characters. */
export class WorkspaceEdit {
  readonly replacements: Array<{ uri: Uri; range: Range; content: string }> = []
  replace(uri: Uri, range: Range, content: string): void {
    this.replacements.push({ uri, range, content })
  }
}

export class Diagnostic {
  source?: string
  code?: string
  tags?: number[]
  constructor(
    readonly range: Range,
    readonly message: string,
    readonly severity: number,
  ) {}
}

export class MarkdownString {
  supportHtml = false
  constructor(
    readonly value: string,
    readonly supportThemeIcons = false,
  ) {}
}

export class Hover {
  readonly contents: MarkdownString[]
  constructor(
    contents: MarkdownString,
    readonly range?: Range,
  ) {
    this.contents = [contents]
  }
}

export const CodeActionKind = { QuickFix: "quickfix" }

export const DiagnosticSeverity = {
  Error: 0,
  Warning: 1,
  Information: 2,
  Hint: 3,
}
export const DiagnosticTag = { Unnecessary: 1, Deprecated: 2 }

export interface StubDocument {
  uri: Uri
  languageId: string
  version: number
  isClosed: boolean
  getText(): string
  positionAt(offset: number): Position
}

/** An open document over `path`: `edit` replaces its text, `close` closes it. */
export function openDocument(path: string, text: string, languageId = "json") {
  let current = text
  const doc: StubDocument = {
    uri: Uri.file(path),
    languageId,
    version: 1,
    isClosed: false,
    getText: () => current,
    positionAt: offset => new Position(0, offset),
  }
  /** Replace the text and fire the change event, as typing does. */
  const edit = (next: string) => {
    current = next
    doc.version++
    emit("onDidChangeTextDocument", { document: doc, contentChanges: [{}] })
  }
  workspace.textDocuments.push(doc)
  editors.set(doc.uri.toString(), edit)
  emit("onDidOpenTextDocument", doc)
  return {
    doc,
    edit,
    close() {
      doc.isClosed = true
      workspace.textDocuments.splice(workspace.textDocuments.indexOf(doc), 1)
      emit("onDidCloseTextDocument", doc)
    },
  }
}

/** How `applyEdit` changes each open document's text, by URI. */
const editors = new Map<string, (next: string) => void>()

/** Every diagnostic collection created, by name, keyed by document URI. */
export const collections = new Map<string, Map<string, Diagnostic[]>>()

export const languages = {
  createDiagnosticCollection(name: string) {
    const entries = new Map<string, Diagnostic[]>()
    collections.set(name, entries)
    return {
      set: (uri: Uri, diagnostics: Diagnostic[]) =>
        entries.set(uri.toString(), diagnostics),
      delete: (uri: Uri) => entries.delete(uri.toString()),
      clear: () => entries.clear(),
      dispose: () => entries.clear(),
    }
  },
  registerCodeActionsProvider: () => ({ dispose: () => {} }),
  registerRenameProvider: () => ({ dispose: () => {} }),
}

/** Every command registered, by id; `executeCommand` runs one. */
const registered = new Map<string, (...args: unknown[]) => unknown>()

export const commands = {
  registerCommand(id: string, run: (...args: unknown[]) => unknown) {
    registered.set(id, run)
    return { dispose: () => registered.delete(id) }
  },
  async executeCommand(id: string, ...args: unknown[]) {
    return registered.get(id)?.(...args)
  },
}

/** Messages the host showed, newest last. */
export const shown: string[] = []
const show = async (message: string) => {
  shown.push(message)
  return undefined
}

export const window = {
  showInformationMessage: show,
  showWarningMessage: show,
  showErrorMessage: show,
  showInputBox: async () => undefined,
  activeTextEditor: undefined,
  onDidChangeActiveTextEditor: (listener: (e: unknown) => void) =>
    on("onDidChangeActiveTextEditor")(listener),
}

export const disk = new Map<string, string>()
export const stats = {
  findFiles: 0,
  readFile: 0,
  findFilesArgs: [] as unknown[],
}
/** Set to make `applyEdit` refuse, as VS Code does an edit on a stale version. */
export const applyEditRefuses = { value: false }
/** `tokenAtlas.*` values: `global`, then one set per workspace folder path. */
export const settings: {
  global: Record<string, unknown>
  folders: Record<string, Record<string, unknown>>
} = {
  global: {},
  folders: {},
}

const listeners = new Map<string, Array<(e: unknown) => void>>()
const on =
  (name: string) =>
  (listener: (e: unknown) => void): { dispose(): void } => {
    listeners.set(name, [...(listeners.get(name) ?? []), listener])
    return { dispose: () => {} }
  }

export function emit(name: string, payload?: unknown): void {
  for (const l of listeners.get(name) ?? []) l(payload)
}

/** Back to an empty workspace with one folder at `/ws`. */
export function reset(): void {
  disk.clear()
  listeners.clear()
  editors.clear()
  registered.clear()
  shown.length = 0
  applyEditRefuses.value = false
  collections.clear()
  workspace.textDocuments.length = 0
  workspace.workspaceFolders = [{ uri: Uri.file("/ws"), name: "ws", index: 0 }]
  settings.global = {}
  settings.folders = {}
  stats.findFiles = 0
  stats.readFile = 0
  stats.findFilesArgs = []
}

const tick = () => new Promise(r => setImmediate(r))

/** `**\/*.json`-style globs only: what the index's defaults and the tests use. */
function matches(path: string, glob: string): boolean {
  const alternatives = glob.replace(/^\{|\}$/g, "").split(",")
  return alternatives.some(g => {
    const m = /^\*\*\/\*(\.[\w.]+)$/.exec(g)
    return m ? path.endsWith(m[1]) : path.endsWith(g.replace(/^\*\*\//, "/"))
  })
}

export const workspace = {
  textDocuments: [] as StubDocument[],
  workspaceFolders: [] as
    | Array<{ uri: Uri; name: string; index: number }>
    | undefined,
  getConfiguration(_section?: string, scope?: Uri | { uri: Uri }) {
    const uri = scope instanceof Uri ? scope : scope?.uri
    const folder =
      uri &&
      workspace.workspaceFolders?.find(f => uri.path.startsWith(f.uri.path))
    const values = {
      ...settings.global,
      ...(folder ? settings.folders[folder.uri.path] : {}),
    }
    return {
      get: <T>(key: string): T | undefined => values[key] as T | undefined,
    }
  },
  async findFiles(include: string | RelativePattern, exclude?: string | null) {
    stats.findFiles++
    stats.findFilesArgs.push({ include, exclude })
    await tick()
    const base = typeof include === "string" ? "/" : `${include.baseUri.path}/`
    const glob = typeof include === "string" ? include : include.pattern
    return [...disk.keys()]
      .filter(p => p.startsWith(base) && matches(p, glob))
      .map(p => Uri.file(p))
  },
  fs: {
    async stat(uri: Uri) {
      const text = disk.get(uri.path)
      if (text === undefined) throw new Error(`ENOENT ${uri.path}`)
      return { size: text.length }
    },
    async readFile(uri: Uri) {
      stats.readFile++
      await tick()
      const text = disk.get(uri.path)
      if (text === undefined) throw new Error(`ENOENT ${uri.path}`)
      return Buffer.from(text)
    },
  },
  async openTextDocument(uri: Uri) {
    const open = workspace.textDocuments.find(
      d => d.uri.toString() === uri.toString(),
    )
    if (open) return open
    const text = disk.get(uri.path)
    if (text === undefined) throw new Error(`ENOENT ${uri.path}`)
    return openDocument(uri.path, text).doc
  },
  /** Applies each document's replacements back to front, so offsets hold. */
  async applyEdit(edit: WorkspaceEdit) {
    if (applyEditRefuses.value) return false
    const byDoc = new Map<string, typeof edit.replacements>()
    for (const r of edit.replacements)
      byDoc.set(r.uri.toString(), [...(byDoc.get(r.uri.toString()) ?? []), r])
    for (const [key, replacements] of byDoc) {
      const doc = workspace.textDocuments.find(d => d.uri.toString() === key)
      if (!doc) return false
      let text = doc.getText()
      const at = (p: unknown) => (p as Position).character
      for (const r of replacements.sort(
        (a, b) => at(b.range.start) - at(a.range.start),
      ))
        text =
          text.slice(0, at(r.range.start)) +
          r.content +
          text.slice(at(r.range.end))
      editors.get(key)!(text)
    }
    return true
  },
  asRelativePath: (uri: Uri) => uri.path.replace(/^\/ws\//, ""),
  getWorkspaceFolder: (uri: Uri) =>
    workspace.workspaceFolders?.find(f =>
      uri.path.startsWith(`${f.uri.path}/`),
    ),
  createFileSystemWatcher: () => ({
    onDidChange: on("watcher.change"),
    onDidCreate: on("watcher.create"),
    onDidDelete: on("watcher.delete"),
    dispose: () => {},
  }),
  onDidChangeTextDocument: on("onDidChangeTextDocument"),
  onDidCloseTextDocument: on("onDidCloseTextDocument"),
  onDidOpenTextDocument: on("onDidOpenTextDocument"),
  onDidChangeWorkspaceFolders: on("onDidChangeWorkspaceFolders"),
  onDidChangeConfiguration: on("onDidChangeConfiguration"),
  onDidRenameFiles: on("onDidRenameFiles"),
}
