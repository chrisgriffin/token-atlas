/**
 * A workspace-wide index of design tokens, used by the language features
 * (completion, hover, definition, references) to resolve references across
 * files. Every JSON file is a candidate by default and a cheap content sniff
 * decides, so detection doesn't depend on a filename convention.
 */
import * as vscode from "vscode"
import {
  findNodeAtLocation,
  parse,
  parseTree,
  type ParseError,
} from "jsonc-parser"
import {
  hasExtends,
  indexTokens,
  looksLikeResolver,
  parseResolver,
  parseTokens,
  inlineSources,
  pointerTarget,
  type Fragment,
  resolveAliases,
  resolutionSources,
  type Resolver,
  type TokenDocumentModel,
  type TokenNode,
} from "../core"

export interface IndexedToken {
  token: TokenNode
  uri: vscode.Uri
  /**
   * Where the token's source sits in `uri` when it is not the whole file: a
   * fragment, or tokens inline in a resolver. Its key is at `[...base, ...path]`.
   */
  base?: Array<string | number>
}

const DEFAULT_GLOBS = ["**/*.json", "**/*.tokens"]
const DEFAULT_EXCLUDE = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/out/**",
  "**/coverage/**",
  "**/.next/**",
  "**/.vscode-test/**",
  "**/package.json",
  "**/package-lock.json",
  "**/tsconfig*.json",
]
/** Discovery never reads a file bigger than this from disk: data dumps, not tokens. */
const MAX_SCAN_BYTES = 2 * 1024 * 1024

/**
 * Documents the token language features register for; each provider still
 * gates on isTokenDocument. No scheme filter: the manifest declares virtual
 * workspace support, so token files over vscode-vfs / Remote Repositories get
 * the same features.
 */
export const TOKEN_SELECTOR: vscode.DocumentSelector = [
  { language: "json" },
  { language: "jsonc" },
  { pattern: "**/*.tokens" },
]

/**
 * A file the scan found: its current text (the open buffer's, or the disk's),
 * and `good`, the last of that text with no JSON syntax error, which is what
 * the index resolves against. Half-typed JSON in one file must not make every
 * other file's references into it unresolved.
 */
interface ScannedFile {
  uri: vscode.Uri
  text: string
  good: string
}

/**
 * Every file the include globs matched at the last scan, token file or not:
 * the files an edit can move into or out of the index without a rescan.
 */
let candidates: Set<string> | undefined
let fileCache: ScannedFile[] | undefined
/** DTCG resolver documents found by the same scan; never token files themselves. */
let resolverCache: ScannedFile[] | undefined
/** The scan in flight, shared by every caller that arrives while it runs. */
let scanning: Promise<Scanned> | undefined
/**
 * Bumped on every full rescan. A scan that started before the bump must not
 * store its result — it may list files that are gone — so it captures the
 * generation up front and only stores while it is still current.
 */
let scanGeneration = 0
/** The index, derived from the files above and the active set. */
let cache: Map<string, IndexedToken> | undefined
/** The index build in flight, shared like the scan. */
let building: Promise<Map<string, IndexedToken>> | undefined
/** Edits arrive per keystroke; listeners hear about them once per pause. */
const TYPING_PAUSE_MS = 100
let pending: ReturnType<typeof setTimeout> | undefined

interface Scanned {
  files: ScannedFile[]
  resolvers: ScannedFile[]
}

/**
 * The active token set: which files — and which top-level groups within them —
 * contribute keys to the index, and so which definition a `{reference}`
 * resolves to where several define the same path (multi-brand, multi-theme).
 *
 * An entry is either a file URI, meaning the whole file, or `<uri>#<group>`,
 * meaning one top-level group of it: that is how a Tokens Studio theme names
 * its sets. A resolver resolution adds `<uri>#/<json pointer>`: one object in
 * a file, or in the resolver itself, whose children are the source's paths. Empty means everything, which is the default and the behaviour
 * before there was a choice. `activeSet.ts` owns choosing it; the index owns
 * what it means.
 */
let active: string[] = []
/**
 * True when `active` is in precedence order, highest first: a DTCG resolver
 * resolution, where a later source overrides an earlier one. Then the index
 * visits files in that order instead of URI order, so the source the
 * resolver puts last wins a shared path.
 */
let ordered = false

