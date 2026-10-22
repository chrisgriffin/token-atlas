import { parseTokens } from "./parse";
import type { TokenDocumentModel } from "./types";

/**
 * Parsed models keyed by file, reused while a file's text is unchanged.
 *
 * The Tokens panel rebuilds from every token file in the workspace whenever
 * any one of them changes; without this, a keystroke in one file re-parses
 * all of them. A parse that throws is not cached, so a file mid-edit is
 * retried on the next call.
 */
export function createParseCache(parse: (text: string) => TokenDocumentModel = parseTokens) {
  const entries = new Map<string, { text: string; model: TokenDocumentModel }>();
  return {
    get(key: string, text: string): TokenDocumentModel {
      const hit = entries.get(key);
      if (hit && hit.text === text) return hit.model;
      const model = parse(text);
      entries.set(key, { text, model });
      return model;
    },
    /** Drop entries for files that are gone, so the cache cannot outgrow the workspace. */
    retain(keys: Set<string>): void {
      for (const key of entries.keys()) if (!keys.has(key)) entries.delete(key);
    },
  };
}
