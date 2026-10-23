/** Token value → CSS / compact text helpers shared by the table and the preview. */
import { toHex } from "../../core/color";
import { FONT_WEIGHT_KEYWORDS } from "../../core/types";

export type Obj = Record<string, unknown>;
export const obj = (v: unknown): Obj =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {};

/** DTCG dimension/duration → CSS length or time, optionally scaled. */
export function dim(d: unknown, scale = 1): string | null {
  if (typeof d === "number") return `${d * scale}px`;
  const o = obj(d);
  return typeof o.value === "number"
    ? `${o.value * scale}${typeof o.unit === "string" ? o.unit : "px"}`
    : null;
}
export const col = (c: unknown): string => toHex(c) ?? "transparent";
/** A value as text when nothing better fits: never `[object Object]`. */
const text = (v: unknown): string => (typeof v === "string" ? v : JSON.stringify(v));

/** The DTCG strokeStyle keywords, which a border's style takes too. */
export const STROKE_KEYWORDS = [
  "solid",
  "dashed",
  "dotted",
  "double",
  "groove",
  "ridge",
  "outset",
  "inset",
] as const;
/** The family stack as written, for table text. */
export const family = (f: unknown): string | undefined =>
  Array.isArray(f) ? f.join(", ") : typeof f === "string" ? f : undefined;

const GENERIC_FAMILIES = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-serif",
  "ui-sans-serif",
  "ui-monospace",
  "ui-rounded",
  "math",
  "emoji",
  "fangsong",
]);

/** The family stack as a CSS `font-family`: names quoted, and a generic
 *  fallback appended when the stack has none, so a font that isn't installed
 *  previews in a neutral sans rather than the browser's default serif. */
export function familyCss(f: unknown): string | undefined {
  const names = (Array.isArray(f) ? f : [f]).filter(
    (n): n is string => typeof n === "string" && n.trim() !== "",
  );
  if (names.length === 0) return undefined;
  const css = names.map((n) =>
    GENERIC_FAMILIES.has(n.trim()) ? n.trim() : JSON.stringify(n.trim()),
  );
  if (!names.some((n) => GENERIC_FAMILIES.has(n.trim()))) css.push("system-ui", "sans-serif");
  return css.join(", ");
}

/** DTCG 2025.10 fontWeight keywords and the numeric weight each names. */
export const WEIGHT_VALUES: Record<(typeof FONT_WEIGHT_KEYWORDS)[number], number> = {
  thin: 100,
  hairline: 100,
  "extra-light": 200,
  "ultra-light": 200,
  light: 300,
  normal: 400,
  regular: 400,
  book: 400,
  medium: 500,
  "semi-bold": 600,
  "demi-bold": 600,
  bold: 700,
  "extra-bold": 800,
  "ultra-bold": 800,
  black: 900,
  heavy: 900,
  "extra-black": 950,
  "ultra-black": 950,
};

/** A fontWeight value (number or keyword) as a CSS numeric weight. */
export function weightCss(v: unknown): number | undefined {
  if (typeof v === "number") return v;
  return typeof v === "string" && v in WEIGHT_VALUES
    ? WEIGHT_VALUES[v as keyof typeof WEIGHT_VALUES]
    : undefined;
}

/** The first keyword naming exactly this weight, or undefined for in-between weights. */
export function weightKeyword(n: number): (typeof FONT_WEIGHT_KEYWORDS)[number] | undefined {
  return FONT_WEIGHT_KEYWORDS.find((k) => WEIGHT_VALUES[k] === n);
}

export function shadowCss(v: unknown, scale = 1): string {
  const layers = Array.isArray(v) ? v : [v];
  return layers
    .map((l) => {
      const s = obj(l);
      return `${s.inset === true ? "inset " : ""}${dim(s.offsetX, scale) ?? "0"} ${dim(s.offsetY, scale) ?? "0"} ${dim(s.blur, scale) ?? "0"} ${dim(s.spread, scale) ?? "0"} ${col(s.color)}`;
    })
    .join(", ");
}

export function gradientCss(v: unknown): string | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  const stops = v.map((s) => {
    const o = obj(s);
    const pos = typeof o.position === "number" ? ` ${Math.round(o.position * 100)}%` : "";
    return `${col(o.color)}${pos}`;
  });
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

const bezier = (b: unknown) =>
  Array.isArray(b) && b.length === 4 ? `cubic-bezier(${b.join(", ")})` : null;

/** One-line summary of a value for table cells. */
export function summarize(value: unknown, type: string | undefined): string {
  if (value === undefined || value === null) return "";
  const v = obj(value);
  switch (type) {
    case "color":
      return toHex(value) ?? text(value);
    case "dimension":
    case "duration":
      return dim(value) ?? text(value);
    case "fontFamily":
      return family(value) ?? "";
    case "cubicBezier":
      return bezier(value) ?? JSON.stringify(value);
    case "typography":
      return [
        family(v.fontFamily),
        dim(v.fontSize),
        v.fontWeight,
        typeof v.lineHeight === "number" ? `/${v.lineHeight}` : null,
      ]
        .filter((x) => x !== undefined && x !== null && x !== "")
        .join(" ");
    case "shadow":
      return shadowCss(value);
    case "border":
      return `${dim(v.width) ?? ""} ${typeof v.style === "string" ? v.style : ""} ${toHex(v.color) ?? ""}`.trim();
    case "gradient":
      return Array.isArray(value) ? value.map((s) => toHex(obj(s).color) ?? "?").join(" → ") : "";
    case "transition":
      return [dim(v.duration), bezier(v.timingFunction), v.delay ? `delay ${dim(v.delay)}` : null]
        .filter(Boolean)
        .join(" ");
    case "strokeStyle":
      return typeof value === "string" ? value : "custom";
    default:
      return text(value);
  }
}
