/**
 * Inline color swatches + native color picker in the raw JSON editor.
 *
 * VS Code renders a clickable swatch for every ColorInformation we return, and
 * opens its picker on click. We map each concrete `color` token's `$value` to a
 * vscode.Color, and on edit rewrite the value back as a DTCG color object in the
 * token's original colorSpace (or a hex string if it was one), written by
 * core's computeSetEdits exactly as the visual editor writes it.
 */
import * as vscode from "vscode"
import {
  applyEdits,
  findNodeAtLocation,
  findNodeAtOffset,
  getNodePath,
  parseTree,
} from "jsonc-parser"
import { computeSetEdits, parseTokens } from "../core"
import { fromRgba01, rgba01ToHex, toRgba01 } from "../core/color"
import { isTokenDocument } from "./workspaceIndex"

// Scheme-agnostic on purpose: swatches worked over virtual filesystems
// (Remote Repositories, vscode-vfs) before and still should.
const SELECTOR: vscode.DocumentSelector = [
  { language: "json" },
  { language: "jsonc" },
  { pattern: "**/*.tokens" },
]

class TokenColorProvider implements vscode.DocumentColorProvider {
  provideDocumentColors(
    document: vscode.TextDocument,
  ): vscode.ProviderResult<vscode.ColorInformation[]> {
    if (!isTokenDocument(document)) return []
    const text = document.getText()
    const root = parseTree(text)
    if (!root) return []

    const model = parseTokens(text)
    const out: vscode.ColorInformation[] = []

    const stack = [...model.root.children]
    while (stack.length) {
      const node = stack.pop()!
      if (node.kind === "group") {
        stack.push(...node.children)
        continue
      }
      if (node.type !== "color" || node.isAlias) continue
      const rgba = toRgba01(node.value)
      if (!rgba) continue

      const valueNode = findNodeAtLocation(root, [...node.path, "$value"])
      if (!valueNode) continue

      const range = new vscode.Range(
        document.positionAt(valueNode.offset),
        document.positionAt(valueNode.offset + valueNode.length),
      )
      out.push(
        new vscode.ColorInformation(
          range,
          new vscode.Color(rgba.r, rgba.g, rgba.b, rgba.a),
        ),
      )
    }
    return out
  }

  provideColorPresentations(
    color: vscode.Color,
    context: { document: vscode.TextDocument; range: vscode.Range },
  ): vscode.ProviderResult<vscode.ColorPresentation[]> {
    const original = context.document.getText(context.range)
    const rgba = { r: color.red, g: color.green, b: color.blue, a: color.alpha }

    let colorSpace = "srgb"
    let wasString = false
    let hadAlpha = false
    try {
      const parsed = JSON.parse(original)
      if (typeof parsed === "string") wasString = true
      else if (parsed && typeof parsed.colorSpace === "string") {
        colorSpace = parsed.colorSpace
        hadAlpha = "alpha" in parsed
      }
    } catch {
      /* leave defaults */
    }

    if (wasString) {
      const hex = rgba01ToHex(rgba)
      const presentation = new vscode.ColorPresentation(hex)
      presentation.textEdit = vscode.TextEdit.replace(
        context.range,
        JSON.stringify(hex),
      )
      return [presentation]
    }

    const dtcg = fromRgba01(rgba, colorSpace)
    if (!dtcg) return []
    const replacement = rewrittenValue(context.document, context.range, {
      colorSpace: dtcg.colorSpace,
      components: dtcg.components,
      alpha: dtcg.alpha ?? (hadAlpha ? 1 : undefined), // an explicit `"alpha": 1` stays
      hex: dtcg.hex,
    })
    if (replacement === undefined) return []
    const presentation = new vscode.ColorPresentation(dtcg.hex ?? "color")
    presentation.textEdit = vscode.TextEdit.replace(context.range, replacement)
    return [presentation]
  }
}

/**
 * The `$value` at `range` as computeSetEdits writes `value` there, read back
 * out of the edited text so the picker's one edit covers that `$value` alone.
 */
function rewrittenValue(
  document: vscode.TextDocument,
  range: vscode.Range,
  value: unknown,
): string | undefined {
  const text = document.getText()
  const root = parseTree(text)
  const node = root && findNodeAtOffset(root, document.offsetAt(range.start))
  if (!node) return undefined
  const path = getNodePath(node)
  if (path[path.length - 1] !== "$value") return undefined
  const tokenPath = path.slice(0, -1).map(String)
  const edited = applyEdits(
    text,
    computeSetEdits(text, tokenPath, "$value", value),
  )
  const written = findNodeAtLocation(parseTree(edited)!, path)
  return (
    written && edited.slice(written.offset, written.offset + written.length)
  )
}

export function registerColorProvider(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerColorProvider(SELECTOR, new TokenColorProvider()),
  )
}
