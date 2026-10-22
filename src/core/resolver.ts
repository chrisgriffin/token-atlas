/**
 * DTCG Resolver Module 2025.10: a `.resolver.json` document that names which
 * token files make up each theme, mode or brand, and in what order.
 *
 * A resolver lists **sets** (files that are always on) and **modifiers** (a
 * choice between named contexts, such as `light` or `dark`). Its
 * `resolutionOrder` composes them, and on a conflict the later source wins.
 * Each combination of one context per modifier is a **resolution**. The host
 * offers every resolution in the active-set picker, and choosing one makes its
 * files, in order, the active set.
 *
 * A source is a whole local file, part of one (`file.json#/path`), or tokens
 * written inline in the resolver itself. A `$ref` replaces itself with what it
 * points at, so a fragment's children are top-level paths in that source.
 * Remote URLs are reported and skipped: fetching tokens over the network
 * because a workspace file says so is a trust call this extension does not make.
 */
import {
  findNodeAtLocation,
  parse,
  parseTree,
  printParseErrorCode,
  type ParseError,
} from "jsonc-parser";

/** The versions the spec names: its table says one, §4.1.2 the other. */
const VERSIONS = ["2025-11-01", "2025-10-01"];

export interface ResolverIssue {
  message: string;
  severity: "error" | "warning";
  /** JSON path of the offending value; `[]` is the whole document. */
  path: Array<string | number>;
  /** Set for a JSON syntax error, which has a position but no path. */
  offset?: number;
}

/**
 * Where a source's tokens are: `file` relative to the resolver document, or
 * `""` for the resolver document itself (inline tokens); `pointer`, a JSON
 * pointer such as `/color`, when only part of it is the source.
 */
export interface Source {
  file: string;
  pointer?: string;
  /** Where the source sits in the resolver, for a "not found" squiggle. */
  path: Array<string | number>;
}

export interface ResolverModifier {
  name: string;
  /** Context name → its files, in order. */
  contexts: Map<string, Source[]>;
  default?: string;
}

/** One `resolutionOrder` entry: a set's sources, or a modifier's choice. */
type Step = { files: Source[] } | { modifier: ResolverModifier };

export interface Resolver {
  name?: string;
  steps: Step[];
  /** Every modifier the order uses, in order. */
  modifiers: ResolverModifier[];
}

export interface Resolution {
  /** Modifier name → chosen context. Empty when the resolver has no modifiers. */
  input: Record<string, string>;
  /** `theme: dark · size: small`, or empty when there are no modifiers. */
  label: string;
}

/** Cheap fingerprint: a resolver document is the JSON with a `resolutionOrder`. */
export function looksLikeResolver(text: string): boolean {
  return /"resolutionOrder"\s*:/.test(text);
}

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v);

/** `["sets", "a/b", 0]` → `/sets/a~1b/0` (RFC 6901). */
export const toPointer = (path: Array<string | number>) =>
  path.map((p) => `/${String(p).replace(/~/g, "~0").replace(/\//g, "~1")}`).join("");

/** `/a~1b/0` → `["a/b", "0"]` (RFC 6901 unescaping). */
export const pointerSegments = (pointer: string): string[] =>
  pointer
    .split("/")
    .slice(1)
    .map((raw) => raw.replace(/~1/g, "/").replace(/~0/g, "~"));

/**
 * The JSON a pointer names in `text`: its own text, to parse as a token
 * document, its path from the root, to find a token's key again, and its
 * offset, to map an edit on that text back into the whole. Undefined when
 * nothing is there or it is not an object.
 */
export function pointerTarget(text: string, pointer: string): Fragment | undefined {
  const root = parseTree(text);
  if (!root) return undefined;
  const path: Array<string | number> = [];
  let node = root;
  for (const segment of pointerSegments(pointer)) {
    path.push(node.type === "array" ? Number(segment) : segment);
    const next = findNodeAtLocation(node, [path[path.length - 1]]);
    if (!next) return undefined;
    node = next;
  }
  if (node.type !== "object") return undefined;
  return { text: text.slice(node.offset, node.offset + node.length), path, offset: node.offset };
}

