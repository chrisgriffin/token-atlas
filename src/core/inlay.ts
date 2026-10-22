/**
 * The label an inlay hint shows after a `{reference}`: the value it finally
 * resolves to, on one short line. Pure; the host resolves the value.
 */
import { describeValue } from "./aliases";
import { isDtcgColor, toColor } from "./color";
import type { TokenType } from "./types";

const MAX = 40;

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** `#rrggbb[aa]` inside sRGB; outside it, the color's CSS form in its own space. */
function color(v: unknown): string | undefined {
  const c = toColor(v);
  if (!c) return undefined;
  try {
    if (c.inGamut("srgb")) return c.to("srgb").toString({ format: "hex", collapse: false });
    return c.toString({ precision: 3 });
  } catch {
    return undefined;
  }
}

/** One sub-value, with no composite of its own. */
function part(v: unknown): string {
  if (isDtcgColor(v)) return color(v) ?? "color";
  return describeValue(v);
}

function shadow(v: unknown): string {
  const o = obj(v);
  const offsets = [o.offsetX, o.offsetY, o.blur, o.spread].map((d) => part(d ?? 0));
  return [o.inset === true ? "inset" : "", ...offsets, part(o.color)].filter(Boolean).join(" ");
}

function composite(v: unknown, type: TokenType | undefined): string | undefined {
  const o = obj(v);
  switch (type) {
    case "shadow": {
      const layers = Array.isArray(v) ? v : [v];
      return shadow(layers[0]) + (layers.length > 1 ? ` +${layers.length - 1}` : "");
    }
    case "typography": {
      const family = Array.isArray(o.fontFamily) ? o.fontFamily[0] : o.fontFamily;
      const size = part(o.fontSize) + (o.lineHeight !== undefined ? `/${part(o.lineHeight)}` : "");
      return [o.fontWeight, size, family]
        .filter((x) => x !== undefined && x !== "")
        .map(part)
        .join(" ");
    }
    case "border":
      return [o.width, typeof o.style === "string" ? o.style : "custom", o.color]
        .map(part)
        .join(" ");
    case "transition":
      return [o.duration, o.timingFunction, o.delay]
        .filter((x) => x !== undefined)
        .map(part)
        .join(" ");
    case "gradient":
      return Array.isArray(v) ? v.map((s) => part(obj(s).color)).join(" → ") : undefined;
    default:
      return undefined;
  }
}

/** One-line label for a resolved value; `type` is the token's, when known. */
export function inlayValue(value: unknown, type?: TokenType): string {
  const out =
    (type === "color" || isDtcgColor(value) ? color(value) : undefined) ??
    composite(value, type) ??
    part(value);
  return out.length > MAX ? `${out.slice(0, MAX - 1)}…` : out;
}
