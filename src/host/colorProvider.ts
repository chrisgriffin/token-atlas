/**
 * Inline color swatches + native color picker in the raw JSON editor.
 *
 * VS Code renders a clickable swatch for every ColorInformation we return, and
 * opens its picker on click. We map each concrete `color` token's `$value` to a
 * vscode.Color, and on edit rewrite the value back as a DTCG color object in the
 * token's original colorSpace (or a hex string if it was one).
 */
import * as vscode from "vscode";
import { findNodeAtLocation, parseTree } from "jsonc-parser";
import { parseTokens } from "../core";
import { fromRgba01, rgba01ToHex, toRgba01 } from "../core/color";
import { isTokenDocument } from "./workspaceIndex";

// Scheme-agnostic on purpose: swatches worked over virtual filesystems
// (Remote Repositories, vscode-vfs) before and still should.
const SELECTOR: vscode.DocumentSelector = [
  { language: "json" },
  { language: "jsonc" },
  { pattern: "**/*.tokens" },
];

class TokenColorProvider implements vscode.DocumentColorProvider {
  provideDocumentColors(
    document: vscode.TextDocument,
  ): vscode.ProviderResult<vscode.ColorInformation[]> {
    if (!isTokenDocument(document)) return [];
    const text = document.getText();
    const root = parseTree(text);
    if (!root) return [];

    const model = parseTokens(text);
    const out: vscode.ColorInformation[] = [];

    const stack = [...model.root.children];
    while (stack.length) {
      const node = stack.pop()!;
      if (node.kind === "group") {
        stack.push(...node.children);
        continue;
      }
      if (node.type !== "color" || node.isAlias) continue;
      const rgba = toRgba01(node.value);
      if (!rgba) continue;

      const valueNode = findNodeAtLocation(root, [...node.path, "$value"]);
      if (!valueNode) continue;

      const range = new vscode.Range(
        document.positionAt(valueNode.offset),
        document.positionAt(valueNode.offset + valueNode.length),
      );
      out.push(
        new vscode.ColorInformation(range, new vscode.Color(rgba.r, rgba.g, rgba.b, rgba.a)),
      );
    }
    return out;
  }

  provideColorPresentations(
    color: vscode.Color,
    context: { document: vscode.TextDocument; range: vscode.Range },
  ): vscode.ProviderResult<vscode.ColorPresentation[]> {
    const original = context.document.getText(context.range);
    const rgba = { r: color.red, g: color.green, b: color.blue, a: color.alpha };

    let colorSpace = "srgb";
    let wasString = false;
    try {
      const parsed = JSON.parse(original);
      if (typeof parsed === "string") wasString = true;
      else if (parsed && typeof parsed.colorSpace === "string") colorSpace = parsed.colorSpace;
    } catch {
      /* leave defaults */
    }

    if (wasString) {
      const hex = rgba01ToHex(rgba);
      const presentation = new vscode.ColorPresentation(hex);
      presentation.textEdit = vscode.TextEdit.replace(context.range, JSON.stringify(hex));
      return [presentation];
    }

    const dtcg = fromRgba01(rgba, colorSpace);
    if (!dtcg) return [];
    const presentation = new vscode.ColorPresentation(dtcg.hex ?? "color");
    presentation.textEdit = vscode.TextEdit.replace(context.range, JSON.stringify(dtcg));
    return [presentation];
  }
}

export function registerColorProvider(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerColorProvider(SELECTOR, new TokenColorProvider()),
  );
}