/** True when any part of `uri` contributes to the workspace index. */
export function isActive(uri: vscode.Uri): boolean {
  const key = uri.toString()
  return (
    active.length === 0 ||
    active.some(e => e === key || e.startsWith(`${key}#`))
  )
}

/**
 * Which of `uri`'s own keys may satisfy a reference written in `uri` itself,
 * or undefined when all of them may. Hands `resolveAliases` the same scoping
 * the index applies, so a reference into a set the active theme disables is
 * unresolved wherever it is written.
 */
export function localScopeFor(
  uri: vscode.Uri,
): ((key: string) => boolean) | undefined {
  const groups = activeGroupsFor(uri)
  return groups ? key => groups.includes(key.split(".")[0]) : undefined
}

/**
 * The top-level groups of `uri` that contribute, or undefined when the whole
 * file does.
 */
export function activeGroupsFor(uri: vscode.Uri): string[] | undefined {
  const key = uri.toString()
  if (active.length === 0 || active.includes(key)) return undefined
  const groups = active
    .filter(e => e.startsWith(`${key}#`) && !e.startsWith(`${key}#/`))
    .map(e => e.slice(key.length + 1))
  return groups.length ? groups : undefined
}

export function activeSet(): readonly string[] {
  return active
}

export function activeSetOrdered(): boolean {
  return ordered
}

/** A resolver resolution as picked: the resolver's URI and its modifier input. */
export interface ResolutionArg {
  resolver: string
  input?: Record<string, string>
}

/**
 * The resolver resolution the active set is, when it is one. Its sources are
 * re-read from the resolver's current text whenever that changes, so editing
 * the active resolver takes effect without picking it again.
 */
let resolution: ResolutionArg | undefined

export function activeResolution(): Readonly<ResolutionArg> | undefined {
  return resolution
}

/**
 * Make `next` the active set; `chosen` when it is a resolver resolution, whose
 * sources then follow the resolver's text (`next` stands until it is read).
 */
export function setActiveSet(
  next: readonly string[],
  inOrder = false,
  chosen?: ResolutionArg,
): void {
  active = [...next]
  ordered = inOrder && active.length > 0
  resolution = chosen
  syncResolution()
  indexChanged(true) // re-resolve everything against the new set
}

/** Re-read the active resolution's sources from its resolver's last good text. */
function syncResolution(): void {
  if (!resolution) return
  const doc = resolverCache?.find(
    r => r.uri.toString() === resolution!.resolver,
  )
  const resolver = doc && parseResolver(doc.good).resolver
  if (!resolver) return // not scanned yet, or gone: keep the sources it had
  active = entriesFor(doc.uri, resolver, resolution.input ?? {})
  ordered = active.length > 0
}

/**
 * A resolution's sources as active-set entries, highest precedence first: a
 * file URI, or `<uri>#/pointer` for part of a file or tokens inline in the
 * resolver.
 */
export function entriesFor(
  uri: vscode.Uri,
  resolver: Resolver,
  input: Record<string, string>,
): string[] {
  const dir = vscode.Uri.joinPath(uri, "..")
  return resolutionSources(resolver, input)
    .map(ref => {
      const hash = ref.indexOf("#")
      if (hash === 0) return `${uri.toString()}${ref}`
      const file = vscode.Uri.joinPath(
        dir,
        hash === -1 ? ref : ref.slice(0, hash),
      ).toString()
      return hash === -1 ? file : `${file}${ref.slice(hash)}`
    })
    .reverse()
}

const invalidated = new vscode.EventEmitter<void>()
/**
 * Fires whenever the set of token files or their text may have changed: an
 * edit in an editor, a write on disk (git checkout, another tool), a glob or
 * workspace-folder change. Anything showing workspace tokens refreshes on
 * this rather than guessing at the triggers itself. Typing is reported once
 * it pauses, not per keystroke.
 */
export const onDidInvalidateWorkspaceIndex = invalidated.event

/** Rescan the workspace: the globs, the folders or the files on disk changed. */
export function invalidateWorkspaceIndex(): void {
  candidates = fileCache = resolverCache = scanning = undefined
  scanGeneration++
  indexChanged(true)
}

/**
 * The index's inputs changed: derive it again on the next query, from the
 * files already in memory. `now` tells listeners straight away; otherwise
 * once typing pauses.
 */
