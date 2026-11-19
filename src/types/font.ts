export type CellType = 0 | 1 | 2; // 0 = empty, 1 = structural stroke dot, 2 = nuqta (diacritic) dot

export type GridResolution = '7x9' | '9x11' | '11x13' | '13x15';

export interface ResolutionSpec {
  id: GridResolution;
  label: string;
  cols: number;
  rows: number;
  baselineRow: number; // 0-indexed from top
  joinRow: number;     // 0-indexed row where cursive Persian strokes meet
}

export const RESOLUTION_SPECS: Record<GridResolution, ResolutionSpec> = {
  '7x9': {
    id: '7x9',
    label: '7×9',
    cols: 7,
    rows: 9,
    baselineRow: 6,
    joinRow: 6,
  },
  '9x11': {
    id: '9x11',
    label: '9×11',
    cols: 9,
    rows: 11,
    baselineRow: 7,
    joinRow: 7,
  },
  '11x13': {
    id: '11x13',
    label: '11×13',
    cols: 11,
    rows: 13,
    baselineRow: 9,
    joinRow: 9,
  },
  '13x15': {
    id: '13x15',
    label: '13×15',
    cols: 13,
    rows: 15,
    baselineRow: 10,
    joinRow: 10,
  },
};

export type DotShape = 'circle' | 'rounded' | 'square' | 'diamond';

export type NuqtaMode = 'clearance_large' | 'diamond' | 'cluster_2x2' | 'uniform';

export type GlyphCategory =
  | 'isol'
  | 'init'
  | 'medi'
  | 'fina'
  | 'liga'
  | 'num'
  | 'punct'
  | 'latin';

export interface GlyphData {
  id: string;
  name: string;           // Human-readable name e.g. "Beh (Initial)"
  psName: string;         // ASCII PostScript glyph name e.g. "beh.init"
  category: GlyphCategory;
  char: string;           // Display character(s)
  unicode?: number;       // Primary Unicode codepoint (only for isolated/base forms, numerals, punct, latin)
  altUnicodes?: number[]; // Additional codepoints mapped to same glyph (e.g., Arabic Kaf -> Persian Keheh, presentation form)
  baseLetter?: string;    // Base Unicode char for contextual lookup e.g. 'ب'
  contextualForm?: 'isol' | 'init' | 'medi' | 'fina';
  joinsRight: boolean;    // Connects to previous (right-side) RTL glyph
  joinsLeft: boolean;     // Connects to next (left-side) RTL glyph
  cols: number;
  rows: number;
  cells: CellType[][];    // [row][col]
  leftBearing: number;    // in grid columns
  rightBearing: number;   // in grid columns
  advanceCols: number;    // active width in columns (content width)
  isCustomized?: boolean;
}

export interface FontParams {
  dotDiameter: number;      // 0.20 .. 0.95 of cell pitch
  dotSpacingX: number;      // 0.75 .. 1.45 multiplier
  dotSpacingY: number;      // 0.75 .. 1.45 multiplier
  gridResolution: GridResolution;
  dotShape: DotShape;
  nuqtaMode: NuqtaMode;
  nuqtaScale: number;       // 0.80 .. 1.60 relative to dotDiameter
  nuqtaOffsetY: number;     // -0.60 .. +1.20 cells extra vertical clearance away from stroke
  baselineOffset: number;   // -2 .. +2 grid rows shift
  joinRowOffset: number;    // -1 .. +1 grid rows shift for cursive alignment
  tracking: number;         // -0.5 .. +2.0 grid columns between non-joining glyphs
  wordSpacing: number;      // 2 .. 7 grid columns for space character
  includeLatin: boolean;
}

export interface FontMetadata {
  familyName: string;
  styleName: string;
  version: string;
  designer: string;
  copyright: string;
}

export type WorkspaceTab = 'playground' | 'editor' | 'specimen';

