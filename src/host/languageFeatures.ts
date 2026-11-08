/**
 * In-editor language features for design-token JSON: completion, hover,
 * go-to-definition, find-references, document symbols, workspace symbols and
 * inlay hints with each alias's resolved value.
 *
 * All providers are registered for JSON but **content-gated** — they no-op
 * unless the document looks like DTCG tokens — so they never pollute ordinary
 * JSON files, and they work regardless of filename convention.
 */
import * as vscode from "vscode"
import {
  getLocation,
  parseTree,
  findNodeAtLocation,
  type Node,
} from "jsonc-parser"
import {
  ALL_TYPES,
  collectReferences,
  deprecation,
  fuzzyMatches,
  hoverMarkdown,
  inlayValue,
  inlineSources,
  indexTokens,
  isReference,
  parseTokens,
  referenceTarget,
  resolveValue,
  tokenReferenceAtOffset,
  type Fragment,
  type GroupNode,
  type TokenNode,
  type TokenType,
} from "../core"
import { COLOR_SPACES, type ContrastTarget } from "../core/color"
import {
  localScopeFor,
  buildWorkspaceIndex,
  definitionLocation,
  findResolverFiles,
  findTokenFiles,
  isResolverDocument,
  isTokenDocument,
  keyRange,
  memberRange,
  onDidInvalidateWorkspaceIndex,
  originLocation,
  tokenScopeAt,
  TOKEN_SELECTOR as SELECTOR,
  type IndexedToken,
} from "./workspaceIndex"
import { codeUsages } from "./codeUsages"
import {
  aliasCandidates,
  aliasCompletionContext,
  describeValue,
  expectedTypeAt,
  resolveAliases,
  type AliasContext,
} from "../core"
import { toHex } from "../core/color"

/** Reduce a jsonc location path to the enclosing token/group path. */
function toNodePath(path: ReadonlyArray<string | number>): string[] {
  const out: string[] = []
  for (const seg of path) {
    if (typeof seg !== "string") break // array index → stop (inside a composite value)
    if (seg.startsWith("$")) break
    out.push(seg)
  }
  return out
}

// ---------------------------------------------------------------- completion
class TokenCompletionProvider implements vscode.CompletionItemProvider {
  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    cancel: vscode.CancellationToken,
  ) {
    if (!isTokenDocument(document)) return
    const text = document.getText()
    const offset = document.offsetAt(position)
    const loc = getLocation(text, offset)
    const last = loc.path[loc.path.length - 1]

    if (last === "$type") {
      return ALL_TYPES.map(
        t => new vscode.CompletionItem(t, vscode.CompletionItemKind.EnumMember),
      )
    }
    if (last === "colorSpace") {
      return COLOR_SPACES.map(
        s => new vscode.CompletionItem(s, vscode.CompletionItemKind.EnumMember),
      )
    }
    // Value positions under a token's $value only — never a property key.
    const ctx = aliasCompletionContext(text, offset)
    if (ctx) return this.referenceCompletions(document, ctx, text, cancel)
    return undefined
  }

  /**
   * Alias suggestions for a `$value` string or any string inside a composite
   * value. Candidates are filtered to the type expected at that spot (the
   * token's type, or e.g. `color` for a shadow's `color`), never the token
   * itself, never a cycle. Items carry `{key}` as filter text: VS Code
   * filters by the text between the replace range's start and the cursor,
   * which begins with `{` once the user types an alias.
   */
  private async referenceCompletions(
    document: vscode.TextDocument,
    ctx: AliasContext,
    text: string,
    cancel: vscode.CancellationToken,
  ): Promise<vscode.CompletionItem[] | undefined> {
    const ws = await buildWorkspaceIndex()
    if (cancel.isCancellationRequested) return
    const here = document.uri.toString()
    const external = new Map<string, TokenNode>()
    for (const [key, hit] of ws)
      if (hit.uri.toString() !== here) external.set(key, hit.token)
    const model = parseTokens(text)
    const local = resolveAliases(model, external, localScopeFor(document.uri))
    const all = new Map<string, TokenNode>([...external, ...local]) // local wins

    const selfKey = ctx.tokenPath.join(".")
    const want = expectedTypeAt(local.get(selfKey)?.type, ctx.subPath)
    const candidates = aliasCandidates(all.values(), selfKey, want, all)

    const inString = ctx.inString
    const range =
      ctx.start !== undefined && ctx.end !== undefined
        ? new vscode.Range(
            document.positionAt(ctx.start),
            document.positionAt(ctx.end),
          )
        : undefined

    const lookup = (key: string) => all.get(key)
    return candidates.map(t => {
      const key = t.path.join(".")
      // A path this document defines is its own, whichever file won the index.
      const hit = local.has(key) ? undefined : ws.get(key)
      const file =
        hit && hit.uri.toString() !== here
          ? vscode.workspace.asRelativePath(hit.uri)
          : ""
      const type = t.resolvedType ?? t.type
      const shown = t.resolvedValue ?? resolveValue(t.value, lookup)
      const hex = type === "color" ? toHex(shown) : null
      const insert = inString ? `{${key}}` : `"{${key}}"`
      const item = new vscode.CompletionItem(
        { label: key, description: [type, file].filter(Boolean).join(" · ") },
        hex
          ? vscode.CompletionItemKind.Color
          : vscode.CompletionItemKind.Reference,
      )
      item.detail = describeValue(shown)
      // The suggest widget draws a swatch for Color items whose documentation is #rrggbb.
      if (hex) item.documentation = hex.slice(0, 7)
      item.insertText = insert
      item.filterText = insert
      item.sortText = `${file ? 1 : 0}${key}`
      if (deprecation(t)) item.tags = [vscode.CompletionItemTag.Deprecated]
      if (range) item.range = range
      return item
    })
  }
}

