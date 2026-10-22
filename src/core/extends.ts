/**
 * Group extension, DTCG 2025.10 §6.4: a group with `$extends` (or a
 * group-level `$ref`) inherits every token under the group it names, at the
 * same relative path. A token the group defines itself wins whole ("complete
 * replacement"); groups merge.
 *
 * Inherited tokens are copies placed in the model tree, marked
 * `inheritedFrom`, so everything that reads a resolved model — hover,
 * completion, validation, the Tokens panel, the visual editor — sees them
 * like any other token. Code that works on the text's own keys (edits,
 * swatches, the outline) parses without expanding and never meets them.
 *
 * The target resolves like an alias (invariant 4): a group this document
 * defines wins, otherwise `external` (the workspace index) supplies it.
 */
import type { GroupNode, TokenNode, TokenType } from "./types";

/** True when any group in `root` extends another. */
export function hasExtends(root: GroupNode): boolean {
  return (
    root.extends !== undefined || root.children.some((c) => c.kind === "group" && hasExtends(c))
  );
}

/**
 * Expand every `$extends` in `root` in place. Re-running is safe: earlier
 * copies are removed first, so a cached model re-resolved against a changed
 * workspace never keeps a stale inherited token.
 */
export function expandExtends(root: GroupNode, external?: Map<string, TokenNode>): void {
  strip(root);
  const groups = new Map<string, GroupNode>();
  const local = new Map<string, TokenNode>();
  walk(root, groups, local);
  const extenders = [...groups.values()].filter((g) => g.extends);
  if (!extenders.length) return;

  const under = (map: Map<string, TokenNode>, target: string) =>
    [...map].filter(([key]) => key.startsWith(target + "."));
  const sourceOf = (target: string) => (groups.has(target) ? local : (external ?? new Map()));

  for (const g of extenders) g.extends!.error = targetError(g, groups, local, external);
  markCycles(extenders);

  // Rounds to a fixed point, so a chain (c extends b extends a) fills in
  // whichever order the groups come in. Each round adds at least one token or
  // stops, and a cycle-free chain needs at most one round per extender.
  for (let round = 0; round <= extenders.length; round++) {
    let added = false;
    for (const g of extenders) {
      const { target, error } = g.extends!;
      if (error || target === undefined) continue;
      for (const [key, token] of under(sourceOf(target), target)) {
        const rest = key.slice(target.length + 1).split(".");
        const path = [...g.path, ...rest];
        if (local.has(path.join("."))) continue; // a local token wins, whole
        const parent = holder(g, rest.slice(0, -1), target);
        if (!parent) continue; // a local token sits where a group would have to
        const copy: TokenNode = {
          ...token,
          name: rest[rest.length - 1],
          path,
          inheritedFrom: token.inheritedFrom ?? key,
          resolvedValue: undefined,
          resolvedType: undefined,
        };
        parent.children.push(copy);
        local.set(path.join("."), copy);
        added = true;
      }
    }
    if (!added) break;
  }

  // §6.7.3: a token with no `$type` of its own has the type of the token it
  // replaces (Example 25), else the resolved type of the target group it sits
  // under. The innermost extender goes first, so its target wins.
  const byDepth = [...extenders].sort((a, b) => b.path.length - a.path.length);
  for (const g of byDepth) {
    const { target, error } = g.extends!;
    if (error || target === undefined) continue;
    const prefix = g.path.length ? g.path.join(".") + "." : "";
    for (const [key, token] of local) {
      if (token.inheritedFrom || token.type || !key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length).split(".");
      const type =
        sourceOf(target).get(`${target}.${rest.join(".")}`)?.type ??
        targetGroupType(groups, external, target, rest.slice(0, -1));
      if (type) {
        token.type = type;
        token.typeIsInherited = true;
      }
    }
  }
}

/**
 * The resolved `$type` of the deepest group at `target` + `segments`: its
 * own, else the one an `$extends` of its gives it, else its ancestors'. A
 * target this document does not define is read from `external`.
 */
function targetGroupType(
  groups: Map<string, GroupNode>,
  external: Map<string, TokenNode> | undefined,
  target: string,
  segments: string[],
  seen = new Set<string>(),
): TokenType | undefined {
  if (!groups.has(target)) return externalGroupType(external, target, segments);
  for (let i = segments.length; i >= 0; i--) {
    const key = [target, ...segments.slice(0, i)].join(".");
    const group = groups.get(key);
    if (!group) continue;
    if (group.type) return group.type;
    const ext = group.extends;
    if (ext?.target !== undefined && !ext.error && !seen.has(key)) {
      seen.add(key);
      const type = targetGroupType(groups, external, ext.target, segments.slice(i), seen);
      if (type) return type;
    }
    return group.inheritedType;
  }
  return undefined;
}

