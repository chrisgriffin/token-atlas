/**
 * The host adapter — the only vscode-aware code in Token Atlas.
 *
 * Registers a Custom Text Editor for `*.tokens.json`. The TextDocument remains
 * the single source of truth: we parse it into a model for the webview, apply
 * the webview's edit intents as *surgical* WorkspaceEdits (clean diffs, native
 * undo/redo), and re-push the model whenever the document changes — including
 * external edits (raw JSON, git checkout, etc.).
 */
import * as path from "node:path"
import * as vscode from "vscode"
import {
  computeAddEdits,
  contextValues,
  indexTokens,
  modeOf,
  parseResolver,
  computeDeleteEdits,
  computeDeprecateEdits,
  computeSetEdits,
  computeSwapEdits,
  computeReorderEdits,
  InvalidNameError,
  NameTakenError,
  parseTokens,
  resolveAliases,
  validate,
  type Edit,
  type GroupNode,
} from "../core"
import type {
  ColumnWidths,
  EditorSettings,
  HostToWebview,
  Modes,
  ModeView,
  WebviewToHost,
} from "../shared/protocol"
import type { ContrastTarget } from "../core/color"
import { mayDelete } from "./deprecate"
import {
  activeResolution,
  externalIndexFor,
  findResolverFiles,
  findTokenFiles,
  isTokenDocument,
  localScopeFor,
  onDidInvalidateWorkspaceIndex,
} from "./workspaceIndex"
import { applyRename } from "./rename"

export class TokenEditorProvider implements vscode.CustomTextEditorProvider {
  /**
   * The one opt-in editor (Reopen With…), offered on any *.json or *.tokens.
   * The id keeps its `.any` suffix: "Set Default" stores it in user settings.
   */
  public static readonly viewType = "tokenAtlas.tokenEditor.any"

  /** Live panels by document, so the Tokens panel can scope an open editor. */
  private static readonly panels = new Map<string, Set<vscode.WebviewPanel>>()
  /** Group each open document is scoped to, replayed into `init`, with the
   *  token the Tokens panel asked to open (consumed by the first `init`). */
  private static readonly scopes = new Map<
    string,
    { path: string[]; select?: string[] }
  >()

  /** Each open editor's intent queue, by document. A test hook: VS Code has
   *  no way to post a message *from* a webview, so `test/integration/` sends
   *  an intent through here to reach the same handler the webview does. */
  private static readonly receivers = new Map<
    string,
    (msg: WebviewToHost) => Promise<void>
  >()

  /** The token table's column widths, one set for every token file. */
  public static readonly columnWidthsKey = "tokenAtlas.columnWidths"

  /** Run `msg` as if the editor showing `uri` had received it from its webview. */
  public static receive(uri: vscode.Uri, msg: WebviewToHost): Promise<void> {
    const receive = TokenEditorProvider.receivers.get(uri.toString())
    if (!receive)
      throw new Error(`No Token Atlas editor is open on ${uri.toString()}`)
    return receive(msg)
  }

  /** Files sent back to JSON with "Open as JSON": the `defaultEditor` setting
   *  must not immediately drag them into the visual editor again. */
  private static readonly textPreferred = new Set<string>()

  /** "Open as JSON" / "Reopen With… → Text Editor" beats the setting. */
  public static preferText(uri: vscode.Uri): void {
    TokenEditorProvider.textPreferred.add(uri.toString())
  }

  public static prefersText(uri: vscode.Uri): boolean {
    return TokenEditorProvider.textPreferred.has(uri.toString())
  }

  public static forgetText(uri: vscode.Uri): void {
    TokenEditorProvider.textPreferred.delete(uri.toString())
  }

  /** True when a Token Atlas editor is already showing this document. */
  public static isOpen(uri: vscode.Uri): boolean {
    return (TokenEditorProvider.panels.get(uri.toString())?.size ?? 0) > 0
  }

  /** The group the editor on `uri` is scoped to: `[]` is the whole file,
   *  `undefined` no scope held. A test hook, for `test/integration/`. */
  public static scopeOf(uri: vscode.Uri): string[] | undefined {
    return TokenEditorProvider.scopes.get(uri.toString())?.path
  }

  /** Scope every open editor for `uri` to `path`, and bring one forward.
   *  `select` opens that token's detail panel — the panel clicked a token. */
  public static scopeTo(
    uri: vscode.Uri,
    path: string[],
    select?: string[],
  ): void {
    const key = uri.toString()
    TokenEditorProvider.scopes.set(key, { path, select })
    let revealed = false
    for (const panel of TokenEditorProvider.panels.get(key) ?? []) {
      void panel.webview.postMessage({ type: "scope", path, select })
      // Otherwise a background editor re-scopes where nobody can see it.
      if (!revealed) {
        panel.reveal(panel.viewColumn, false)
        revealed = true
      }
    }
  }