// --------------------------------------------------------------------- hover
class TokenHoverProvider implements vscode.HoverProvider {
  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    cancel: vscode.CancellationToken,
  ) {
    if (!isTokenDocument(document)) return
    const text = document.getText()
    const offset = document.offsetAt(position)
    const ws = await buildWorkspaceIndex()
    if (cancel.isCancellationRequested) return
    // Resolved, so the tokens a group has through `$extends` are here too.
    const local = resolveAliases(parseTokens(text), tokensOf(ws))
    // A set the active theme disables still has tokens worth hovering — you
    // may be editing them — but it satisfies no reference, here or anywhere.
    const scope = localScopeFor(document.uri)
    const live = scope
      ? new Map([...local].filter(([key]) => scope(key)))
      : local

    // If the cursor is on a token reference inside a $value context, show hover
    // for the *referenced* token rather than the defining token at this location.
    const refTarget = tokenReferenceAtOffset(text, offset)
    if (refTarget !== undefined) {
      const localToken = live.get(refTarget)
      const wsHit = localToken ? undefined : ws.get(refTarget)
      const token = localToken ?? wsHit?.token
      if (!token) return
      const node = getLocation(text, offset).previousNode
      const refRange = node
        ? new vscode.Range(
            document.positionAt(node.offset),
            document.positionAt(node.offset + node.length),
          )
        : undefined
      return buildTokenHover(
        token,
        live,
        ws,
        document.uri,
        refRange,
        wsHit?.uri,
      )
    }

    // Default: hover for the defining token whose key is under the cursor.
    const loc = getLocation(text, offset)
    const path = longestKnownPath(toNodePath(loc.path), local)
    if (!path) return
    const token = local.get(path)
    if (!token) return
    return buildTokenHover(
      token,
      live,
      ws,
      document.uri,
      keyRange(document, token.path),
    )
  }
}

/**
 * The hover card for a token. `local` is the index of the document being
 * hovered (empty when hovering exported code); `currentUri` is the document
 * hovered, which decides which alias hops get a file label and whose folder's
 * settings apply; `definedIn` adds a "Defined in" link when the token lives in
 * another file.
 */
