import type { ComponentType } from "react";
import type { TokenType } from "../../core/types";

export interface EditorProps {
  value: unknown;
  onChange: (value: unknown) => void;
  /** `value` with its references resolved (`TokenNode.resolvedValue`): what
   *  Unlink writes for a composite sub-value that references another token. */
  resolved?: unknown;
}

import {
  ColorEditor,
  DimensionEditor,
  NumberEditor,
  DurationEditor,
  FontFamilyEditor,
  FontWeightEditor,
  CubicBezierEditor,
} from "./primitive";
import {
  TypographyEditor,
  BorderEditor,
  TransitionEditor,
  StrokeStyleEditor,
  ShadowEditor,
  GradientEditor,
} from "./composite";

const REGISTRY: Partial<Record<TokenType, ComponentType<EditorProps>>> = {
  color: ColorEditor,
  dimension: DimensionEditor,
  number: NumberEditor,
  duration: DurationEditor,
  fontFamily: FontFamilyEditor,
  fontWeight: FontWeightEditor,
  cubicBezier: CubicBezierEditor,
  typography: TypographyEditor,
  border: BorderEditor,
  transition: TransitionEditor,
  strokeStyle: StrokeStyleEditor,
  shadow: ShadowEditor,
  gradient: GradientEditor,
};

export function getEditor(type: TokenType | undefined): ComponentType<EditorProps> | undefined {
  return type ? REGISTRY[type] : undefined;
}
