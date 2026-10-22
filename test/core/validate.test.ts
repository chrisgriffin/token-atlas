import { describe, it, expect } from "vitest";
import { parseTokens } from "../../src/core/parse";
import { resolveAliases } from "../../src/core/resolve";
import { validate } from "../../src/core/validate";

function issuesFor(doc: Record<string, unknown>) {
  const model = parseTokens(JSON.stringify(doc));
  resolveAliases(model);
  return validate(model).issues;
}
const shapeErrors = (doc: Record<string, unknown>) =>
  issuesFor(doc).filter((i) => /\$value must be/.test(i.message));

describe("validate — $value shape for color, dimension, duration", () => {
  const good = {
    colorSpace: "srgb",
    components: [0, 0, 1],
  };

  it("flags a legacy string color as an error naming the expected shape", () => {
    const errs = shapeErrors({ color: { $type: "color", a: { $value: "#ff0000" } } });
    expect(errs).toHaveLength(1);
    expect(errs[0].severity).toBe("error");
    expect(errs[0].path).toEqual(["color", "a"]);
    expect(errs[0].message).toMatch(/colorSpace/);
    expect(errs[0].message).toMatch(/components/);
  });

  it("flags a legacy string dimension and a string duration", () => {
    const errs = shapeErrors({
      space: { $type: "dimension", md: { $value: "16px" } },
      motion: { $type: "duration", fast: { $value: "150ms" } },
    });
    expect(errs.map((e) => e.path.join("."))).toEqual(["space.md", "motion.fast"]);
    for (const e of errs) expect(e.message).toMatch(/value.*unit/);
  });

  it("flags an object missing a required member", () => {
    const errs = shapeErrors({
      color: { $type: "color", a: { $value: { colorSpace: "srgb" } } },
      space: { $type: "dimension", md: { $value: { value: 16 } } },
    });
    expect(errs).toHaveLength(2);
  });

  it("says whether a member is missing or merely the wrong type", () => {
    const [missing, wrong] = shapeErrors({
      space: {
        $type: "dimension",
        a: { $value: { value: 16 } },
        b: { $value: { value: "16", unit: "px" } },
      },
    });
    expect(missing.message).toMatch(/unit missing/);
    expect(wrong.message).toMatch(/value a string \(expected number\)/);
    expect(wrong.message).not.toMatch(/missing/);
  });

  it("accepts a well-formed object of each type", () => {
    expect(
      shapeErrors({
        color: { $type: "color", a: { $value: good } },
        space: { $type: "dimension", md: { $value: { value: 16, unit: "px" } } },
        motion: { $type: "duration", fast: { $value: { value: 150, unit: "ms" } } },
      }),
    ).toEqual([]);
  });

  it("reports nothing new for an alias or a token with no $type", () => {
    const issues = issuesFor({
      color: { $type: "color", a: { $value: good }, b: { $value: "{color.a}" } },
      untyped: { x: { $value: "#ff0000" } },
    });
    expect(issues.filter((i) => /\$value must be/.test(i.message))).toEqual([]);
    // The untyped token is still reported once, for the missing $type only.
    expect(issues.filter((i) => i.path.join(".") === "untyped.x")).toHaveLength(1);
  });
});

describe("validate — $value shape for number, fontWeight, cubicBezier, fontFamily", () => {
  it("flags a string number and accepts a numeric one", () => {
    expect(shapeErrors({ n: { $type: "number", bad: { $value: "16" } } })).toHaveLength(1);
    expect(shapeErrors({ n: { $type: "number", ok: { $value: 1.25 } } })).toEqual([]);
  });

  it("fontWeight accepts a number or a spec keyword and rejects anything else", () => {
    expect(
      shapeErrors({
        w: {
          $type: "fontWeight",
          num: { $value: 600 },
          kw: { $value: "semi-bold" },
          kw2: { $value: "extra-black" },
        },
      }),
    ).toEqual([]);
    const errs = shapeErrors({ w: { $type: "fontWeight", bad: { $value: "boldish" } } });
    expect(errs).toHaveLength(1);
    expect(errs[0].message).toMatch(/keyword/);
  });

  it("cubicBezier must be exactly four numbers", () => {
    expect(shapeErrors({ e: { $type: "cubicBezier", ok: { $value: [0.4, 0, 0.2, 1] } } })).toEqual(
      [],
    );
    const errs = shapeErrors({
      e: {
        $type: "cubicBezier",
        three: { $value: [0.4, 0, 0.2] },
        strings: { $value: ["0.4", "0", "0.2", "1"] },
        str: { $value: "ease-in" },
      },
    });
    expect(errs.map((e) => e.path[1])).toEqual(["three", "strings", "str"]);
    expect(errs[0].message).toMatch(/four numbers/);
  });

  it("fontFamily accepts a string or an array of strings", () => {
    expect(
      shapeErrors({
        f: {
          $type: "fontFamily",
          one: { $value: "Inter" },
          stack: { $value: ["Inter", "sans-serif"] },
        },
      }),
    ).toEqual([]);
    const errs = shapeErrors({
      f: { $type: "fontFamily", num: { $value: 12 }, mixed: { $value: ["Inter", 3] } },
    });
    expect(errs.map((e) => e.path[1])).toEqual(["num", "mixed"]);
  });

  it("reports nothing new for an alias or a token with no $type", () => {
    const issues = issuesFor({
      n: { $type: "number", a: { $value: 1 }, b: { $value: "{n.a}" } },
      untyped: { x: { $value: "16" } },
    });
    expect(issues.filter((i) => /\$value must be/.test(i.message))).toEqual([]);
  });
});

describe("validate with a local scope", () => {
  const model = () =>
    parseTokens(
      JSON.stringify({
        light: { surface: { $type: "number", $value: 1 } },
        semantic: { page: { $type: "number", $value: "{light.surface}" } },
      }),
    );

  it("accepts a local reference when no scope is given", () => {
    const m = model();
    resolveAliases(m);
    expect(validate(m).issues).toEqual([]);
  });

  it("reports a reference into an out-of-scope key as unresolved", () => {
    const m = model();
    const scope = (key: string) => key.startsWith("semantic.");
    resolveAliases(m, undefined, scope);
    const { issues } = validate(m, undefined, scope);
    expect(issues).toEqual([
      {
        severity: "error",
        path: ["semantic", "page"],
        message: "Unresolved reference: {light.surface}",
      },
    ]);
  });
});
