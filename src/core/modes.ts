/**
 * Modes: the contexts of a DTCG resolver modifier, seen from one of its files.
 *
 * A file a modifier's context lists whole (`light.tokens.json` under
 * `modifiers.theme.contexts.light`) is a **mode file**, and the visual editor
 * shows its tokens in every context of that modifier, side by side, the way
 * Figma shows a variable's modes. A file only a set lists, such as a
 * component tier, is not a mode file and gets none of this.
 *
 * Each cell is the token's value in that context's resolution, and the file
 * an edit to it writes: the context's last file, so a mode that layers
 * several files (dark, then high contrast) gains its own override rather
 * than changing the mode beneath it, as each Figma mode is edited alone. A context with no whole file of its own has
 * nowhere to write, and its cells are read-only.
 *
 * Paths are as the resolver writes them, relative to it; `read` maps one to
 * its text, with `""` meaning the resolver document itself.
 */
import { expandExtends } from "./extends"
import { parseTokens } from "./parse"
import { indexTokens, resolveAliases } from "./resolve"
import {
  pointerTarget,
  resolutionSources,
  type Resolver,
  type ResolverModifier,
  type Source,
} from "./resolver"
import type { TokenNode } from "./types"

export interface ModeCell {
  /** The authored `$value`; undefined when the context defines no such token. */
  value: unknown
  resolved?: unknown
  /** The file an edit writes, relative to the resolver; undefined is read-only. */
  file?: string
}

const clean = (file: string) => file.replace(/^(\.\/)+/, "")

/** A context's whole-file sources, lowest precedence first. */
const ownFiles = (sources: readonly Source[]) =>
  sources.filter(s => s.file && s.pointer === undefined).map(s => clean(s.file))

/**
 * The modifier `file` is a mode of, and the context it stands for: the first
 * whose last file it is. Undefined when it is no context's last file, which
 * a file only a set lists never is.
 */
export function modeOf(
  resolver: Resolver,
  file: string,
): { modifier: ResolverModifier; context: string } | undefined {
  const target = clean(file)
  for (const modifier of resolver.modifiers)
    for (const [context, sources] of modifier.contexts)
      if (ownFiles(sources).at(-1) === target) return { modifier, context }
  return undefined
}

/**
 * Each modifier's files: every whole file its contexts list, less any a set
 * also lists whole. Files in one group are that modifier's alternatives, or
 * the layers of one context, so a token path they share is deliberate; a set
 * file loads beside every context and is never in a group.
 */
export function modifierFiles(resolver: Resolver): string[][] {
  const inSets = new Set(
    resolver.steps.flatMap(s => ("files" in s ? ownFiles(s.files) : [])),
  )
  return resolver.modifiers.map(m =>
    [...new Set([...m.contexts.values()].flatMap(ownFiles))].filter(
      f => !inSets.has(f),
    ),
  )
}

/**
 * The cell for each of `keys` in `context` of `modifier`. `input` holds the
 * other modifiers' contexts; a modifier it leaves out takes its default.
 */
export function contextValues(
  resolver: Resolver,
  modifier: ResolverModifier,
  context: string,
  read: (file: string) => string | undefined,
  keys: readonly string[],
  input: Record<string, string> = {},
): Record<string, ModeCell> {
  const own = ownFiles(modifier.contexts.get(context) ?? [])
  const merged = new Map<string, TokenNode>()
  for (const ref of resolutionSources(resolver, {
    ...input,
    [modifier.name]: context,
  })) {
    const hash = ref.indexOf("#")
    const file = clean(hash === -1 ? ref : ref.slice(0, hash))
    const text = read(file)
    if (text === undefined) continue
    const target =
      hash === -1 ? { text } : pointerTarget(text, ref.slice(hash + 1))
    if (!target) continue
    // A group's `$extends` reaches this source's groups or an earlier one's.
    const model = parseTokens(target.text)
    expandExtends(model.root, merged)
    // Later sources win, so each one overwrites what came before it.
    for (const [key, token] of indexTokens(model)) merged.set(key, token)
  }
  // Flattened, an inherited token is a token of this context like any other.
  const children = [...merged.values()].map(t => ({
    ...t,
    inheritedFrom: undefined,
  }))
  const resolved = resolveAliases({
    root: { kind: "group", name: "", path: [], children },
  })
  const file = own.at(-1)
  return Object.fromEntries(
    keys.map(key => {
      const token = resolved.get(key)
      return [
        key,
        { value: token?.value, resolved: token?.resolvedValue, file },
      ]
    }),
  )
}
