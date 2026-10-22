import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseTokens } from "../../src/core/parse";
import { lintTokens, parseLintConfig, LINT_RULE_IDS, NAME_CASES } from "../../src/core/lint";
import { CONTRAST_TARGETS } from "../../src/core/color";

const parse = (config: unknown) => parseLintConfig(JSON.stringify(config));

describe("parseLintConfig — valid input", () => {
  it("reads every key and reports nothing", () => {
    const { config, issues } = parse({
      $schema: "./node_modules/whatever.json",
      _comment: "documentary keys are ignored",
      tiers: ["base", "system"],
      vocabularies: [{ paths: ["system.radius"], values: ["sm", "md"], _why: "t-shirt" }],
      rampPaths: ["color.*.ramp"],
      naming: { case: "kebab-case" },
      rules: { "token-atlas/name-case": "error", _note: "off for now" },
    });
    expect(issues).toEqual([]);
    expect(config.tiers).toEqual(["base", "system"]);
    expect(config.vocabularies).toEqual([{ paths: ["system.radius"], values: ["sm", "md"] }]);
    expect(config.rampPaths).toEqual(["color.*.ramp"]);
    expect(config.naming).toEqual({ case: "kebab-case" });
    expect(config.rules).toEqual({ "token-atlas/name-case": "error" });
  });

  it("reads contrastPairs, defaulting the target to AA", () => {
    const { config, issues } = parse({
      contrastPairs: [
        { foreground: "text.body", background: "surface.page", target: "AAA", _why: "body copy" },
        { foreground: "text.muted", background: "surface.page" },
        { foreground: "icon.ui", background: "surface.page", target: 3 },
      ],
    });
    expect(issues).toEqual([]);
    expect(config.contrastPairs).toEqual([
      { foreground: "text.body", background: "surface.page", target: "AAA" },
      { foreground: "text.muted", background: "surface.page", target: "AA" },
      { foreground: "icon.ui", background: "surface.page", target: 3 },
    ]);
  });

  it("leaves contrastPairs unset when the key is absent", () => {
    expect(parse({ tiers: ["a", "b"] }).config.contrastPairs).toBeUndefined();
  });

  it("treats an empty file as an empty config", () => {
    expect(parseLintConfig("  \n").issues).toEqual([]);
  });
});

describe("parseLintConfig — invalid input is a report, never a throw", () => {
  it("reports bad JSON at its offset, and no rule runs", () => {
    const text = '{ "tiers": ["a", "b"], }';
    const { config, issues } = parseLintConfig(text);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/not valid JSON/);
    expect(issues[0].offset).toBe(text.indexOf("}", 20));
    expect(config.tiers).toBeUndefined();
  });

  it("reports a top level that is not an object", () => {
    expect(parse([1, 2]).issues[0].message).toMatch(/object/);
  });

  it("reports an unknown key without silencing anything", () => {
    const { config, issues } = parse({ tiers: ["a", "b"], tier: ["x"] });
    expect(issues.map((i) => i.path)).toEqual([["tier"]]);
    expect(issues[0].message).toContain('"tier"');
    expect(config.tiers).toEqual(["a", "b"]);
  });

  it("reports an unknown rule id and a bad severity, and silences that rule", () => {
    const { config, issues } = parse({
      tiers: ["a", "b"],
      rules: { "token-atlas/nope": "warn", "token-atlas/tier-alias-inverted": "loud" },
    });
    expect(issues.map((i) => i.path)).toEqual([
      ["rules", "token-atlas/nope"],
      ["rules", "token-atlas/tier-alias-inverted"],
    ]);
    const model = parseTokens(JSON.stringify({ a: { x: { $type: "number", $value: "{b.y}" } } }));
    expect(lintTokens(model, config)).toEqual([]);
  });

  it("points at the wrong-typed element and keeps that rule silent", () => {
    const { config, issues } = parse({ tiers: ["a", 2] });
    expect(issues.map((i) => i.path)).toEqual([["tiers", 1]]);
    expect(config.tiers).toBeUndefined();
  });

  it("silences both rules that read a broken vocabulary", () => {
    const { config, issues } = parse({
      naming: { case: "camelCase" },
      vocabularies: [{ paths: ["size"] }],
    });
    expect(issues.map((i) => i.path)).toEqual([["vocabularies", 0, "values"]]);
    const model = parseTokens(
      JSON.stringify({ size: { "Not-Camel": { $type: "number", $value: 1 } } }),
    );
    expect(lintTokens(model, config)).toEqual([]);
  });

  it("reports a broken contrast pair and silences only the contrast rule", () => {
    const { config, issues } = parse({
      tiers: ["a", "b"],
      contrastPairs: [
        { foreground: "text", background: "" },
        { foreground: "text", background: "bg", target: "aa" },
        { foreground: "text", background: "bg", target: 30 },
        { fg: "text", foreground: "text", background: "bg" },
        "text on bg",
      ],
    });
    expect(issues.map((i) => i.path)).toEqual([
      ["contrastPairs", 0, "background"],
      ["contrastPairs", 1, "target"],
      ["contrastPairs", 2, "target"],
      ["contrastPairs", 3, "fg"],
      ["contrastPairs", 4],
    ]);
    expect(issues[1].message).toContain("AA-large");
    expect(config.contrastPairs).toBeUndefined();
    expect([...config.silenced]).toEqual(["token-atlas/contrast-insufficient"]);
    expect(config.tiers).toEqual(["a", "b"]);
    const model = parseTokens(
      JSON.stringify({
        text: { $type: "color", $value: { colorSpace: "srgb", components: [1, 1, 1] } },
        bg: { $type: "color", $value: { colorSpace: "srgb", components: [1, 1, 1] } },
      }),
    );
    expect(lintTokens(model, config)).toEqual([]);
  });

  it("reports an unknown naming case, listing the ones it accepts", () => {
    const { issues } = parse({ naming: { case: "Title Case" } });
    expect(issues.map((i) => i.path)).toEqual([["naming", "case"]]);
    for (const c of NAME_CASES) expect(issues[0].message).toContain(c);
  });

  it("reports wrong types for every key", () => {
    const { issues } = parse({
      tiers: "base",
      vocabularies: {},
      rampPaths: [""],
      naming: "camelCase",
      contrastPairs: {},
      rules: [],
    });
    expect(issues.map((i) => i.path)).toEqual([
      ["tiers"],
      ["vocabularies"],
      ["rampPaths", 0],
      ["naming"],
      ["contrastPairs"],
      ["rules"],
    ]);
  });
});

describe("the shipped JSON Schema agrees with the parser", () => {
  const schema = JSON.parse(
    readFileSync(join(__dirname, "../../schemas/token-atlas.lint.schema.json"), "utf8"),
  );

  it("names the same top-level keys", () => {
    expect(Object.keys(schema.properties).sort()).toEqual(
      ["$schema", "tiers", "vocabularies", "rampPaths", "naming", "contrastPairs", "rules"].sort(),
    );
  });

  it("names the same rule ids and cases", () => {
    expect(Object.keys(schema.properties.rules.properties)).toEqual([...LINT_RULE_IDS]);
    expect(schema.properties.naming.properties.case.enum).toEqual([...NAME_CASES]);
    expect(schema.definitions.contrastTarget.oneOf[0].enum).toEqual(Object.keys(CONTRAST_TARGETS));
  });
});
