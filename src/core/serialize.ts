/**
 * Format-preserving writes.
 *
 * The whole point of editing tokens in VS Code is git-clean diffs. We never
 * re-stringify the document; instead we compute the *minimal* set of edits with
 * jsonc-parser so changing one value touches only the bytes that changed and
 * preserves key order and indentation everywhere else.
 *
 * `computeSetEdits` returns raw jsonc edits (offset/length/content) so the host
 * can translate them into ranged `vscode.TextEdit`s for proper undo granularity.
 * `setTokenProperty` applies them to a string and is handy for tests.
 */
import {
  applyEdits,
  findNodeAtLocation,
  modify,
  parseTree,
  type Edit,
  type FormattingOptions,
  type Node,
} from "jsonc-parser";
import { parsePointer, parseTokens, referenceTarget } from "./parse";
import { indexTokens } from "./resolve";
import { toPointer } from "./resolver";
import { ILLEGAL_NAME } from "./validate";

export type { Edit } from "jsonc-parser";

/**
 * The file's own indentation and line ending: the first indented line says
 * tabs or spaces, the smallest space indent is one level, and any CRLF means
 * CRLF. A file with no indented line gets two spaces.
 */
function inferFormat(text: string): FormattingOptions {
  const indents = text.match(/^[ \t]+(?=\S)/gm) ?? [];
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  if (indents[0]?.startsWith("\t")) return { tabSize: 4, insertSpaces: false, eol };
  const widths = indents.filter((i) => !i.includes("\t")).map((i) => i.length);
  return { tabSize: widths.length ? Math.min(...widths) : 2, insertSpaces: true, eol };
}

/**
 * Set (or, if `value === undefined`, remove) a `$`-property on a token/group.
 * Adding and removing go through computeAddEdits and computeDeleteEdits, so a
 * one-line token stays on its line; replacing rewrites only the value.
 */
export function computeSetEdits(
  text: string,
  nodePath: string[],
  property: string,
  value: unknown,
  format: FormattingOptions = inferFormat(text),
): Edit[] {
  const path = [...nodePath, property];
  const root = parseTree(text);
  const exists = root !== undefined && findNodeAtLocation(root, path) !== undefined;
  if (value === undefined) return exists ? computeDeleteEdits(text, path, format) : [];
  if (!exists && objectAt(text, nodePath)) {
    return computeAddEdits(text, nodePath, property, value, format);
  }
  return modify(text, path, value, { formattingOptions: format });
}

export function setTokenProperty(
  text: string,
  nodePath: string[],
  property: string,
  value: unknown,
  format: FormattingOptions = inferFormat(text),
): string {
  return applyEdits(text, computeSetEdits(text, nodePath, property, value, format));
}

/**
 * A structural edit would land on a name its group already has: adding would
 * overwrite that node, renaming would write a duplicate key. Thrown instead of
 * returning edits, so the file is left unchanged and the caller can say why.
 */
export class NameTakenError extends Error {
  constructor(parentPath: string[], name: string) {
    const group = parentPath.length ? `"${parentPath.join(".")}"` : "The file";
    super(`${group} already has a token or group named "${name}".`);
    this.name = "NameTakenError";
  }
}

/**
 * A rename to a name a token or group cannot have: empty, holding `{`, `}` or
 * `.` (§5.1.1), or starting with `$`, which is the spec's own (§6.8) — except
 * `$root`, the reserved root token name (§6.2). Thrown, like NameTakenError.
 */
export class InvalidNameError extends Error {
  constructor(name: string) {
    super(
      `"${name}" is not a valid name: token names may not be empty or contain "{", "}" or ".", and only "$root" may start with "$".`,
    );
    this.name = "InvalidNameError";
  }
}

function assertNameFree(text: string, parentPath: string[], name: string): void {
  const root = parseTree(text);
  if (root && findNodeAtLocation(root, [...parentPath, name])) {
    throw new NameTakenError(parentPath, name);
  }
}

/**
 * Add a new token (default `$value: 0`) or group ({}) under `parentPath`.
 *
 * jsonc-parser's `modify` reformats every line its edit touches, and an
 * append starts on the last sibling's line — so a one-line sibling like
 * `"lg": { "$value": 2 }` came back spread over three lines (#304). When the
 * parent already has a sibling, we write the new property on its own line at
 * that sibling's indent and touch nothing before its closing bytes but a comma.
 */