/**
 * The same for a target only the workspace index supplies, which keeps
 * tokens, not groups: the deepest group there is the type a token directly
 * in it inherits. Undefined when no such token says, rather than a guess
 * from a subgroup, whose own `$type` may differ.
 */
function externalGroupType(
  external: Map<string, TokenNode> | undefined,
  target: string,
  segments: string[],
): TokenType | undefined {
  if (!external) return undefined;
  for (let i = segments.length; i >= 0; i--) {
    const key = [target, ...segments.slice(0, i)].join(".");
    const inside = [...external].filter(([k]) => k.startsWith(key + "."));
    if (!inside.length) continue;
    const direct = inside.find(
      ([k, t]) => !k.slice(key.length + 1).includes(".") && t.typeIsInherited && t.type,
    );
    return direct?.[1].type;
  }
  return undefined;
}

function strip(group: GroupNode): void {
  group.children = group.children.filter((c) => !c.inheritedFrom);
  if (group.extends) delete group.extends.error;
  for (const c of group.children) if (c.kind === "group") strip(c);
}

function walk(group: GroupNode, groups: Map<string, GroupNode>, tokens: Map<string, TokenNode>) {
  groups.set(group.path.join("."), group);
  for (const c of group.children) {
    if (c.kind === "token") tokens.set(c.path.join("."), c);
    else walk(c, groups, tokens);
  }
}

/** Why `g`'s target cannot be extended (§6.4.4, §6.4.6), or undefined. */
function targetError(
  g: GroupNode,
  groups: Map<string, GroupNode>,
  local: Map<string, TokenNode>,
  external: Map<string, TokenNode> | undefined,
): string | undefined {
  const { via, target } = g.extends!;
  if (target === undefined) {
    return `Invalid ${via}: name a group, as "{group}" or "#/group".`;
  }
  const self = g.path.join(".");
  if (self === target || self.startsWith(target + ".")) {
    return `Circular ${via}: "${self}" cannot extend {${target}}, which contains it.`;
  }
  if (groups.has(target)) return undefined;
  if (local.has(target) || external?.has(target)) {
    return `${via} must name a group, but {${target}} is a token.`;
  }
  const known = external && [...external.keys()].some((k) => k.startsWith(target + "."));
  return known ? undefined : `Unresolved ${via}: no group {${target}}.`;
}

/**
 * Every extender on a cycle gets an error (§6.7.4: "an error affecting groups
 * a, b, and c"). `g` depends on each extender whose group overlaps `g`'s
 * target — the target itself, a group inside it, or one around it — since
 * any of them changes what the target holds.
 */
function markCycles(extenders: GroupNode[]): void {
  const key = (g: GroupNode) => g.path.join(".");
  const overlaps = (a: string, b: string) =>
    a === b || a.startsWith(b + ".") || b.startsWith(a + ".");
  const live = extenders.filter((g) => !g.extends!.error);
  const deps = (g: GroupNode) => live.filter((h) => overlaps(key(h), g.extends!.target!));
  const cyclic = live.filter((g) => {
    const seen = new Set<GroupNode>();
    const stack = deps(g);
    while (stack.length) {
      const h = stack.pop()!;
      if (h === g) return true;
      if (seen.has(h)) continue;
      seen.add(h);
      stack.push(...deps(h));
    }
    return false;
  });
  for (const g of cyclic) {
    g.extends!.error = `Circular ${g.extends!.via}: {${g.extends!.target}} leads back to "${key(g)}", directly or through other groups.`;
  }
}

/**
 * The group under `g` at `segments`, creating any missing group as an
 * inherited one; undefined when a token of `g`'s own is in the way.
 */
function holder(g: GroupNode, segments: string[], target: string): GroupNode | undefined {
  let at = g;
  for (let i = 0; i < segments.length; i++) {
    const name = segments[i];
    let next = at.children.find((c) => c.name === name);
    if (next?.kind === "token") return undefined;
    if (!next) {
      next = {
        kind: "group",
        name,
        path: [...at.path, name],
        inheritedFrom: [target, ...segments.slice(0, i + 1)].join("."),
        children: [],
      };
      at.children.push(next);
    }
    at = next;
  }
  return at;
}
