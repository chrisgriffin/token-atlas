/** A sensible starting `$value` for each DTCG type, used when a token is
 *  given a type while it still carries the bare `0` it was created with.
 *  Colour space and dimension unit follow the user's settings. */
import type { TokenType } from "../../core/types";
import type { EditorSettings } from "../../shared/protocol";
import { settings as currentSettings } from "./settings";

/** A length in the configured unit: `rem` values are converted from px. */
function length(valuePx: number, s: EditorSettings) {
  if (s.defaultDimensionUnit !== "rem") return { value: valuePx, unit: "px" as const };
  const rem = s.rootFontSize > 0 ? valuePx / s.rootFontSize : valuePx;
  return { value: Math.round(rem * 1000) / 1000, unit: "rem" as const };
}

export function defaultValueFor(type: TokenType, s: EditorSettings = currentSettings()): unknown {
  const px = (value: number) => length(value, s);
  switch (type) {
    case "color":
      // `hex` is an sRGB fallback; it would contradict a wide-gamut space.
      return s.defaultColorSpace === "srgb"
        ? { colorSpace: "srgb", components: [0, 0, 0], hex: "#000000" }
        : { colorSpace: s.defaultColorSpace, components: [0, 0, 0] };
    case "dimension":
      return px(16);
    case "fontFamily":
      return "sans-serif";
    case "fontWeight":
      return 400;
    case "duration":
      return { value: 200, unit: "ms" };
    case "cubicBezier":
      return [0.25, 0.1, 0.25, 1];
    case "number":
      return 1;
    case "strokeStyle":
      return "solid";
    case "border":
      return { color: "#000000", width: px(1), style: "solid" };
    case "transition":
      return {
        duration: { value: 200, unit: "ms" },
        delay: { value: 0, unit: "ms" },
        timingFunction: [0.25, 0.1, 0.25, 1],
      };
    case "shadow":
      return { color: "#00000033", offsetX: px(0), offsetY: px(2), blur: px(4), spread: px(0) };
    case "gradient":
      return [
        { color: "#000000", position: 0 },
        { color: "#ffffff", position: 1 },
      ];
    case "typography":
      return {
        fontFamily: "sans-serif",
        fontSize: px(16),
        fontWeight: 400,
        letterSpacing: px(0),
        lineHeight: 1.5,
      };
  }
}

/** True for the placeholder `$value` a freshly added token carries. */
export const isPlaceholderValue = (v: unknown): boolean => v === 0 || v === "" || v == null;