function indexChanged(now: boolean): void {
  cache = building = undefined
  clearTimeout(pending)
  if (now) invalidated.fire()
  else pending = setTimeout(() => invalidated.fire(), TYPING_PAUSE_MS)
}

/** `tokenAtlas.include` for the workspace folder `scope` is in. */
export function includeGlobs(scope?: vscode.Uri): string[] {
  const configured = vscode.workspace
    .getConfiguration("tokenAtlas", scope)
    .get<string[]>("include")
  return configured && configured.length ? configured : DEFAULT_GLOBS
}

/**
 * Files to keep out of workspace discovery — generated output, vendored
 * copies, a second brand you do not want resolving into aliases here. An
 * empty array is honoured (nothing excluded); only an unset value falls back
 * to the default. Scanning only: a file you open directly still gets hovers,
 * validation and the visual editor.
 */
export function excludeGlobs(): string[] {
  const configured = vscode.workspace
    .getConfiguration("tokenAtlas")
    .get<string[]>("exclude")
  return configured ?? DEFAULT_EXCLUDE
}

/** Cheap DTCG fingerprint — avoids parsing every JSON file in the workspace. */
export function looksLikeTokens(text: string): boolean {
  return text.includes('"$value"') || text.includes('"$type"')
}

/** A file's text from disk, or undefined when it is over the size cap or unreadable. */
export async function readCapped(uri: vscode.Uri): Promise<string | undefined> {
  try {
    if ((await vscode.workspace.fs.stat(uri)).size > MAX_SCAN_BYTES)
      return undefined
    return Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8")
  } catch {
    return undefined
  }
}

/**
 * Named with the DTCG format's own extension, `.tokens` or `.tokens.json`: a
 * token file by declaration, even before it holds a `$value` (a file "New
 * Token File" just created is `{}`).
 */
function hasTokenExtension(uri: vscode.Uri): boolean {
  return uri.path.endsWith(".tokens") || uri.path.endsWith(".tokens.json")
}

/**
 * The one "is this a token file" check every provider uses (CLAUDE.md
 * invariant 3): a file with a token extension, or JSON/JSONC whose content
 * sniffs as DTCG. Language is checked before text so ordinary keystrokes in
 * other files cost nothing.
 */
export function isTokenDocument(document: vscode.TextDocument): boolean {
  if (hasTokenExtension(document.uri)) return true
  if (document.languageId !== "json" && document.languageId !== "jsonc")
    return false
  const text = document.getText()
  // A resolver document can hold inline tokens, but it is not a token file.
  return looksLikeTokens(text) && !looksLikeResolver(text)
}

/**
 * The tokens around `offset` that rename and find-references work on: the
 * whole token document, or the inline source in a resolver the offset is in.
 */
export function tokenScopeAt(
  document: vscode.TextDocument,
  offset: number,
): Fragment | undefined {
  if (isTokenDocument(document))
    return { text: document.getText(), path: [], offset: 0 }
  if (!isResolverDocument(document)) return undefined
  return inlineSources(document.getText()).find(
    s => offset >= s.offset && offset <= s.offset + s.text.length,
  )
}

/** A DTCG resolver document (`resolver.ts`): JSON with a `resolutionOrder`. */
export function isResolverDocument(document: vscode.TextDocument): boolean {
  if (hasTokenExtension(document.uri)) return false
  if (document.languageId !== "json" && document.languageId !== "jsonc")
    return false
  return looksLikeResolver(document.getText())
}

/**
 * Every token file in the workspace (include globs, confirmed by the content
 * sniff) with its text — the open buffer when the file is open in the editor
 * (so unsaved edits count, invariant 4), disk otherwise. This is the enumeration to use for anything
 * that must visit *every* file — rename, find-references — because the index
 * below is first-file-wins per key and a file contributing no winning key is
 * absent from it. Sorted by URI, so "first" is the same file on every rescan.
 * Scanned once; after that an edit or a write replaces only its own file's
 * entry, so typing never searches the workspace or reads it from disk.
 */
export async function findTokenFiles(): Promise<
  Array<{ uri: vscode.Uri; text: string }>
> {
  return (await scanned()).files
}

/** Every DTCG resolver document in the workspace, found by the same scan. */
export async function findResolverFiles(): Promise<
  Array<{ uri: vscode.Uri; text: string }>
> {
  return (await scanned()).resolvers
}