export function buildTokenHover(
  token: TokenNode,
  local: Map<string, TokenNode>,
  ws: Map<string, IndexedToken>,
  currentUri: vscode.Uri | undefined,
  range: vscode.Range | undefined,
  definedIn?: vscode.Uri,
): vscode.Hover {
  let chain: ReturnType<typeof resolveChainWithSources> | undefined
  if (token.isAlias && token.reference) {
    chain = resolveChainWithSources(token.reference, local, ws, currentUri)
  }
  const resolvedComposite =
    !token.isAlias && collectReferences(token.value).length > 0
      ? resolveValue(token.value, key => local.get(key) ?? ws.get(key)?.token)
      : undefined

  // Resource-scoped: in a multi-root workspace each folder may set its own.
  const settings = vscode.workspace.getConfiguration("tokenAtlas", currentUri)
  const markdown = hoverMarkdown({
    name: token.name,
    path: token.path,
    type: token.type ?? chain?.final?.type,
    description: token.description,
    deprecated: deprecation(token),
    value: token.value,
    isAlias: token.isAlias,
    chain:
      chain?.hops ??
      (token.reference
        ? [{ key: token.reference, resolved: false }]
        : undefined),
    final: chain?.final?.value,
    resolvedComposite,
    inheritedFrom: token.inheritedFrom,
    rootPx: settings.get<number>("rootFontSize") ?? 16,
    contrastTarget: settings.get<ContrastTarget>("contrastTarget") ?? "AA",
    definedIn:
      definedIn && definedIn.toString() !== currentUri?.toString()
        ? {
            label: vscode.workspace.asRelativePath(definedIn),
            href: definedIn.toString(),
          }
        : undefined,
  })

  const md = new vscode.MarkdownString(markdown, true)
  md.supportHtml = true
  return new vscode.Hover(md, range)
}

// ---------------------------------------------------------------- definition
class TokenDefinitionProvider implements vscode.DefinitionProvider {
  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    cancel: vscode.CancellationToken,
  ) {
    if (!isTokenDocument(document)) return
    const text = document.getText()
    // Same detection hover uses: a whole-$value alias, a reference nested
    // inside a composite value (a shadow's color, a gradient stop), a `$ref`
    // pointer or an `$extends` value.
    const ref = tokenReferenceAtOffset(text, document.offsetAt(position))
    if (!ref) return
    const ws = await buildWorkspaceIndex()
    if (cancel.isCancellationRequested) return

    // Local first: this document's tokens, those it inherits included, which
    // go to the token they were copied from.
    const token = resolveAliases(parseTokens(text), tokensOf(ws)).get(ref)
    if (token) return originLocation(document.uri, token.inheritedFrom ?? ref)
    const hit = ws.get(ref)
    if (hit) return definitionLocation(hit)
    // An `$extends` names a group: its key here, else in the file the
    // workspace index has its tokens from.
    const here = keyRange(document, ref.split("."))
    if (here) return new vscode.Location(document.uri, here)
    const member = [...ws.values()].find(
      h =>
        !h.token.inheritedFrom && h.token.path.join(".").startsWith(ref + "."),
    )
    if (!member) return
    const doc = await vscode.workspace.openTextDocument(member.uri)
    const r = keyRange(doc, [...(member.base ?? []), ...ref.split(".")])
    return r ? new vscode.Location(member.uri, r) : undefined
  }
}

