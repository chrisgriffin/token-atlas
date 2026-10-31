/**
 * "Design Tokens" view in the side bar: every token file in the workspace as a
 * root, each expanding into its groups and tokens. It costs no editor width,
 * is resizable, and works for the text editor as well as the visual one.
 *
 * The tree is workspace-wide rather than active-file-only so the panel is a
 * way *into* a file, not a reflection of the one already open; the file you
 * are looking at is the one expanded.
 */
import * as vscode from "vscode"
import {
  countTokens,
  createParseCache,
  describeValue,
  resolveAliases,
  type GroupNode,
  type TokenNode,
} from "../core"
import {
  buildWorkspaceIndex,
  findTokenFiles,
  isActive,
  isTokenDocument,
  localScopeFor,
  keyRange,
  onDidInvalidateWorkspaceIndex,
} from "./workspaceIndex"
import { TokenEditorProvider } from "./tokenEditorProvider"
import { defaultsToVisual, openInVisualEditor } from "./defaultEditor"
import { TYPE_CODICONS } from "./typeCodicons"

type Node = GroupNode | TokenNode
/** A file root (`node` absent), or a group/token inside that file. */
interface Item {
  uri: vscode.Uri
  node?: Node
}

interface TokenFile {
  uri: vscode.Uri
  label: string
  root: GroupNode | undefined
}

class TokenTreeProvider implements vscode.TreeDataProvider<Item> {
  private readonly changed = new vscode.EventEmitter<Item | undefined>()
  readonly onDidChangeTreeData = this.changed.event

  private files: TokenFile[] = []
  /** The file in view, expanded by default. */
  private active: string | undefined

  /** Untouched files keep their parsed model across refreshes. */
  private readonly parsed = createParseCache()

  /** Set once the view exists; its header carries the workspace total. */
  view: vscode.TreeView<Item> | undefined

  /** Re-read every token file in the workspace. */
  async refresh(): Promise<void> {
    const found = await findTokenFiles()
    const doc = await activeTokenDocument()
    this.active = doc?.uri.toString()

    // One map for every file. Resolution is local-first, so a file's own
    // definitions still win over the index — the per-file copies
    // `externalIndexFor` makes buy nothing here.
    const workspace = new Map<string, TokenNode>()
    for (const [key, hit] of await buildWorkspaceIndex())
      workspace.set(key, hit.token)

    const sources = [...found]
    // A token file outside the include globs (or never saved) is still worth
    // showing while it is the one open.
    if (doc && !sources.some(f => f.uri.toString() === this.active)) {
      sources.push({ uri: doc.uri, text: doc.getText() })
    }
    const files = sources.map(({ uri, text }) =>
      this.read(uri, text, workspace),
    )
    this.parsed.retain(new Set(files.map(f => f.uri.toString())))
    files.sort((a, b) => a.label.localeCompare(b.label))
    this.files = files

    if (this.view) {
      const total = files.reduce(
        (n, f) => n + (f.root ? countTokens(f.root) : 0),
        0,
      )
      this.view.description = `${total} ${total === 1 ? "token" : "tokens"}`
    }
    this.changed.fire(undefined)
  }

  private read(
    uri: vscode.Uri,
    text: string,
    workspace: Map<string, TokenNode>,
  ): TokenFile {
    let root: GroupNode | undefined
    try {
      // Re-resolved every time even when the parse is reused: a reference
      // into another file changes when that file does.
      const model = this.parsed.get(uri.toString(), text)
      resolveAliases(model, workspace, localScopeFor(uri))
      root = model.root
    } catch {
      root = undefined // mid-edit invalid JSON: keep the view quiet
    }
    return { uri, label: vscode.workspace.asRelativePath(uri), root }
  }

  /**
   * What `reveal` should aim at for a file: its first child, so revealing
   * expands the file root as a side effect. `collapsibleState` alone cannot
   * do it — VS Code remembers a node's expansion by id and ignores the state
   * a later render asks for.
   */
  revealTarget(uri: vscode.Uri): Item | undefined {
    const key = uri.toString()
    const file = this.files.find(f => f.uri.toString() === key)
    if (!file) return undefined
    const first = file.root?.children[0]
    return first ? { uri, node: first } : { uri }
  }

  getChildren(item?: Item): Item[] {
    if (!item) return this.files.map(f => ({ uri: f.uri }))
    const parent = item.node ?? this.fileRoot(item.uri)
    if (!parent || parent.kind !== "group") return []
    return parent.children.map(node => ({ uri: item.uri, node }))
  }

