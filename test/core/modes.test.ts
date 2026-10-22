import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { contextValues, modeOf } from "../../src/core/modes";
import { parseResolver } from "../../src/core/resolver";

const DIR = "examples/09-resolver/";
const text = readFileSync(`${DIR}tokens.resolver.json`, "utf8");
const { resolver } = parseResolver(text);
const read = (file: string) => (file ? readFileSync(DIR + file, "utf8") : text);
const hex = (v: unknown) => (v as { hex?: string } | undefined)?.hex;

describe("modeOf", () => {
  it("finds the modifier and context a mode file stands for", () => {
    const light = modeOf(resolver!, "theme/light.tokens.json");
    expect(light?.modifier.name).toBe("theme");
    expect(light?.context).toBe("light");
    expect(modeOf(resolver!, "./theme/dark.tokens.json")?.context).toBe("dark");
    expect(modeOf(resolver!, "theme/high-contrast.tokens.json")?.context).toBe("darkHighContrast");
  });

  it("gives a file only a set lists no modes", () => {
    expect(modeOf(resolver!, "components.tokens.json")).toBeUndefined();
    expect(modeOf(resolver!, "base.tokens.json")).toBeUndefined();
  });
});

describe("contextValues", () => {
  const theme = modeOf(resolver!, "theme/light.tokens.json")!.modifier;
  const keys = ["theme.background", "theme.accent"];

  it("reads each context's authored and resolved value, and the file it writes", () => {
    const dark = contextValues(resolver!, theme, "dark", read, keys);
    expect(dark["theme.background"].value).toBe("{color.slate-900}");
    expect(hex(dark["theme.background"].resolved)).toBe("#0f172a");
    expect(dark["theme.background"].file).toBe("theme/dark.tokens.json");
    const light = contextValues(resolver!, theme, "light", read, keys);
    expect(hex(light["theme.accent"].resolved)).toBe("#2563eb");
    expect(light["theme.accent"].file).toBe("theme/light.tokens.json");
  });

  it("writes a layered mode to its own last file, never the mode beneath it", () => {
    const hc = contextValues(resolver!, theme, "darkHighContrast", read, keys);
    expect(hex(hc["theme.background"].resolved)).toBe("#000000");
    expect(hc["theme.background"].file).toBe("theme/high-contrast.tokens.json");
    // Inherited from dark: an edit adds a high-contrast override rather
    // than changing dark too.
    expect(hex(hc["theme.accent"].resolved)).toBe("#60a5fa");
    expect(hc["theme.accent"].file).toBe("theme/high-contrast.tokens.json");
  });

  it("leaves a token the context does not define without a value", () => {
    const cell = contextValues(resolver!, theme, "dark", read, ["theme.missing"])["theme.missing"];
    expect(cell.value).toBeUndefined();
    expect(cell.file).toBe("theme/dark.tokens.json");
  });
});