  constructor(private readonly context: vscode.ExtensionContext) {}

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new TokenEditorProvider(context)
    const options = {
      supportsMultipleEditorsPerDocument: false,
    }
    return vscode.window.registerCustomEditorProvider(
      TokenEditorProvider.viewType,
      provider,
      options,
    )
  }

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
  ): Promise<void> {
    // The menu offers this editor on any *.json (VS Code matches filenames
    // only), so a file that is not tokens gets a way back instead of an
    // empty table. Decided once, at open.
    if (!isTokenDocument(document)) {
      webviewPanel.webview.options = { enableCommandUris: true }
      webviewPanel.webview.html = notTokensHtml(webviewPanel.webview)
      return
    }
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    }
    webviewPanel.webview.html = this.getHtml(webviewPanel.webview)

    const key = document.uri.toString()
    const forDoc =
      TokenEditorProvider.panels.get(key) ?? new Set<vscode.WebviewPanel>()
    forDoc.add(webviewPanel)
    TokenEditorProvider.panels.set(key, forDoc)
    let disposed = false
    webviewPanel.onDidDispose(() => {
      disposed = true
      forDoc.delete(webviewPanel)
      if (forDoc.size === 0) {
        TokenEditorProvider.panels.delete(key)
        TokenEditorProvider.scopes.delete(key)
      }
    })

    // A model push awaits the workspace index, so it can finish after its
    // panel has closed, and reading `webview` on a disposed panel throws.
    const post = (message: HostToWebview) => {
      if (!disposed) void webviewPanel.webview.postMessage(message)
    }

    const pushModel = async (type: "init" | "update") => {
      try {
        const external = await externalIndexFor(document.uri)
        const model = parseTokens(document.getText())
        resolveAliases(model, external, localScopeFor(document.uri))
        const validation = validate(
          model,
          external,
          localScopeFor(document.uri),
        )
        post({
          type,
          uri: key,
          model,
          validation,
          externalTokens: [...external.values()],
          settings: editorSettings(document.uri),
          scope: TokenEditorProvider.scopes.get(key)?.path ?? [],
          selected: type === "init" ? takeSelection(key) : undefined,
          columnWidths: this.context.globalState.get<ColumnWidths>(
            TokenEditorProvider.columnWidthsKey,
            {},
          ),
          modes: (await modesFor(document))?.modes,
        })
      } catch (err) {
        post({ type: "error", message: String(err) })
      }
    }

    // Settings feed defaults and conversions in the webview, so re-send on change.
    const configSub = vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration("tokenAtlas", document.uri))
        void pushModel("update")
    })
    webviewPanel.onDidDispose(() => configSub.dispose())

    // Re-render when this document or any other token or resolver file
    // changes, and when the active set does: each invalidates the index.
    const changeSub = onDidInvalidateWorkspaceIndex(
      () => void pushModel("update"),
    )
    webviewPanel.onDidDispose(() => changeSub.dispose())

    // Intents mutate the document and compute edits from its current text,
    // so they must run one at a time: a second intent must not be dispatched
    // until the first's applyEdit has resolved.
    let queue: Promise<void> = Promise.resolve()
    const receive = (msg: WebviewToHost) =>
      (queue = queue
        .then(() => handle(msg))
        .catch(err => {
          // A refused name leaves the file as it was: say why, keep the editor.
          if (
            err instanceof NameTakenError ||
            err instanceof InvalidNameError
          ) {
            void vscode.window.showErrorMessage(err.message)
          } else post({ type: "error", message: String(err) })
        }))
    webviewPanel.webview.onDidReceiveMessage(receive)
    TokenEditorProvider.receivers.set(key, receive)
    webviewPanel.onDidDispose(() => {
      // Only its own entry: a newer editor on the same document has replaced it.
      if (TokenEditorProvider.receivers.get(key) === receive) {
        TokenEditorProvider.receivers.delete(key)
      }
    })

    const handle = async (msg: WebviewToHost): Promise<void> => {
      switch (msg.type) {
        case "ready":
          await pushModel("init")
          break
        case "setValue":
          await this.materialize(document, msg.path)
          await this.applyEdits(
            document,
            computeSetEdits(document.getText(), msg.path, "$value", msg.value),
          )
          break
        case "setDescription":
          await this.materialize(document, msg.path)
          await this.applyEdits(
            document,
            computeSetEdits(
              document.getText(),
              msg.path,
              "$description",
              msg.description.length ? msg.description : undefined,
            ),
          )
          break
        case "setType":
          await this.materialize(document, msg.path)
          await this.applyEdits(
            document,
            computeSetEdits(
              document.getText(),
              msg.path,
              "$type",
              msg.tokenType,
            ),
          )
          if (msg.starterValue !== undefined) {
            await this.applyEdits(
              document,
              computeSetEdits(
                document.getText(),
                msg.path,
                "$value",
                msg.starterValue,
              ),
            )
          }
          break
        case "setDeprecated":
          await this.materialize(document, msg.path)
          await this.applyEdits(
            document,
            msg.deprecated === undefined || msg.deprecated === false
              ? computeSetEdits(
                  document.getText(),
                  msg.path,
                  "$deprecated",
                  msg.deprecated,
                )
              : computeDeprecateEdits(
                  document.getText(),
                  msg.path,
                  typeof msg.deprecated === "string" ? msg.deprecated : "",
                  msg.replacement,
                ),
          )
          break
        case "addToken":
          await this.applyEdits(
            document,
            computeAddEdits(document.getText(), msg.parentPath, msg.name, {
              $value: 0,
            }),
          )
          break
        case "addGroup":
          await this.applyEdits(
            document,
            computeAddEdits(document.getText(), msg.parentPath, msg.name, {}),
          )
          break
        case "deleteNode":
          // A deprecated token still in use says how many uses remain first;
          // with the deprecation workflow on, so does any other (spec 019).
          if (!(await mayDelete(document, msg.path))) break
          await this.applyEdits(
            document,
            computeDeleteEdits(document.getText(), msg.path),
          )
          // The right-click menu deletes from here, not from the panel.
          post({ type: "deleted", path: msg.path })
          break
        case "renameNode":
          // Key + every reference to it, in this file and across the workspace,
          // keeping the old name as an alias when the workflow is on.
          if (await applyRename(document, msg.path, msg.newName))
            post({ type: "renamed", path: msg.path, newName: msg.newName })
          break
        case "moveNode":
          await this.applyEdits(
            document,
            this.computeMoveEdits(document.getText(), msg.path, msg.direction),
          )
          break
        case "reorderNodes":
          await this.applyEdits(
            document,
            computeReorderEdits(document.getText(), msg.parentPath, msg.order),
          )
          break
        case "setScope":
          // The webview owns this change; storing it keeps the next `update`
          // from replaying a stale scope over it.
          TokenEditorProvider.scopes.set(key, { path: msg.path })
          break
        case "setColumnWidths":
          await this.context.globalState.update(
            TokenEditorProvider.columnWidthsKey,
            msg.widths,
          )
          break
        case "setMode": {
          const found = await modesFor(document)
          if (!found) break
          const active = activeResolution()
          const input =
            active?.resolver === found.resolver ? { ...active.input } : {}
          input[found.modes.modifier] = msg.context
          await vscode.commands.executeCommand("tokenAtlas.chooseActiveSet", {
            resolver: found.resolver,
            input,
          })
          break
        }
        case "setModeValue": {
          const found = await modesFor(document)
          const file =
            found?.modes.values[msg.context]?.[msg.path.join(".")]?.file
          if (!found || !file) break
          const dir = vscode.Uri.joinPath(
            vscode.Uri.parse(found.resolver),
            "..",
          )
          const target = await vscode.workspace.openTextDocument(
            vscode.Uri.joinPath(dir, file),
          )
          await this.applyEdits(
            target,
            computeSetEdits(target.getText(), msg.path, "$value", msg.value),
          )
          break
        }
        case "setModeView": {
          // Where a value already decides it: a workspace value beats a user
          // one. Window-scoped, so no folder can hold its own.
          const config = vscode.workspace.getConfiguration("tokenAtlas")
          await config.update(
            "modeView",
            msg.view,
            config.inspect("modeView")?.workspaceValue !== undefined
              ? vscode.ConfigurationTarget.Workspace
              : vscode.ConfigurationTarget.Global,
          )
          break
        }
        case "openAsText":
          TokenEditorProvider.textPreferred.add(key)
          await vscode.commands.executeCommand(
            "vscode.openWith",
            document.uri,
            "default",
          )
          // Swap, don't duplicate: without this the file is left open twice,
          // once per editor.
          webviewPanel.dispose()
          break
      }
    }
  }

  /**
   * A token a group has through `$extends` has no key in the text. Its first
   * edit writes an override in the extending group — the inherited `$value`,
   * copied as written — so the edit lands on a token of the group's own, as
   * typing the override by hand would (DTCG §6.4.3: local wins, whole).
   */
  private async materialize(
    document: vscode.TextDocument,
    nodePath: string[],
  ): Promise<void> {
    const model = parseTokens(document.getText())
    const token = resolveAliases(
      model,
      await externalIndexFor(document.uri),
    ).get(nodePath.join("."))
    if (!token?.inheritedFrom) return
    await this.applyEdits(
      document,
      computeSetEdits(document.getText(), nodePath, "$value", token.value),
    )
  }

  /** Compute a sibling-swap for move up/down based on document order. */
  private computeMoveEdits(
    text: string,
    path: string[],
    direction: "up" | "down",
  ): Edit[] {
    const model = parseTokens(text)
    const parentPath = path.slice(0, -1)
    const parent = findGroup(model.root, parentPath)
    if (!parent) return []
    const names = parent.children.map(c => c.name)
    const index = names.indexOf(path[path.length - 1])
    const neighbor = direction === "up" ? index - 1 : index + 1
    if (index < 0 || neighbor < 0 || neighbor >= names.length) return []
    return computeSwapEdits(text, parentPath, names[index], names[neighbor])
  }

  /** Translate core edits into a ranged WorkspaceEdit (good undo + clean diffs). */
  private async applyEdits(
    document: vscode.TextDocument,
    edits: Edit[],
  ): Promise<void> {
    if (edits.length === 0) return
    const workspaceEdit = new vscode.WorkspaceEdit()
    for (const edit of edits) {
      const start = document.positionAt(edit.offset)
      const end = document.positionAt(edit.offset + edit.length)
      workspaceEdit.replace(
        document.uri,
        new vscode.Range(start, end),
        edit.content,
      )
    }
    await vscode.workspace.applyEdit(workspaceEdit)
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview.js"),
    )
    const nonce = makeNonce()
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
      `font-src ${webview.cspSource}`,
    ].join("; ")

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Token Atlas</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`
  }
}

/** Shown in place of the editor for a file that holds no tokens. */
function notTokensHtml(webview: vscode.Webview): string {
  const csp = `default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'`
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <title>Token Atlas</title>
</head>
<body style="font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 2rem;">
  <p>This file has no design tokens, so the Token Editor has nothing to show.</p>
  <p><a href="command:workbench.action.reopenTextEditor">Reopen in Text Editor</a></p>