function scanned(): Promise<Scanned> {
  if (fileCache && resolverCache) {
    return Promise.resolve({ files: fileCache, resolvers: resolverCache })
  }
  if (!scanning) {
    const scan = scanWorkspace()
    scanning = scan
    void scan.then(() => {
      if (scanning === scan) scanning = undefined
    })
  }
  return scanning
}

async function scanWorkspace(): Promise<Scanned> {
  const gen = scanGeneration
  const uris = await discover()
  if (!uris) return { files: [], resolvers: [] } // the search failed: try again next time
  const disk = new Map<string, string>()
  for (const uri of uris) {
    const text = await readCapped(uri)
    if (text !== undefined) disk.set(uri.toString(), text)
  }
  // Open buffers are read here, after the last await, so an edit typed while
  // the scan ran is in its result rather than lost to it.
  const files: ScannedFile[] = []
  const resolvers: ScannedFile[] = []
  for (const uri of uris) {
    const text = openText(uri) ?? disk.get(uri.toString())
    if (text === undefined) continue
    const entry = { uri, text, good: text }
    const kind = classify(uri, text)
    if (kind === "tokens") files.push(entry)
    else if (kind === "resolver") resolvers.push(entry)
  }
  if (gen === scanGeneration) {
    candidates = new Set(uris.map(u => u.toString()))
    fileCache = files
    resolverCache = resolvers
    syncResolution()
  }
  return { files, resolvers }
}

/**
 * The include globs' matches, folder by folder with each folder's own
 * `tokenAtlas.include`, in code-point order; undefined when the search fails.
 */
async function discover(): Promise<vscode.Uri[] | undefined> {
  const exclude = excludeGlobs()
  try {
    const found = await Promise.all(
      (vscode.workspace.workspaceFolders ?? []).map(folder =>
        vscode.workspace.findFiles(
          new vscode.RelativePattern(
            folder,
            `{${includeGlobs(folder.uri).join(",")}}`,
          ),
          exclude.length ? `{${exclude.join(",")}}` : null,
        ),
      ),
    )
    const unique = new Map(found.flat().map(u => [u.toString(), u]))
    // findFiles has no stable order, and the index is first-file-wins: without
    // a sort, a rescan can hand a shared path to a different file.
    // Code-point order, not localeCompare: collation differs by locale and the
    // winner must be the same file on every machine.
    return [...unique.values()].sort(byUri)
  } catch {
    return undefined
  }
}

function byUri(a: { toString(): string }, b: { toString(): string }): number {
  return a.toString() < b.toString() ? -1 : a.toString() > b.toString() ? 1 : 0
}

function openText(uri: vscode.Uri): string | undefined {
  const key = uri.toString()
  return vscode.workspace.textDocuments
    .find(d => d.uri.toString() === key)
    ?.getText()
}

/** Which list a discovered file belongs in, if either. */
function classify(
  uri: vscode.Uri,
  text: string,
): "tokens" | "resolver" | undefined {
  if (hasTokenExtension(uri)) return "tokens"
  if (looksLikeResolver(text)) return "resolver"
  if (looksLikeTokens(text)) return "tokens"
  return undefined
}

/** True for text that is not yet JSON again: a key half typed, a brace missing. */
function hasSyntaxErrors(text: string): boolean {
  if (!text.trim()) return false
  const errors: ParseError[] = []
  parse(text, errors, { allowTrailingComma: true })
  return errors.length > 0
}

/**
 * Replace one discovered file's entry with `text` (undefined: the file is
 * gone), moving it between the token and resolver lists as its content now
 * says. False when nothing the index or its enumerations hold changed.
 */
function updateFile(uri: vscode.Uri, text: string | undefined): boolean {
  const key = uri.toString()
  if (!candidates?.has(key) || !fileCache || !resolverCache) return false
  const same = (f: ScannedFile) => f.uri.toString() === key
  const wasResolver = resolverCache.find(same)
  const was = fileCache.find(same) ?? wasResolver
  if (was?.text === text) return false
  const broken =
    text !== undefined && was !== undefined && hasSyntaxErrors(text)
  // Mid-edit, a file stays in the list it was in, resolving to its last good text.
  const kind =
    text === undefined
      ? undefined
      : broken
        ? wasResolver
          ? "resolver"
          : "tokens"
        : classify(uri, text)
  if (!was && !kind) return false
  fileCache = fileCache.filter(f => !same(f))
  resolverCache = resolverCache.filter(f => !same(f))
  if (text !== undefined && kind) {
    const entry = { uri, text, good: broken ? was!.good : text }
    if (kind === "tokens")
      fileCache = [...fileCache, entry].sort((a, b) => byUri(a.uri, b.uri))
    else
      resolverCache = [...resolverCache, entry].sort((a, b) =>
        byUri(a.uri, b.uri),
      )
  }
  if (text === undefined) candidates.delete(key)
  if (resolution?.resolver === key) syncResolution()
  return true
}