export interface Fragment {
  text: string;
  path: Array<string | number>;
  offset: number;
}

/**
 * Every token source written inline in a resolver document, once each: the
 * objects rename and find-references edit and search there, since the
 * resolver is never a token file of its own.
 */
export function inlineSources(text: string): Fragment[] {
  const { resolver } = parseResolver(text);
  if (!resolver) return [];
  const pointers = new Set<string>();
  for (const step of resolver.steps)
    if ("files" in step)
      for (const s of step.files) if (!s.file && s.pointer) pointers.add(s.pointer);
  for (const m of resolver.modifiers)
    for (const sources of m.contexts.values())
      for (const s of sources) if (!s.file && s.pointer) pointers.add(s.pointer);
  return [...pointers].flatMap((p) => pointerTarget(text, p) ?? []);
}

/**
 * Parse and check a resolver document. `resolver` is undefined when the
 * document is too broken to resolve; otherwise any issues are local and the
 * rest of it still works.
 */
export function parseResolver(text: string): { resolver?: Resolver; issues: ResolverIssue[] } {
  const issues: ResolverIssue[] = [];
  // A set is checked where it is defined and again wherever it is used, so
  // the same finding can come up more than once; report it once.
  const report = (
    severity: ResolverIssue["severity"],
    message: string,
    path: Array<string | number>,
  ) => {
    const key = JSON.stringify(path);
    if (!issues.some((x) => x.message === message && JSON.stringify(x.path) === key))
      issues.push({ message, severity, path });
  };
  const error = (message: string, path: Array<string | number>) => report("error", message, path);
  const warn = (message: string, path: Array<string | number>) => report("warning", message, path);

  const errors: ParseError[] = [];
  const doc: unknown = parse(text, errors, { allowTrailingComma: true });
  if (errors.length) {
    for (const e of errors) {
      issues.push({
        message: `JSON syntax error: ${printParseErrorCode(e.error)}`,
        severity: "error",
        path: [],
        offset: e.offset,
      });
    }
    return { issues };
  }
  if (!isObject(doc)) {
    error("A resolver document must be a JSON object.", []);
    return { issues };
  }

  if (doc.version === undefined) error(`"version" is required: "${VERSIONS[0]}".`, []);
  else if (typeof doc.version !== "string" || !VERSIONS.includes(doc.version))
    error(`"version" must be "${VERSIONS[0]}".`, ["version"]);

  const sets = isObject(doc.sets) ? doc.sets : {};
  if (doc.sets !== undefined && !isObject(doc.sets)) error(`"sets" must be an object.`, ["sets"]);
  const modifiers = isObject(doc.modifiers) ? doc.modifiers : {};
  if (doc.modifiers !== undefined && !isObject(doc.modifiers))
    error(`"modifiers" must be an object.`, ["modifiers"]);

  /**
   * The files one source stands for, with `#/sets/…` expanded in place.
   * `stack` holds the sets being expanded, so a set that reaches itself is a
   * cycle rather than an endless loop.
   */
  const expandOne = (source: unknown, path: Array<string | number>, stack: string[]): Source[] => {
    if (!isObject(source)) {
      error("A source must be a reference object or inline tokens.", path);
      return [];
    }
    const ref = source.$ref;
    // Inline tokens: the source is this object, in this document.
    if (ref === undefined) return [{ file: "", pointer: toPointer(path), path }];
    const refPath = [...path, "$ref"];
    if (typeof ref !== "string") {
      error(`"$ref" must be a string.`, refPath);
      return [];
    }
    if (ref.startsWith("#")) {
      const set = /^#\/sets\/([^/]+)$/.exec(ref)?.[1]?.replace(/~1/g, "/").replace(/~0/g, "~");
      if (ref.startsWith("#/modifiers/")) {
        error("A set or modifier must not reference a modifier.", refPath);
      } else if (ref.startsWith("#/resolutionOrder")) {
        error("Nothing may reference an item in resolutionOrder.", refPath);
      } else if (set === undefined) {
        // Anywhere else in this document (§4.2.1), such as one inline source.
        return [{ file: "", pointer: ref.slice(1), path: refPath }];
      } else if (!isObject(sets[set])) {
        error(`No set named "${set}".`, refPath);
      } else if (stack.includes(set)) {
        error(`Circular reference: set "${set}" includes itself.`, refPath);
      } else {
        return expand(sets[set].sources, ["sets", set, "sources"], [...stack, set]);
      }
      return [];
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(ref)) {
      warn(
        "Remote references are not supported: Token Atlas only reads files in the workspace. This source is skipped.",
        refPath,
      );
      return [];
    }
    const hash = ref.indexOf("#");
    if (hash === -1) return [{ file: ref, path: refPath }];
    // `file.json#/color`; the spec's own example writes `#sets/MySet`.
    const fragment = ref.slice(hash + 1);
    return [
      {
        file: ref.slice(0, hash),
        pointer: fragment.startsWith("/") ? fragment : `/${fragment}`,
        path: refPath,
      },
    ];
  };

  const expand = (sources: unknown, at: Array<string | number>, stack: string[]): Source[] => {
    if (!Array.isArray(sources)) {
      error("Sources must be an array.", at);
      return [];
    }
    return sources.flatMap((source, i) => expandOne(source, [...at, i], stack));
  };

  for (const [name, set] of Object.entries(sets)) {
    if (!isObject(set) || set.sources === undefined)
      error(`Set "${name}" must have a "sources" array.`, ["sets", name]);
    // Each referenced set is expanded where it is used; this checks the rest.
    else expand(set.sources, ["sets", name, "sources"], [name]);
  }

  const readModifier = (
    name: string,
    raw: Json,
    at: Array<string | number>,
  ): ResolverModifier | undefined => {
    if (!isObject(raw.contexts)) {
      error(`Modifier "${name}" must have a "contexts" object.`, at);
      return undefined;
    }
    const contexts = new Map<string, Source[]>();
    for (const [context, sources] of Object.entries(raw.contexts))
      contexts.set(context, expand(sources, [...at, "contexts", context], []));
    if (contexts.size === 0) {
      error(`Modifier "${name}" has no contexts.`, [...at, "contexts"]);
      return undefined;
    }
    if (contexts.size === 1)
      warn(`Modifier "${name}" has one context; a set says the same thing.`, [...at, "contexts"]);
    let fallback: string | undefined;
    if (raw.default !== undefined) {
      if (typeof raw.default === "string" && contexts.has(raw.default)) fallback = raw.default;
      else error(`"default" must name one of the contexts of "${name}".`, [...at, "default"]);
    }
    return { name, contexts, default: fallback };
  };

  const named = new Map<string, ResolverModifier | undefined>();
  for (const [name, raw] of Object.entries(modifiers)) {
    named.set(name, isObject(raw) ? readModifier(name, raw, ["modifiers", name]) : undefined);
    if (!isObject(raw)) error(`Modifier "${name}" must be an object.`, ["modifiers", name]);
  }

  if (!Array.isArray(doc.resolutionOrder)) {
    error(`"resolutionOrder" is required and must be an array.`, []);
    return { issues };
  }

  const steps: Step[] = [];
  const used: ResolverModifier[] = [];
  const inlineNames = new Set<string>();
  doc.resolutionOrder.forEach((item, i) => {
    const at = ["resolutionOrder", i];
    if (!isObject(item)) {
      error("Each item must be a reference object or an inline set or modifier.", at);
      return;
    }
    if (typeof item.$ref === "string") {
      const ref = item.$ref;
      const modifier = /^#\/modifiers\/(.+)$/.exec(ref)?.[1];
      if (modifier !== undefined) {
        if (!named.has(modifier)) error(`No modifier named "${modifier}".`, [...at, "$ref"]);
        const found = named.get(modifier);
        if (found) {
          steps.push({ modifier: found });
          used.push(found);
        }
      } else if (ref.startsWith("#")) {
        steps.push({ files: expandOne(item, at, []) });
      } else {
        // The spec leaves a reference out of the document undefined here.
        warn("A resolutionOrder reference must point into this document; it is skipped.", [
          ...at,
          "$ref",
        ]);
      }
      return;
    }
    const { name, type } = item;
    if (typeof name !== "string" || (type !== "set" && type !== "modifier")) {
      error(`An inline item needs a "name" and a "type" of "set" or "modifier".`, at);
      return;
    }
    if (inlineNames.has(name))
      error(`Duplicate name "${name}" in resolutionOrder.`, [...at, "name"]);
    inlineNames.add(name);
    if (type === "set") {
      steps.push({ files: expand(item.sources, [...at, "sources"], []) });
    } else {
      const found = readModifier(name, item, at);
      if (found) {
        steps.push({ modifier: found });
        used.push(found);
      }
    }
  });

  return {
    resolver: { name: typeof doc.name === "string" ? doc.name : undefined, steps, modifiers: used },
    issues,
  };
}

