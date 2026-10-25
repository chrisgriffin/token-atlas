/**
 * A small inline picture of a value, sized for a 28px table row: a swatch for
 * colors and gradients, "Aa" in the face for type, a card for shadows, a curve
 * for easings, a ruler or clock icon for lengths and durations. Types with
 * nothing to draw render nothing.
 */
import type { TokenType } from "../../core/types"
import { buildFromHex, isDtcgColor, toHex } from "../../core/color"
import { ColorSwatchInput } from "../editors/fields"
import { TYPE_ICON_PATHS } from "../icons"
import {
  dim,
  familyCss,
  gradientCss,
  obj,
  shadowCss,
  weightCss,
} from "../lib/css"

export function Glyph({
  value,
  type,
  onPick,
  tabbable,
}: {
  value: unknown
  type: TokenType | undefined
  /** Given for an editable color: the swatch opens the picker. */
  onPick?: (value: unknown) => void
  /** Whether that picker is a Tab stop; the table's selected row only. */
  tabbable?: boolean
}) {
  switch (type) {
    case "color": {
      const hex = toHex(value)
      if (!hex) return null
      if (!onPick) return <Swatch background={hex} width={12} />
      const space = isDtcgColor(value) ? value.colorSpace : "srgb"
      return (
        <span className="glyph">
          <ColorSwatchInput
            hex={hex}
            size={12}
            tabbable={tabbable}
            onPick={picked => {
              const next = buildFromHex(picked, space)
              if (next)
                onPick({
                  ...next,
                  alpha: isDtcgColor(value) ? value.alpha : undefined,
                })
            }}
          />
        </span>
      )
    }
    case "gradient": {
      const css = gradientCss(value)
      return css ? <Swatch background={css} width={24} /> : null
    }
    case "shadow":
      return (
        <span
          className="glyph glyph-card"
          style={{ boxShadow: shadowCss(value, 0.25) }}
          aria-hidden
        />
      )
    case "border": {
      const v = obj(value)
      return (
        <span
          className="glyph glyph-card"
          style={{
            background: "transparent",
            borderWidth: `min(${dim(v.width) ?? "1px"}, 3px)`,
            borderStyle: typeof v.style === "string" ? v.style : "solid",
            borderColor: toHex(v.color) ?? "currentColor",
          }}
          aria-hidden
        />
      )
    }
    case "typography": {
      const v = obj(value)
      return (
        <Sample
          family={familyCss(v.fontFamily)}
          weight={weightCss(v.fontWeight)}
        />
      )
    }
    case "fontFamily":
      return <Sample family={familyCss(value)} />
    case "fontWeight":
      return <Sample weight={weightCss(value)} />
    case "dimension":
      return dim(value) ? <Icon name="ruler" d={RULER} /> : null
    case "duration":
      return dim(value) ? <Icon name="clock" d={CLOCK} /> : null
    case "cubicBezier":
      return <Curve value={value} />
    case "transition":
      return <Curve value={obj(value).timingFunction} />
    default:
      return null
  }
}

function Swatch({ background, width }: { background: string; width: number }) {
  return (
    <span className="glyph swatch" style={{ width, height: 12 }} aria-hidden>
      <span style={{ background }} />
    </span>
  )
}

function Sample({ family, weight }: { family?: string; weight?: number }) {
  return (
    <span
      className="glyph glyph-sample"
      style={{ fontFamily: family, fontWeight: weight }}
      aria-hidden
    >
      Aa
    </span>
  )
}

const RULER = TYPE_ICON_PATHS.dimension
const CLOCK = TYPE_ICON_PATHS.duration

/** A fixed stroke icon for a type whose value has no useful picture. */
function Icon({ name, d }: { name: string; d: string }) {
  return (
    <svg
      className={`glyph glyph-icon ${name}`}
      width={12}
      height={12}
      viewBox="0 0 16 16"
      aria-hidden
    >
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  )
}

function Curve({ value }: { value: unknown }) {
  if (!Array.isArray(value) || value.length !== 4) return null
  const [x1, y1, x2, y2] = value.map(n => (typeof n === "number" ? n : 0))
  const S = 12
  return (
    <svg
      className="glyph glyph-curve"
      width={S}
      height={S}
      viewBox={`0 0 ${S} ${S}`}
      aria-hidden
    >
      <path
        d={`M0 ${S} C ${x1 * S} ${S - y1 * S}, ${x2 * S} ${S - y2 * S}, ${S} 0`}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
      />
    </svg>
  )
}