/**
 * `files` in the order the index visits them: URI order, or, for a resolver
 * resolution, the active set's precedence order with every other file after.
 * The index is first-file-wins, so whichever comes first here wins a path.
 */
export function inPrecedenceOrder<T extends { uri: vscode.Uri }>(
  files: readonly T[],
): T[] {
  if (!ordered) return [...files]
  const rank = (f: T) => {
    const key = f.uri.toString()
    const i = active.findIndex(e => e === key || e.startsWith(`${key}#`))
    return i === -1 ? active.length : i
  }
  // Array.prototype.sort is stable, so unranked files keep URI order.
  return [...files].sort((a, b) => rank(a) - rank(b))
}

/**
 * Keys from the active token set only (see `activeSet.ts`): a file the user
 * has switched off must not win a path, or picking a brand would change
 * nothing.
 */
export function buildWorkspaceIndex(): Promise<Map<string, IndexedToken>> {
  if (cache) return Promise.resolve(cache)
  if (!building) {
    const build = deriveIndex()
    building = build
    void build.then(() => {
      if (building === build) building = undefined
    })
  }
  return building
}

async function deriveIndex(): Promise<Map<string, IndexedToken>> {
  const { files, resolvers } = await scanned()
  // Nothing awaits from here on, so the index is built from the files as they
  // are now — an edit that landed during the scan included — and kept unless
  // a rescan has since thrown those files away.
  const map = indexFrom(fileCache ?? files, resolverCache ?? resolvers)
  if (fileCache) cache = map
  return map
}

function indexFrom(
  files: ScannedFile[],
  resolvers: ScannedFile[],
): Map<string, IndexedToken> {
  const map = new Map<string, IndexedToken>()
  const extending: Extending[] = []
  if (ordered) {
    // A resolver resolution: its sources in order, each a file or part of one.
    const known = [...files, ...resolvers]
    for (const entry of active) {
      const hash = entry.indexOf("#")
      const key = hash === -1 ? entry : entry.slice(0, hash)
      // Only files discovery already found, so tokenAtlas.exclude still holds.
      const file = known.find(f => f.uri.toString() === key)
      if (!file) continue
      const { uri, good: text } = file
      const target =
        hash === -1
          ? { text, path: [] }
          : pointerTarget(text, entry.slice(hash + 1))
      if (!target) continue
      const model = parseTokens(target.text)
      resolveAliases(model)
      const label =
        vscode.workspace.asRelativePath(uri) +
        (hash === -1 ? "" : entry.slice(hash))
      const base = target.path.length ? target.path : undefined
      for (const [k, token] of indexTokens(model)) {
        if (map.has(k)) continue
        token.sourceFile = label
        map.set(k, { token, uri, base })
      }
      if (hasExtends(model.root)) extending.push({ model, uri, label, base })
    }
    extendAcrossFiles(map, extending)
    return map
  }
  for (const { uri, good: text } of files) {
    if (!isActive(uri)) continue
    const groups = activeGroupsFor(uri)
    const model = parseTokens(text)
    // Within-file resolution, so external tokens carry resolvedValue — scoped
    // the same way, or a disabled set would leak in through a sibling's value.
    resolveAliases(model, undefined, localScopeFor(uri))
    const label = vscode.workspace.asRelativePath(uri)
    for (const [key, token] of indexTokens(model)) {
      // A theme's sets are this file's top-level groups; one it leaves out
      // defines nothing as far as the rest of the workspace is concerned.
      if (groups && !groups.includes(token.path[0])) continue
      if (!map.has(key)) {
        token.sourceFile = label
        map.set(key, { token, uri })
      }
    }
    if (hasExtends(model.root)) {
      extending.push({ model, uri, label, groups, scope: localScopeFor(uri) })
    }
  }
  extendAcrossFiles(map, extending)
  return map
}