  /** Required by `reveal`: walk back up the path within the file. */
  getParent(item: Item): Item | undefined {
    if (!item.node) return undefined
    const parentPath = item.node.path.slice(0, -1)
    if (parentPath.length === 0) return { uri: item.uri }
    const node = findGroup(this.fileRoot(item.uri), parentPath)
    return node ? { uri: item.uri, node } : { uri: item.uri }
  }

  getTreeItem({ uri, node }: Item): vscode.TreeItem {
    if (!node) return this.fileTreeItem(uri)

    const isGroup = node.kind === "group"
    const item = new vscode.TreeItem(
      node.name,
      isGroup
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    )
    // Segments kept apart, not dotted: a key "a.b" (invalid, but typeable)
    // and the path a → b must not share an id, or VS Code refuses the tree.
    item.id = `${uri.toString()}#${JSON.stringify(node.path)}`
    item.contextValue = isGroup ? "tokenAtlasGroup" : "tokenAtlasToken"
    item.iconPath = new vscode.ThemeIcon(
      // A $type outside DTCG's list (a typo, a tool's own) gets the plain icon.
      isGroup
        ? "folder"
        : ((node.type && TYPE_CODICONS[node.type]) ?? "symbol-field"),
    )
    if (isGroup) {
      item.description = String(countTokens(node))
      item.command = {
        command: "tokenAtlas.scopeToGroup",
        title: "Show this group",
        arguments: [uri, node.path],
      }
      return item
    }

    const token = node as TokenNode
    item.description = token.isAlias
      ? `{${token.reference}}`
      : describeValue(token.resolvedValue ?? token.value)
    item.tooltip = new vscode.MarkdownString(
      `\`${token.path.join(".")}\`${token.type ? ` · ${token.type}` : ""}` +
        (token.inheritedFrom
          ? `  \nInherited from \`${token.inheritedFrom}\` ($extends)`
          : ""),
    )
    item.command = {
      command: "tokenAtlas.revealToken",
      title: "Reveal token",
      arguments: [uri, node.path],
    }
    return item
  }

  private fileTreeItem(uri: vscode.Uri): vscode.TreeItem {
    const key = uri.toString()
    // One file, or the one you are looking at: open it rather than making the
    // first click a disclosure triangle.
    const expanded = this.files.length === 1 || key === this.active
    const item = new vscode.TreeItem(
      uri,
      expanded
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.Collapsed,
    )
    item.id = key
    item.contextValue = "tokenAtlasFile"
    const label = this.files.find(f => f.uri.toString() === key)?.label ?? ""
    const slash = label.lastIndexOf("/")
    const dir = slash > 0 ? label.slice(0, slash) : undefined
    // A file outside the active set is still listed — it is still a token file
    // you may want to edit — but nothing resolves against it, so say so.
    const root = this.fileRoot(uri)
    const count = root ? String(countTokens(root)) : undefined
    item.description = [dir, count, isActive(uri) ? undefined : "inactive"]
      .filter(Boolean)
      .join(" · ")
    if (!isActive(uri)) {
      item.tooltip = new vscode.MarkdownString(
        `Not in the active token set: references elsewhere do not resolve against this file.`,
      )
    }
    item.command = {
      command: "tokenAtlas.scopeToGroup",
      title: "Open in the token editor",
      arguments: [uri, []],
    }
    return item
  }

  /** True when `path` names a group in that file. The empty path is the file
   *  itself, and holds even while its JSON is momentarily invalid. */
  isGroup(uri: vscode.Uri, path: string[]): boolean {
    return (
      path.length === 0 || findGroup(this.fileRoot(uri), path) !== undefined
    )
  }

  private fileRoot(uri: vscode.Uri): GroupNode | undefined {
    const key = uri.toString()
    return this.files.find(f => f.uri.toString() === key)?.root
  }
}

function findGroup(
  root: GroupNode | undefined,
  path: string[],
): GroupNode | undefined {
  let current = root
  for (const segment of path) {
    const next = current?.children.find(
      c => c.kind === "group" && c.name === segment,
    )
    if (!next || next.kind !== "group") return undefined
    current = next
  }
  return current
}

/**
 * The token file in view: the active text editor, or the document behind an
 * active Token Atlas custom editor — `activeTextEditor` is undefined for those,
 * so without this the tree never knows which file to expand.
 */
async function activeTokenDocument(): Promise<vscode.TextDocument | undefined> {
  const editorDoc = vscode.window.activeTextEditor?.document
  if (editorDoc && isTokenDocument(editorDoc)) return editorDoc

  // Any Token Atlas custom editor in view, active tab first. A text editor for
  // some other file must not shadow it, or focusing a .ts file next to the
  // visual editor leaves the tree stuck.
  const groups = vscode.window.tabGroups
  const tabs = [
    groups.activeTabGroup?.activeTab,
    ...groups.all.flatMap(g => g.tabs),
  ].filter((t): t is vscode.Tab => t !== undefined)
  for (const tab of tabs) {
    if (!isTokenAtlasTab(tab)) continue
    try {
      return await vscode.workspace.openTextDocument(
        (tab.input as vscode.TabInputCustom).uri,
      )
    } catch {
      /* unreadable: try the next tab */
    }
  }
  return editorDoc && isTokenDocument(editorDoc) ? editorDoc : undefined
}

