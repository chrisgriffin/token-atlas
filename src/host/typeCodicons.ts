/**
 * Codicon per DTCG type for the Design Tokens tree, one each so the type
 * reads at a glance. Keyed by `TokenType`, so a new type fails typecheck
 * until it has one. No `vscode` import: the unit tests load it directly.
 */
import type { TokenType } from "../core/types"

export const TYPE_CODICONS: Record<TokenType, string> = {
  color: "symbol-color",
  dimension: "symbol-ruler",
  fontFamily: "case-sensitive",
  fontWeight: "bold",
  duration: "watch",
  cubicBezier: "graph-line",
  number: "symbol-number",
  strokeStyle: "dash",
  border: "primitive-square",
  transition: "arrow-right",
  shadow: "layers",
  gradient: "color-mode",
  typography: "text-size",
}