interface Extending {
  model: TokenDocumentModel
  uri: vscode.Uri
  label: string
  base?: Array<string | number>
  groups?: string[]
  scope?: (key: string) => boolean
}

/**
 * A group extending one in another file (`$extends`) only fills in once that
 * file is indexed, so each such file is re-resolved against the rest of the
 * index, round after round while that adds tokens: a chain across several
 * files fills in whatever order they were scanned in.
 */
function extendAcrossFiles(
  map: Map<string, IndexedToken>,
  files: Extending[],
): void {
  for (let round = 0; round < files.length; round++) {
    let added = false
    for (const f of files) {
      const external = new Map<string, TokenNode>()
      for (const [key, hit] of map)
        if (hit.uri.toString() !== f.uri.toString())
          external.set(key, hit.token)
      for (const [key, token] of resolveAliases(f.model, external, f.scope)) {
        if (!token.inheritedFrom || map.has(key)) continue
        if (f.groups && !f.groups.includes(token.path[0])) continue
        token.sourceFile = f.label
        map.set(key, { token, uri: f.uri, base: f.base })
        added = true
      }
    }
    if (!added) break
  }
}

/**
 * Every indexed token except those from `current` — the external map that
 * diagnostics and the visual editor resolve and validate against.
 */
export async function externalIndexFor(
  current: vscode.Uri,
): Promise<Map<string, TokenNode>> {
  const out = new Map<string, TokenNode>()
  for (const [key, hit] of await buildWorkspaceIndex()) {
    if (hit.uri.toString() !== current.toString()) out.set(key, hit.token)
  }
  return out
}

/** Range of a token/group's key (for go-to-definition target highlighting). */
export function keyRange(
  document: vscode.TextDocument,
  path: Array<string | number>,
): vscode.Range | undefined {
  const root = parseTree(document.getText())
  if (!root) return undefined
  const node = findNodeAtLocation(root, path)
  const keyNode = node?.parent?.children?.[0]
  const target = keyNode ?? node
  if (!target) return undefined
  return new vscode.Range(
    document.positionAt(target.offset),
    document.positionAt(target.offset + target.length),
  )
}

/**
 * Location of an indexed token's key in its file (go-to-definition target).
 * A token a group has through `$extends` has no key there: it goes to the
 * token it was copied from.
 */
export async function definitionLocation(
  hit: IndexedToken,
): Promise<vscode.Location> {
  if (hit.token.inheritedFrom)
    return originLocation(hit.uri, hit.token.inheritedFrom)
  const doc = await vscode.workspace.openTextDocument(hit.uri)
  const r = keyRange(doc, [...(hit.base ?? []), ...hit.token.path])
  return new vscode.Location(hit.uri, r ?? new vscode.Position(0, 0))
}

/**
 * Where the token at `key` is defined, as seen from `uri`: its key in `uri`
 * itself (local first), else the workspace index's definition. For an
 * inherited token's origin, which is never itself inherited.
 */
export async function originLocation(
  uri: vscode.Uri,
  key: string,
): Promise<vscode.Location> {
  const doc = await vscode.workspace.openTextDocument(uri)
  const here = keyRange(doc, key.split("."))
  if (here) return new vscode.Location(uri, here)
  const hit = (await buildWorkspaceIndex()).get(key)
  return hit && !hit.token.inheritedFrom
    ? definitionLocation(hit)
    : new vscode.Location(uri, new vscode.Position(0, 0))
}

/** Full range (key through value) of a node, for symbols / reference results. */
export function memberRange(
  document: vscode.TextDocument,
  path: Array<string | number>,
): { full: vscode.Range; selection: vscode.Range } | undefined {
  const root = parseTree(document.getText())
  if (!root) return undefined
  const node = findNodeAtLocation(root, path)
  if (!node) return undefined
  const keyNode = node.parent?.children?.[0] ?? node
  const selection = new vscode.Range(
    document.positionAt(keyNode.offset),
    document.positionAt(keyNode.offset + keyNode.length),
  )
  const full = new vscode.Range(
    document.positionAt(keyNode.offset),
    document.positionAt(node.offset + node.length),
  )
  return { full, selection }
}

