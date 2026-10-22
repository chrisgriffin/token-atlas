import type { GroupNode, TokenNode, TokenType } from "../../src/core/types";

/**
 * Small hand-built model trees for the webview component tests. Real models
 * come from `parseTokens`, but a literal tree keeps each test's shape visible
 * in the test itself.
 */
export function token(path: string[], value: unknown, extra: Partial<TokenNode> = {}): TokenNode {
  return {
    kind: "token",
    name: path[path.length - 1],
    path,
    typeIsInherited: false,
    value,
    isAlias: typeof value === "string" && value.startsWith("{"),
    ...(typeof value === "string" && value.startsWith("{")
      ? { reference: value.slice(1, -1) }
      : {}),
    ...extra,
  };
}

export function group(path: string[], children: Array<GroupNode | TokenNode>): GroupNode {
  return { kind: "group", name: path[path.length - 1] ?? "", path, children };
}

/** A two-group document: color.brand.{primary,accent} and space.md. */
export function sampleRoot(): GroupNode {
  const color = group(
    ["color"],
    [
      group(
        ["color", "brand"],
        [
          token(["color", "brand", "primary"], "#3b82f6", { type: "color" as TokenType }),
          token(["color", "brand", "accent"], "{color.brand.primary}", {
            type: "color" as TokenType,
            resolvedValue: "#3b82f6",
          }),
        ],
      ),
    ],
  );
  const space = group(["space"], [token(["space", "md"], 16, { type: "number" as TokenType })]);
  return group([], [color, space]);
}