// ---------------------------------------------------------------- references
class TokenReferenceProvider implements vscode.ReferenceProvider {
  async provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.ReferenceContext,
    cancel: vscode.CancellationToken,
  ) {
    // A token document, or a source written inline in a resolver.
    const offset = document.offsetAt(position)
    const scope = tokenScopeAt(document, offset)
    if (!scope) return
    const local = indexTokens(parseTokens(scope.text))
    const at = getLocation(document.getText(), offset).path.slice(
      scope.path.length,
    )
    const path = longestKnownPath(toNodePath(at), local)
    if (!path) return

    const locations: vscode.Location[] = []
    const scan = (
      doc: vscode.TextDocument,
      text = doc.getText(),
      base: Array<string | number> = [],
    ) => {
      for (const t of indexTokens(parseTokens(text)).values()) {
        // Whole-$value aliases and references nested in composite sub-values.
        if (collectReferences(t.value).includes(path)) {
          const r = memberRange(doc, [...base, ...t.path])
          if (r) locations.push(new vscode.Location(doc.uri, r.selection))
        }
      }
    }

    if (isTokenDocument(document)) scan(document)
    // Every token file, not just index winners — same enumeration rename uses.
    for (const { uri } of await findTokenFiles()) {
      if (cancel.isCancellationRequested) return
      if (uri.toString() === document.uri.toString()) continue
      try {
        scan(await vscode.workspace.openTextDocument(uri))
      } catch {
        /* skip */
      }
    }
    // Tokens written inline in a resolver: never a token file, so not above.
    for (const { uri } of await findResolverFiles()) {
      if (cancel.isCancellationRequested) return
      try {
        const doc = await vscode.workspace.openTextDocument(uri)
        for (const s of inlineSources(doc.getText())) scan(doc, s.text, s.path)
      } catch {
        /* skip */
      }
    }
    // Exported code: `--color-brand-primary`, `colorBrandPrimary`, … matched
    // against the same keys hover and go-to-definition use there.
    const keys = new Set([
      ...(await buildWorkspaceIndex()).keys(),
      ...local.keys(),
    ])
    for (const usage of (await codeUsages(keys, cancel)).get(path) ?? []) {
      locations.push(usage.location)
    }
    return locations
  }
}

// ------------------------------------------------------------- doc symbols
class TokenSymbolProvider implements vscode.DocumentSymbolProvider {
  provideDocumentSymbols(
    document: vscode.TextDocument,
  ): vscode.DocumentSymbol[] {
    if (!isTokenDocument(document)) return []
    const text = document.getText()
    const root = parseTree(text)
    if (!root) return []
    const model = parseTokens(text)

    const build = (
      node: GroupNode | TokenNode,
    ): vscode.DocumentSymbol | undefined => {
      const valueNode = findNodeAtLocation(root, node.path)
      if (!valueNode) return undefined
      const keyNode = valueNode.parent?.children?.[0] ?? valueNode
      const selection = new vscode.Range(
        document.positionAt(keyNode.offset),
        document.positionAt(keyNode.offset + keyNode.length),
      )
      const full = new vscode.Range(
        document.positionAt(keyNode.offset),
        document.positionAt(valueNode.offset + valueNode.length),
      )
      if (node.kind === "group") {
        const symbol = new vscode.DocumentSymbol(
          node.name,
          "group",
          vscode.SymbolKind.Namespace,
          full,
          selection,
        )
        symbol.children = node.children
          .map(build)
          .filter((s): s is vscode.DocumentSymbol => s !== undefined)
        return symbol
      }
      return new vscode.DocumentSymbol(
        node.name,
        node.type ?? "",
        tokenSymbolKind(node),
        full,
        selection,
      )
    }

    return model.root.children
      .map(build)
      .filter((s): s is vscode.DocumentSymbol => s !== undefined)
  }
}

/** The symbol kind for a token in the outline and Go to Symbol in Workspace. */
function tokenSymbolKind(token: TokenNode): vscode.SymbolKind {
  return token.type === "color"
    ? vscode.SymbolKind.Variable
    : vscode.SymbolKind.Field
}

// ------------------------------------------------------- workspace symbols
/**
 * Go to Symbol in Workspace (Cmd+T): every indexed token whose dotted path
 * matches the query, landing on the token's key. The index is the active
 * set's winners, so a path several files define appears once.
 */