export function registerIndexInvalidation(
  context: vscode.ExtensionContext,
): void {
  // The watchers are built from each folder's include globs, so they are
  // rebuilt whenever those or the folders change — otherwise a new glob's
  // files would never be seen. Those globs match every JSON file, so a write
  // to a file the scan did not find only rescans when it holds tokens: a
  // build emitting JSON or an edited package.json must not rescan the
  // workspace. A write to a file it did find replaces that file's entry.
  //
  // A file created after the scan with no tokens yet (New File → colors.json)
  // is not a candidate, so its keystrokes cannot reach updateFile. It is
  // remembered instead, and the first edit that makes it a token or resolver
  // document rescans once — the scan, not this watcher, applies
  // tokenAtlas.exclude — after which it is a candidate like any other.
  let watchers: vscode.FileSystemWatcher[] = []
  const created = new Set<string>()
  const written = async (uri: vscode.Uri, isNew = false) => {
    if (candidates?.has(uri.toString())) {
      if (openText(uri) !== undefined) return // the open buffer speaks for it
      if (updateFile(uri, await readCapped(uri))) indexChanged(false)
      return
    }
    const text = hasTokenExtension(uri) ? "" : ((await readCapped(uri)) ?? "")
    if (
      hasTokenExtension(uri) ||
      looksLikeTokens(text) ||
      looksLikeResolver(text)
    ) {
      created.delete(uri.toString())
      invalidateWorkspaceIndex()
    } else if (isNew) {
      created.add(uri.toString())
    }
  }
  const deleted = (uri: vscode.Uri) => {
    const key = uri.toString()
    created.delete(key)
    if (candidates?.has(key)) {
      if (updateFile(uri, undefined)) indexChanged(false)
    } else if (
      !candidates ||
      [...candidates].some(c => c.startsWith(`${key}/`))
    ) {
      invalidateWorkspaceIndex() // a folder with discovered files in it
    }
  }
  const watch = () => {
    for (const w of watchers) w.dispose()
    watchers = (vscode.workspace.workspaceFolders ?? []).map(folder => {
      const w = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(
          folder,
          `{${includeGlobs(folder.uri).join(",")}}`,
        ),
      )
      w.onDidChange(written)
      w.onDidCreate(uri => written(uri, true))
      w.onDidDelete(deleted)
      return w
    })
  }
  watch()
  context.subscriptions.push(
    { dispose: () => watchers.forEach(w => w.dispose()) },
    { dispose: () => clearTimeout(pending) },
    invalidated,
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      invalidateWorkspaceIndex()
      watch()
    }),
    vscode.workspace.onDidChangeTextDocument(({ document }) => {
      // A discovered file's entry follows its buffer, keystroke by keystroke;
      // any other token document (untitled, outside the globs) is not in the
      // index, but whatever shows it still needs telling. isTokenDocument
      // checks languageId before reading text, so keystrokes in non-JSON
      // files cost nothing here.
      const key = document.uri.toString()
      const found =
        candidates?.has(key) && updateFile(document.uri, document.getText())
      const tokens =
        found || isTokenDocument(document) || isResolverDocument(document)
      if (tokens && !found && created.delete(key)) invalidateWorkspaceIndex()
      else if (tokens) indexChanged(false)
    }),
    // A buffer closed without saving takes its edits with it: the file on
    // disk is what the index holds again.
    vscode.workspace.onDidCloseTextDocument(async ({ uri }) => {
      if (!candidates?.has(uri.toString())) return
      const text = await readCapped(uri)
      if (openText(uri) === undefined && updateFile(uri, text))
        indexChanged(false)
    }),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (
        e.affectsConfiguration("tokenAtlas.include") ||
        e.affectsConfiguration("tokenAtlas.exclude")
      ) {
        invalidateWorkspaceIndex()
        watch()
      }
    }),
  )
}

/**
 * The token or group a right-click in the visual editor acted on (spec 022).
 * VS Code passes a `webview/context` command the merged `data-vscode-context`
 * of the element clicked: the editor's root gives `uri`, the row or heading
 * `path`. Anything else — a command's own arguments, none — is undefined.
 */
export function rowTarget(
  arg: unknown,
): { uri: vscode.Uri; path: string[] } | undefined {
  if (typeof arg !== "object" || arg === null) return undefined
  const { uri, path } = arg as { uri?: unknown; path?: unknown }
  if (typeof uri !== "string" || !uri || !Array.isArray(path)) return undefined
  return { uri: vscode.Uri.parse(uri), path: path.map(String) }
}