export function computeAddEdits(
  text: string,
  parentPath: string[],
  name: string,
  value: unknown,
  format: FormattingOptions = inferFormat(text),
): Edit[] {
  assertNameFree(text, parentPath, name);
  const parent = objectAt(text, parentPath);
  const last = parent?.children?.[parent.children.length - 1];
  // A parent written on one line stays on it.
  if (parent && last && !/[\r\n]/.test(text.slice(parent.offset, end(parent)))) {
    return [
      { offset: end(last), length: 0, content: `, ${JSON.stringify(name)}: ${inline(value)}` },
    ];
  }
  const indent = last && indentOf(text, last);
  if (!parent || !last || indent === undefined || !isBlank(text, end(last), end(parent) - 1)) {
    return modify(text, [...parentPath, name], value, { formattingOptions: format });
  }
  const eol = format.eol ?? "\n";
  const unit = format.insertSpaces === false ? "\t" : " ".repeat(format.tabSize ?? 2);
  const body = JSON.stringify(value, null, unit).replace(/\n/g, eol + indent);
  return [
    { offset: end(last), length: 0, content: `,${eol}${indent}${JSON.stringify(name)}: ${body}` },
  ];
}

/**
 * Delete a token or group at `nodePath`.
 *
 * Same cause as computeAddEdits (#304): `modify` reformats the surviving
 * neighbour. When the property has a sibling and only a comma and whitespace
 * separate them, we cut the property and one separator and leave the
 * survivor's bytes alone.
 */
export function computeDeleteEdits(
  text: string,
  nodePath: string[],
  format: FormattingOptions = inferFormat(text),
): Edit[] {
  const parent = objectAt(text, nodePath.slice(0, -1));
  const props = parent?.children ?? [];
  const i = props.findIndex((p) => p.children?.[0]?.value === nodePath[nodePath.length - 1]);
  const prop = props[i];
  const next = props[i + 1];
  const prev = props[i - 1];
  // Not the last: cut from the property to the next one, which takes the
  // property's own indent with it and leaves the next one's in place.
  if (prop && next && isSeparator(text, end(prop), next.offset)) {
    return [{ offset: prop.offset, length: next.offset - prop.offset, content: "" }];
  }
  // The last: cut from the end of the previous one, its comma included.
  if (prop && prev && isSeparator(text, end(prev), prop.offset)) {
    return [{ offset: end(prev), length: end(prop) - end(prev), content: "" }];
  }
  return modify(text, nodePath, undefined, { formattingOptions: format });
}

function objectAt(text: string, path: string[]): Node | undefined {
  const root = parseTree(text);
  const node = root && (path.length ? findNodeAtLocation(root, path) : root);
  return node?.type === "object" ? node : undefined;
}

const end = (node: Node): number => node.offset + node.length;

const isBlank = (text: string, from: number, to: number): boolean =>
  /^\s*$/.test(text.slice(from, to));

const isSeparator = (text: string, from: number, to: number): boolean =>
  /^\s*,\s*$/.test(text.slice(from, to));

/** JSON on one line, spaced the way a person writes an inline object. */
export function inline(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(inline).join(", ")}]`;
  if (v && typeof v === "object") {
    const members = Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`);
    return members.length ? `{ ${members.join(", ")} }` : "{}";
  }
  return JSON.stringify(v);
}

/** The whitespace before `node` on its line, or undefined if anything else is there. */
function indentOf(text: string, node: Node): string | undefined {
  const lineStart = text.lastIndexOf("\n", node.offset - 1) + 1;
  const lead = text.slice(lineStart, node.offset);
  return /^[ \t]*$/.test(lead) ? lead : undefined;
}

/**
 * Rename a token/group key, preserving its value, position, and formatting,
 * and rewrite every `{reference}` in this document that pointed at it (or,
 * for a group, at any of its descendants).
 *
 * jsonc-parser has no atomic rename, so we replace just the key string token
 * found via the parse tree — leaving the value and sibling order untouched.
 * References in other files are the host's job: see computeReferenceRenameEdits.
 */
export function computeRenameEdits(text: string, nodePath: string[], newName: string): Edit[] {
  if (!newName || ILLEGAL_NAME.test(newName) || (newName.startsWith("$") && newName !== "$root")) {
    throw new InvalidNameError(newName);
  }
  const oldName = nodePath[nodePath.length - 1];
  if (oldName === newName) return [];
  const root = parseTree(text);
  if (!root) return [];
  const valueNode = findNodeAtLocation(root, nodePath);
  const keyNode = valueNode?.parent?.children?.[0];
  if (!keyNode) return [];
  assertNameFree(text, nodePath.slice(0, -1), newName);
  const newPath = [...nodePath.slice(0, -1), newName].join(".");
  return [
    { offset: keyNode.offset, length: keyNode.length, content: JSON.stringify(newName) },
    ...referenceEdits(root, nodePath.join("."), newPath),
  ];
}

/**
 * Rewrite every `{reference}` under a `$value`, every `$ref` pointer and every
 * `$extends` whose target is `oldPath` or a descendant of it, to point at
 * `newPath`. For the files that only *use* a
 * renamed token — no key to rename there.
 *
 * Local-first (CLAUDE.md invariant 4): a file that itself defines `oldPath`,
 * or any token under it, resolves those references to its own tokens, so it
 * gets no edits — renaming brand A's `color.brand.primary` must not touch
 * brand B's reference to its own.
 */