class TokenWorkspaceSymbolProvider implements vscode.WorkspaceSymbolProvider {
  async provideWorkspaceSymbols(
    query: string,
    cancel: vscode.CancellationToken,
  ): Promise<vscode.SymbolInformation[]> {
    const hits = new Map(await buildWorkspaceIndex())
    // Local first (invariant 4): the token document you are in wins a path it
    // defines, unsaved edits included, as it does for hover and definition.
    const active = vscode.window.activeTextEditor?.document
    if (active && isTokenDocument(active)) {
      for (const [key, token] of indexTokens(parseTokens(active.getText()))) {
        hits.set(key, { token, uri: active.uri })
      }
    }
    const byFile = new Map<string, Array<[string, IndexedToken]>>()
    for (const [key, hit] of hits) {
      // Only tokens with a key of their own: an `$extends` copy has none.
      if (hit.token.inheritedFrom || !fuzzyMatches(query, key)) continue
      const file = hit.uri.toString()
      if (!byFile.has(file)) byFile.set(file, [])
      byFile.get(file)!.push([key, hit])
    }
    const symbols: vscode.SymbolInformation[] = []
    for (const group of byFile.values()) {
      if (cancel.isCancellationRequested) return []
      const uri = group[0][1].uri
      let doc: vscode.TextDocument
      try {
        doc = await vscode.workspace.openTextDocument(uri)
      } catch {
        continue
      }
      // One parse per file, not one per token as keyRange would.
      const root = parseTree(doc.getText())
      const file = vscode.workspace.asRelativePath(uri)
      for (const [key, hit] of group) {
        const node =
          root &&
          findNodeAtLocation(root, [...(hit.base ?? []), ...hit.token.path])
        const keyNode = node?.parent?.children?.[0] ?? node
        const range = keyNode
          ? new vscode.Range(
              doc.positionAt(keyNode.offset),
              doc.positionAt(keyNode.offset + keyNode.length),
            )
          : new vscode.Range(0, 0, 0, 0)
        symbols.push(
          new vscode.SymbolInformation(
            key,
            tokenSymbolKind(hit.token),
            file,
            new vscode.Location(uri, range),
          ),
        )
      }
    }
    return symbols
  }
}

// ------------------------------------------------------------- inlay hints
/** Every string under `node` (itself included) that is a `{reference}`. */
function referenceStrings(node: Node | undefined, out: Node[] = []): Node[] {
  if (!node) return out
  if (node.type === "string" && isReference(node.value)) out.push(node)
  for (const child of node.children ?? []) referenceStrings(child, out)
  return out
}

/**
 * `= #0055ff` after each `{reference}` in a `$value`: the value it finally
 * resolves to, local first then the active set's workspace index, as hover
 * resolves it. An unresolved reference gets nothing; the Problems panel
 * already reports it. The tooltip is the hover card, built only for the hint
 * you point at.
 */
class TokenInlayHintsProvider implements vscode.InlayHintsProvider {
  private readonly changed = new vscode.EventEmitter<void>()
  readonly onDidChangeInlayHints = this.changed.event
  private readonly tooltips = new WeakMap<
    vscode.InlayHint,
    () => vscode.MarkdownString
  >()

  refresh(): void {
    this.changed.fire()
  }

  dispose(): void {
    this.changed.dispose()
  }

  async provideInlayHints(
    document: vscode.TextDocument,
    range: vscode.Range,
    cancel: vscode.CancellationToken,
  ): Promise<vscode.InlayHint[]> {
    if (
      !(
        vscode.workspace
          .getConfiguration("tokenAtlas")
          .get<boolean>("inlayHints") ?? true
      )
    ) {
      return []
    }
    // A token document, or each source written inline in a resolver.
    const fragments: Fragment[] = isTokenDocument(document)
      ? [{ text: document.getText(), path: [], offset: 0 }]
      : isResolverDocument(document)
        ? inlineSources(document.getText())
        : []
    if (!fragments.length) return []
    const ws = await buildWorkspaceIndex()
    if (cancel.isCancellationRequested) return []
    const scope = localScopeFor(document.uri)
    const start = document.offsetAt(range.start)
    const end = document.offsetAt(range.end)
    const hints: vscode.InlayHint[] = []
    for (const fragment of fragments) {
      const root = parseTree(fragment.text)
      if (!root) continue
      // Resolved, as hover is, so a reference to a token a group has through
      // `$extends` gets its value too.
      const local = resolveAliases(parseTokens(fragment.text), tokensOf(ws))
      const live = scope
        ? new Map([...local].filter(([key]) => scope(key)))
        : local
      const lookup = (key: string) => live.get(key) ?? ws.get(key)?.token
      for (const token of local.values()) {
        const valueNode = findNodeAtLocation(root, [...token.path, "$value"])
        for (const node of referenceStrings(valueNode)) {
          const at = fragment.offset + node.offset + node.length
          if (at < start || at > end) continue
          const resolved = resolveValue(node.value, lookup)
          if (isReference(resolved)) continue // dangling or a cycle
          const key = referenceTarget(node.value)!
          const target = lookup(key)!
          const type =
            target.resolvedType ??
            target.type ??
            (node === valueNode ? token.type : undefined)
          const hint = new vscode.InlayHint(
            document.positionAt(at),
            `= ${inlayValue(resolved, type)}`,
          )
          hint.paddingLeft = true
          const definedIn = live.has(key) ? undefined : ws.get(key)?.uri
          this.tooltips.set(
            hint,
            () =>
              buildTokenHover(
                target,
                live,
                ws,
                document.uri,
                undefined,
                definedIn,
              ).contents[0] as vscode.MarkdownString,
          )
          hints.push(hint)
        }
      }
    }
    return hints
  }