/** How many resolutions `resolutions()` would list, without listing them. */
export function resolutionCount(resolver: Resolver): number {
  return resolver.modifiers.reduce((n, m) => n * m.contexts.size, 1);
}

/** Every resolution: one per combination of contexts, defaults first. */
export function resolutions(resolver: Resolver): Resolution[] {
  let out: Resolution[] = [{ input: {}, label: "" }];
  for (const modifier of resolver.modifiers) {
    const contexts = [...modifier.contexts.keys()];
    if (modifier.default)
      contexts.sort((a, b) => +(b === modifier.default) - +(a === modifier.default));
    out = out.flatMap((r) =>
      contexts.map((context) => ({
        input: { ...r.input, [modifier.name]: context },
        label: [r.label, `${modifier.name}: ${context}`].filter(Boolean).join(" · "),
      })),
    );
  }
  return out;
}

/**
 * Why `input` is not a resolution of `resolver` (§6.1), or `[]` when it is: a
 * modifier the resolver does not have, a context its modifier does not have,
 * or a modifier left out that has no default. The picker only offers valid
 * inputs; this guards the ones a caller writes by hand.
 */
export function inputIssues(resolver: Resolver, input: Record<string, string>): string[] {
  const issues: string[] = [];
  const byName = new Map(resolver.modifiers.map((m) => [m.name, m]));
  for (const [name, context] of Object.entries(input)) {
    const modifier = byName.get(name);
    if (!modifier) issues.push(`No modifier named "${name}".`);
    else if (!modifier.contexts.has(context))
      issues.push(`Modifier "${name}" has no context "${context}".`);
  }
  for (const modifier of resolver.modifiers)
    if (!Object.hasOwn(input, modifier.name) && modifier.default === undefined)
      issues.push(`Modifier "${modifier.name}" needs a context: it has no default.`);
  return issues;
}

/**
 * The sources `input` resolves to, lowest precedence first: `file`,
 * `file#/pointer`, or `#/pointer` for this document. One listed twice keeps
 * only its last position, where it wins.
 */
export function resolutionSources(resolver: Resolver, input: Record<string, string>): string[] {
  const sources = resolver.steps.flatMap((step) =>
    "files" in step
      ? step.files
      : (step.modifier.contexts.get(input[step.modifier.name] ?? step.modifier.default ?? "") ??
        []),
  );
  const order = sources.map((s) => (s.pointer === undefined ? s.file : `${s.file}#${s.pointer}`));
  return order.filter((ref, i) => order.lastIndexOf(ref) === i);
}
