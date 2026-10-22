/**
 * Tokens Studio metadata: the `$themes` block a Tokens Studio export carries.
 *
 * A theme names which token sets — the top-level groups of the file — are
 * live. Token Atlas ignores the block for parsing (every `$`-prefixed key is
 * metadata) but the host reads it here, so choosing a theme can decide which
 * sets a `{reference}` resolves against.
 */
import { parse } from "jsonc-parser";

export interface TokenTheme {
  /** Tokens Studio's own id, unique within the file. */
  id: string;
  name: string;
  /** Top-level groups this theme resolves against, in declaration order. */
  sets: string[];
}

interface RawTheme {
  id?: unknown;
  name?: unknown;
  selectedTokenSets?: unknown;
}

/**
 * Themes declared by `text`, or an empty list for a file that has none.
 *
 * `enabled` and `source` sets both contribute values — "source" means
 * referenced but not exported, which is still a definition as far as
 * resolution is concerned. `disabled` sets do not.
 */
export function readThemes(text: string): TokenTheme[] {
  let doc: unknown;
  try {
    doc = parse(text);
  } catch {
    return [];
  }
  const raw = (doc as { $themes?: unknown } | undefined)?.$themes;
  if (!Array.isArray(raw)) return [];

  const themes: TokenTheme[] = [];
  for (const entry of raw as RawTheme[]) {
    if (!entry || typeof entry !== "object") continue;
    const name = typeof entry.name === "string" ? entry.name : undefined;
    const id = typeof entry.id === "string" ? entry.id : name;
    const selected = entry.selectedTokenSets;
    if (!id || !name || !selected || typeof selected !== "object") continue;
    const sets = Object.entries(selected as Record<string, unknown>)
      .filter(([, state]) => state === "enabled" || state === "source")
      .map(([set]) => set);
    if (sets.length) themes.push({ id, name, sets });
  }
  return themes;
}