</body>
</html>`
}

/**
 * The modes of `document` when a resolver modifier lists it as one of its
 * contexts' last file, with that resolver's URI. Undefined for any other file,
 * a component tier included.
 */
async function modesFor(
  document: vscode.TextDocument,
): Promise<{ resolver: string; modes: Modes } | undefined> {
  for (const { uri, text } of await findResolverFiles()) {
    const { resolver } = parseResolver(text)
    if (!resolver) continue
    const dir = vscode.Uri.joinPath(uri, "..")
    const found = modeOf(
      resolver,
      path.posix.relative(dir.path, document.uri.path),
    )
    if (!found) continue
    const files = await findTokenFiles()
    const read = (file: string) => {
      if (!file) return text
      const key = vscode.Uri.joinPath(dir, file).toString()
      return files.find(f => f.uri.toString() === key)?.text
    }
    const keys = [...indexTokens(parseTokens(document.getText())).keys()]
    const { modifier, context } = found
    const chosen = activeResolution()
    const ours = chosen?.resolver === uri.toString()
    const input = (ours && chosen.input) || {}
    const picked = ours ? (input[modifier.name] ?? modifier.default) : undefined
    const contexts = [...modifier.contexts.keys()]
    return {
      resolver: uri.toString(),
      modes: {
        modifier: modifier.name,
        contexts,
        own: context,
        active:
          picked !== undefined && modifier.contexts.has(picked)
            ? picked
            : context,
        values: Object.fromEntries(
          contexts.map(c => [
            c,
            contextValues(resolver, modifier, c, read, keys, input),
          ]),
        ),
      },
    }
  }
  return undefined
}

/** A pending selection is for the first render only; later updates must not
 *  re-open a panel the user has closed. */
function takeSelection(key: string): string[] | undefined {
  const entry = TokenEditorProvider["scopes"].get(key)
  if (!entry?.select) return undefined
  TokenEditorProvider["scopes"].set(key, { path: entry.path })
  return entry.select
}

function findGroup(root: GroupNode, path: string[]): GroupNode | undefined {
  let current: GroupNode = root
  for (const segment of path) {
    const next = current.children.find(
      c => c.kind === "group" && c.name === segment,
    )
    if (!next || next.kind !== "group") return undefined
    current = next
  }
  return current
}

function makeNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  let text = ""
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return text
}

/** Resource-scoped settings for the visual editor. Defaults here must match
 *  `contributes.configuration` in package.json. */
function editorSettings(uri: vscode.Uri): EditorSettings {
  const cfg = vscode.workspace.getConfiguration("tokenAtlas", uri)
  return {
    rootFontSize: cfg.get<number>("rootFontSize") ?? 16,
    defaultColorSpace: cfg.get<string>("defaultColorSpace") ?? "srgb",
    defaultDimensionUnit: cfg.get<"px" | "rem">("defaultDimensionUnit") ?? "px",
    contrastTarget: cfg.get<ContrastTarget>("contrastTarget") ?? "AA",
    modeView: cfg.get<ModeView>("modeView") ?? "single",
  }
}
