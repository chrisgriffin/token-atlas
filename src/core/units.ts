/**
 * Dimension unit conversions for hovers (px ↔ rem, plus pt).
 * Pure TS — the root font size is passed in (VS Code setting in the host).
 */

export interface DimensionConversions {
  px: string;
  rem: string;
  pt: string;
}

interface DimensionValue {
  value: number;
  unit: "px" | "rem";
}

function isDimension(v: unknown): v is DimensionValue {
  return (
    !!v &&
    typeof v === "object" &&
    typeof (v as DimensionValue).value === "number" &&
    ((v as DimensionValue).unit === "px" || (v as DimensionValue).unit === "rem")
  );
}

export function dimensionConversions(
  value: unknown,
  rootFontSizePx = 16,
): DimensionConversions | null {
  if (!isDimension(value) || rootFontSizePx <= 0) return null;
  const px = value.unit === "px" ? value.value : value.value * rootFontSizePx;
  return {
    px: `${fmt(px)}px`,
    rem: `${fmt(px / rootFontSizePx)}rem`,
    pt: `${fmt(px * 0.75)}pt`,
  };
}

/** Trim to at most 3 decimals, without trailing zeros. */
function fmt(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}