export interface ProjectFileV1 {
  schema: 'ndot-farsi-project-v1';
  savedAt: string;
  metadata: FontMetadata;
  params: FontParams;
  glyphs: Record<
    string,
    {
      cols: number;
      rows: number;
      cells: CellType[][];
      leftBearing: number;
      rightBearing: number;
      advanceCols: number;
      isCustomized?: boolean;
    }
  >;
}

export const DEFAULT_FONT_PARAMS: FontParams = {
  dotDiameter: 0.72,
  dotSpacingX: 1.0,
  dotSpacingY: 1.0,
  gridResolution: '9x11',
  dotShape: 'circle',
  nuqtaMode: 'clearance_large',
  nuqtaScale: 1.18,
  nuqtaOffsetY: 0.35,
  baselineOffset: 0,
  joinRowOffset: 0,
  tracking: 0.4,
  wordSpacing: 4,
  includeLatin: true,
};

export const DEFAULT_FONT_METADATA: FontMetadata = {
  familyName: 'Ndot Farsi',
  styleName: 'Regular',
  version: '1.000',
  designer: 'Ndot Farsi Studio',
  copyright: 'Copyright (c) 2026 Ndot Farsi Studio',
};

export interface FontPreset {
  id: string;
  name: string;
  description: string;
  builtIn?: boolean;
  params: FontParams;
}

export const BUILT_IN_PRESETS: FontPreset[] = [
  {
    id: 'ndot-classic',
    name: 'Ndot Classic',
    description: '9×11 · Circle · Balanced Nothing matrix',
    builtIn: true,
    params: { ...DEFAULT_FONT_PARAMS },
  },
  {
    id: 'retro-display',
    name: 'Retro Display',
    description: '7×9 · Square · Bold low-res LED signage',
    builtIn: true,
    params: {
      ...DEFAULT_FONT_PARAMS,
      gridResolution: '7x9',
      dotShape: 'square',
      dotDiameter: 0.82,
      dotSpacingX: 1.08,
      dotSpacingY: 1.04,
      nuqtaMode: 'diamond',
      nuqtaScale: 1.22,
      nuqtaOffsetY: 0.4,
      tracking: 0.5,
      wordSpacing: 4.5,
    },
  },
  {
    id: 'compact-legibility',
    name: 'Compact Legibility',
    description: '9×11 · Rounded · Tight UI & headline reading',
    builtIn: true,
    params: {
      ...DEFAULT_FONT_PARAMS,
      gridResolution: '9x11',
      dotShape: 'rounded',
      dotDiameter: 0.78,
      dotSpacingX: 0.9,
      dotSpacingY: 0.94,
      nuqtaMode: 'clearance_large',
      nuqtaScale: 1.16,
      nuqtaOffsetY: 0.3,
      tracking: 0.2,
      wordSpacing: 3.5,
    },
  },
  {
    id: 'high-density-text',
    name: 'High-Density Text',
    description: '13×15 · Fine Circle · Detailed Persian curves',
    builtIn: true,
    params: {
      ...DEFAULT_FONT_PARAMS,
      gridResolution: '13x15',
      dotShape: 'circle',
      dotDiameter: 0.66,
      dotSpacingX: 0.92,
      dotSpacingY: 0.94,
      nuqtaMode: 'cluster_2x2',
      nuqtaScale: 1.12,
      nuqtaOffsetY: 0.25,
      tracking: 0.3,
      wordSpacing: 4,
    },
  },
  {
    id: 'micro-led',
    name: 'Micro LED Uniform',
    description: '7×9 · Circle · Airy hardware status display',
    builtIn: true,
    params: {
      ...DEFAULT_FONT_PARAMS,
      gridResolution: '7x9',
      dotShape: 'circle',
      dotDiameter: 0.62,
      dotSpacingX: 1.02,
      dotSpacingY: 1.02,
      nuqtaMode: 'uniform',
      nuqtaScale: 1.0,
      nuqtaOffsetY: 0,
      tracking: 0.6,
      wordSpacing: 4,
    },
  },
];