export function computeReferenceRenameEdits(
  text: string,
  oldPath: string,
  newPath: string,
): Edit[] {
  const root = parseTree(text);
  if (!root) return [];
  const local = indexTokens(parseTokens(text));
  if (local.has(oldPath) || [...local.keys()].some((k) => k.startsWith(oldPath + "."))) return [];
  return referenceEdits(root, oldPath, newPath);
}

function referenceEdits(root: Node, oldPath: string, newPath: string): Edit[] {
  const edits: Edit[] = [];
  const moved = (target: string | undefined) =>
    target !== undefined && (target === oldPath || target.startsWith(oldPath + "."))
      ? newPath + target.slice(oldPath.length)
      : undefined;
  const walk = (node: Node, inValue: boolean): void => {
    if (node.type === "property") {
      const [key, value] = node.children ?? [];
      if ((key?.value === "$ref" || key?.value === "$extends") && value?.type === "string") {
        const next = renamedReference(String(value.value), moved);
        if (next !== undefined) {
          edits.push({ offset: value.offset, length: value.length, content: JSON.stringify(next) });
        }
        return;
      }
      if (value) walk(value, inValue || key?.value === "$value");
      return;
    }
    if (node.type === "string" && inValue && typeof node.value === "string") {
      const next = moved(referenceTarget(node.value));
      if (next !== undefined) {
        edits.push({
          offset: node.offset,
          length: node.length,
          content: JSON.stringify(`{${next}}`),
        });
      }
      return;
    }
    for (const child of node.children ?? []) walk(child, inValue);
  };
  walk(root, false);
  return edits;
}

/**
 * A `$ref`/`$extends` value with its path moved, or undefined when it does not
 * name a moved path. A pointer keeps whatever follows the token path
 * (`/$value/components/0`) and RFC 6901 escaping.
 */
function renamedReference(
  value: string,
  moved: (target: string | undefined) => string | undefined,
): string | undefined {
  const curly = moved(referenceTarget(value));
  if (curly !== undefined) return `{${curly}}`;
  const pointer = parsePointer(value);
  const next = moved(pointer?.key);
  if (!pointer || next === undefined) return undefined;
  return "#" + toPointer([...next.split("."), ...pointer.sub]);
}

/**
 * Swap two sibling properties (by key) within the object at `parentPath`.
 * Used for move-up / move-down: the separators stay put and only the two
 * property bodies trade places, so the diff is exactly the moved entries.
 */
export function computeSwapEdits(
  text: string,
  parentPath: string[],
  keyA: string,
  keyB: string,
): Edit[] {
  const root = parseTree(text);
  if (!root) return [];
  const parent = parentPath.length ? findNodeAtLocation(root, parentPath) : root;
  if (!parent || parent.type !== "object" || !parent.children) return [];

  const findProp = (key: string) =>
    parent.children!.find((c) => c.type === "property" && c.children?.[0]?.value === key);

  const a = findProp(keyA);
  const b = findProp(keyB);
  if (!a || !b) return [];

  const aText = text.substring(a.offset, a.offset + a.length);
  const bText = text.substring(b.offset, b.offset + b.length);
  return [
    { offset: a.offset, length: a.length, content: bText },
    { offset: b.offset, length: b.length, content: aText },
  ];
}

/**
 * Reorder the children of the group at `parentPath` so their keys follow
 * `order`. Only the non-`$` properties move; `$type`, `$description` and
 * friends keep their slots. Each moving property's full text (key, value,
 * comments inside it) is written into another property's range, so the
 * commas and whitespace between properties are untouched — the same trick
 * as computeSwapEdits, generalised to a permutation.
 */
export function computeReorderEdits(text: string, parentPath: string[], order: string[]): Edit[] {
  const root = parseTree(text);
  if (!root) return [];
  const parent = parentPath.length ? findNodeAtLocation(root, parentPath) : root;
  if (!parent || parent.type !== "object" || !parent.children) return [];

  const props = parent.children.filter(
    (c) =>
      c.type === "property" &&
      typeof c.children?.[0]?.value === "string" &&
      !(c.children[0].value as string).startsWith("$"),
  );
  const byKey = new Map(props.map((p) => [p.children![0].value as string, p]));
  if (order.length !== props.length || order.some((k) => !byKey.has(k))) return [];

  const edits: Edit[] = [];
  props.forEach((slot, i) => {
    const incoming = byKey.get(order[i])!;
    if (incoming === slot) return;
    edits.push({
      offset: slot.offset,
      length: slot.length,
      content: text.substring(incoming.offset, incoming.offset + incoming.length),
    });
  });
  return edits;
}