function isTokenAtlasTab(tab: vscode.Tab): boolean {
  return (
    tab.input instanceof vscode.TabInputCustom &&
    tab.input.viewType.startsWith("tokenAtlas.")
  )
}

/** The panel's provider and view, returned so integration tests can observe them. */
export interface TokenTreeHandle {
  provider: vscode.TreeDataProvider<Item>
  view: vscode.TreeView<Item>
}

export function registerTokenTree(
  context: vscode.ExtensionContext,
): TokenTreeHandle {
  const provider = new TokenTreeProvider()
  const view = vscode.window.createTreeView("tokenAtlas.tokens", {
    treeDataProvider: provider,
  })
  provider.view = view
  void provider.refresh()

  // Debounced: a keystroke changes the model, but not once per keystroke.
  let timer: NodeJS.Timeout | undefined
  const schedule = () => {
    clearTimeout(timer)
    timer = setTimeout(() => void provider.refresh(), 250)
  }

  /** Bring the panel out with the editor it belongs to, without taking focus. */
  const revealFor = async (uri: vscode.Uri) => {
    await provider.refresh()
    const item = provider.revealTarget(uri)
    if (!item) return
    // Belt and braces. `reveal` alone opens the panel in the integration
    // tests (closed side bar and Explorer showing, VS Code 1.137 and 1.138),
    // but it once left the Explorer in place when driven by hand, cause never
    // pinned down. The view's own focus command always opens it, so bounce
    // focus through that and hand it straight back to the editor.
    if (!view.visible) {
      await vscode.commands.executeCommand("tokenAtlas.tokens.focus")
      await vscode.commands.executeCommand(
        "workbench.action.focusActiveEditorGroup",
      )
    }
    try {
      await view.reveal(item, { focus: false, select: false })
    } catch {
      /* view gone, or the file dropped out mid-reveal */
    }
  }

  context.subscriptions.push(
    view,
    { dispose: () => clearTimeout(timer) },
    vscode.window.onDidChangeActiveTextEditor(() => schedule()),
    // Custom editors never become an "active text editor", so follow tabs too.
    vscode.window.tabGroups.onDidChangeTabs(e => {
      schedule()
      // Opening the visual editor should bring its panel with it: the two are
      // one surface, and hunting for the side bar afterwards is the bug.
      const opened = e.opened.find(isTokenAtlasTab)
      if (opened) void revealFor((opened.input as vscode.TabInputCustom).uri)
    }),
    // Every other change to what the panel shows — a token file edited,
    // written on disk, created, deleted, or the include/exclude globs
    // changing — invalidates the workspace index first.
    onDidInvalidateWorkspaceIndex(() => schedule()),
    // Clicking a group in the panel drives the table: open the visual editor
    // if it is not already showing this file, then scope it to that group.
    // Anything that is not a group is left alone rather than opened on a
    // scope the table cannot show.
    vscode.commands.registerCommand(
      "tokenAtlas.scopeToGroup",
      async (uri: vscode.Uri, path: string[]) => {
        if (!provider.isGroup(uri, path)) return
        if (!TokenEditorProvider.isOpen(uri)) await openInVisualEditor(uri)
        TokenEditorProvider.scopeTo(uri, path)
      },
    ),
    // A token goes to wherever that file is already open: the visual editor's
    // detail panel if it is showing, the JSON key otherwise.
    vscode.commands.registerCommand(
      "tokenAtlas.revealToken",
      async (uri: vscode.Uri, path: string[]) => {
        if (!TokenEditorProvider.isOpen(uri) && defaultsToVisual(uri)) {
          await openInVisualEditor(uri)
        }
        if (TokenEditorProvider.isOpen(uri)) {
          TokenEditorProvider.scopeTo(uri, path.slice(0, -1), path)
          return
        }
        const doc = await vscode.workspace.openTextDocument(uri)
        const editor = await vscode.window.showTextDocument(doc, {
          preserveFocus: false,
        })
        const range = keyRange(doc, path)
        if (range) {
          editor.selection = new vscode.Selection(range.start, range.end)
          editor.revealRange(
            range,
            vscode.TextEditorRevealType.InCenterIfOutsideViewport,
          )
        }
      },
    ),
  )

  return { provider, view }
}