  resolveInlayHint(hint: vscode.InlayHint): vscode.InlayHint {
    const tooltip = this.tooltips.get(hint)
    if (tooltip) hint.tooltip = tooltip()
    return hint
  }
}

interface ChainHop {
  key: string
  /** Workspace-relative file the hop resolves in; undefined = the current file. */
  label?: string
  resolved: boolean
}

/**
 * Follow an alias chain, recording each hop and which file it lives in.
 * Local (current-document) tokens win over the workspace index, so unsaved
 * edits are honored and same-file hops carry no label.
 */
function resolveChainWithSources(
  startRef: string,
  local: Map<string, TokenNode>,
  ws: Map<string, IndexedToken>,
  currentUri: vscode.Uri | undefined,
): { hops: ChainHop[]; final?: { value: unknown; type?: TokenType } } {
  const hops: ChainHop[] = []
  const seen = new Set<string>()
  let key = startRef
  for (;;) {
    if (seen.has(key)) return { hops } // cycle — leave unresolved
    seen.add(key)
    const localToken = local.get(key)
    const wsHit = localToken ? undefined : ws.get(key)
    const token = localToken ?? wsHit?.token
    const external =
      wsHit !== undefined && wsHit.uri.toString() !== currentUri?.toString()
    hops.push({
      key,
      label: external ? vscode.workspace.asRelativePath(wsHit.uri) : undefined,
      resolved: token !== undefined,
    })
    if (!token) return { hops }
    if (!token.isAlias)
      return { hops, final: { value: token.value, type: token.type } }
    if (!token.reference) return { hops }
    key = token.reference
  }
}

/** The workspace index as the plain map `resolveAliases` takes as `external`. */
function tokensOf(ws: Map<string, IndexedToken>): Map<string, TokenNode> {
  return new Map([...ws].map(([key, hit]) => [key, hit.token]))
}

/** Longest prefix of `path` that names a token present in the index. */
function longestKnownPath(
  path: string[],
  index: Map<string, TokenNode>,
): string | undefined {
  for (let i = path.length; i > 0; i--) {
    const key = path.slice(0, i).join(".")
    if (index.has(key)) return key
  }
  return undefined
}

export function registerLanguageFeatures(
  context: vscode.ExtensionContext,
): void {
  const inlayHints = new TokenInlayHintsProvider()
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      SELECTOR,
      new TokenCompletionProvider(),
      "{",
      ".",
      '"',
    ),
    vscode.languages.registerHoverProvider(SELECTOR, new TokenHoverProvider()),
    vscode.languages.registerDefinitionProvider(
      SELECTOR,
      new TokenDefinitionProvider(),
    ),
    vscode.languages.registerReferenceProvider(
      SELECTOR,
      new TokenReferenceProvider(),
    ),
    vscode.languages.registerDocumentSymbolProvider(
      SELECTOR,
      new TokenSymbolProvider(),
    ),
    vscode.languages.registerWorkspaceSymbolProvider(
      new TokenWorkspaceSymbolProvider(),
    ),
    vscode.languages.registerInlayHintsProvider(SELECTOR, inlayHints),
    inlayHints,
    // Token edits, writes on disk and active-set changes all invalidate the index.
    onDidInvalidateWorkspaceIndex(() => inlayHints.refresh()),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration("tokenAtlas")) inlayHints.refresh()
    }),
  )
}
