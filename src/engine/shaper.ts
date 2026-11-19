import {
  CellType,
  DotShape,
  FontParams,
  GlyphData,
  JoiningNuqtaScope,
  RESOLUTION_SPECS,
} from '../types/font';

// Arabic/Persian joining classes
const RIGHT_JOINING = new Set([
  'آ', 'ا', 'أ', 'إ', 'ٱ', 'د', 'ذ', 'ر', 'ز', 'ژ', 'و', 'ؤ', 'ة',
]);

const DUAL_JOINING = new Set([
  'ب', 'پ', 'ت', 'ث', 'ج', 'چ', 'ح', 'خ', 'س', 'ش', 'ص', 'ض',
  'ط', 'ظ', 'ع', 'غ', 'ف', 'ق', 'ک', 'ك', 'گ', 'ل', 'م', 'ن',
  'ه', 'ۀ', 'ی', 'ي', 'ى', 'ئ', 'ـ',
]);

// Map Arabic variant codepoints to canonical Persian base letter
export const CANONICAL_PERSIAN_CHAR: Record<string, string> = {
  'أ': 'ا',
  'إ': 'ا',
  'ٱ': 'ا',
  'ك': 'ک',
  'ي': 'ی',
  'ى': 'ی',
  'ئ': 'ی',
  'ؤ': 'و',
  'ة': 'ه',
  'ۀ': 'ه',
};

const BASE_LETTER_TO_PREFIX: Record<string, string> = {
  'آ': 'alef_madda',
  'ا': 'alef',
  'ب': 'beh',
  'پ': 'peh',
  'ت': 'teh',
  'ث': 'theh',
  'ج': 'jeem',
  'چ': 'tcheh',
  'ح': 'hah',
  'خ': 'khah',
  'د': 'dal',
  'ذ': 'thal',
  'ر': 'reh',
  'ز': 'zeh',
  'ژ': 'zheh',
  'س': 'seen',
  'ش': 'sheen',
  'ص': 'sad',
  'ض': 'dad',
  'ط': 'tah',
  'ظ': 'zah',
  'ع': 'ain',
  'غ': 'ghain',
  'ف': 'feh',
  'ق': 'qaf',
  'ک': 'keheh',
  'گ': 'gaf',
  'ل': 'lam',
  'م': 'meem',
  'ن': 'noon',
  'و': 'waw',
  'ه': 'heh',
  'ی': 'yeh',
};

function isJoinable(ch: string): boolean {
  return RIGHT_JOINING.has(ch) || DUAL_JOINING.has(ch);
}

function canJoinLeft(ch: string): boolean {
  return DUAL_JOINING.has(ch) || ch === '\u200D'; // ZWJ forces join
}

function canJoinRight(ch: string): boolean {
  return RIGHT_JOINING.has(ch) || DUAL_JOINING.has(ch) || ch === '\u200D';
}

export interface ShapedGlyphItem {
  glyph: GlyphData | null; // null represents space
  isSpace?: boolean;
  char: string;
}

/**
 * Shapes logical text into visual left-to-right ordered glyphs for RTL vector rendering.
 * Handles Persian contextual forms (isol/init/medi/fina), ZWNJ (U+200C), ZWJ (U+200D),
 * Lam-Alef ligatures (لا / ـلا / لآ / ـلآ), and embedded LTR runs (Latin/numbers).
 */
export function shapeTextToVisualGlyphs(
  text: string,
  library: Record<string, GlyphData>,
  includeLatin: boolean
): ShapedGlyphItem[] {
  // Build fast lookup by unicode codepoint
  const byUnicode = new Map<number, GlyphData>();
  for (const g of Object.values(library)) {
    if (!includeLatin && g.category === 'latin') continue;
    if (g.unicode !== undefined) byUnicode.set(g.unicode, g);
    if (g.altUnicodes) {
      for (const cp of g.altUnicodes) {
        if (!byUnicode.has(cp)) byUnicode.set(cp, g);
      }
    }
  }

  // First shape logical characters into contextual glyph IDs
  const chars = Array.from(text);
  const logicalShaped: Array<{ item: ShapedGlyphItem; isLtr: boolean }> = [];

  for (let i = 0; i < chars.length; i++) {
    const rawCh = chars[i];
    const cp = rawCh.codePointAt(0) ?? 0;

    // Zero-Width Non-Joiner & Zero-Width Joiner produce no visible glyph
    if (cp === 0x200c || cp === 0x200d) {
      continue;
    }

    if (rawCh === ' ' || rawCh === '\t') {
      logicalShaped.push({
        item: { glyph: null, isSpace: true, char: ' ' },
        isLtr: false,
      });
      continue;
    }

    const ch = CANONICAL_PERSIAN_CHAR[rawCh] ?? rawCh;

    // Check Lam + Alef / Alef Madda ligature
    if (ch === 'ل' && i + 1 < chars.length) {
      const nextRaw = chars[i + 1];
      const nextCanon = CANONICAL_PERSIAN_CHAR[nextRaw] ?? nextRaw;
      if (nextCanon === 'ا' || nextCanon === 'آ') {
        const prevCh = i > 0 ? chars[i - 1] : '';
        const prevJoins = prevCh !== '' && canJoinLeft(prevCh);
        const ligaId =
          nextCanon === 'آ'
            ? prevJoins
              ? 'lam_alef_madda.fina'
              : 'lam_alef_madda.isol'
            : prevJoins
              ? 'lam_alef.fina'
              : 'lam_alef.isol';
        const ligaGlyph = library[ligaId];
        if (ligaGlyph) {
          logicalShaped.push({
            item: { glyph: ligaGlyph, char: rawCh + nextRaw },
            isLtr: false,
          });
          i++; // consume Alef
          continue;
        }
      }
    }

    // Persian letter contextual shaping
    if (isJoinable(rawCh) && rawCh !== 'ـ') {
      const prefix = BASE_LETTER_TO_PREFIX[ch];
      if (prefix) {
        const prevCh = i > 0 ? chars[i - 1] : '';
        const nextCh = i + 1 < chars.length ? chars[i + 1] : '';

        const connectsPrev = prevCh !== '' && canJoinLeft(prevCh) && canJoinRight(rawCh);
        const connectsNext = nextCh !== '' && canJoinLeft(rawCh) && canJoinRight(nextCh);

        let form: 'isol' | 'init' | 'medi' | 'fina' = 'isol';
        if (connectsPrev && connectsNext) form = 'medi';
        else if (connectsPrev) form = 'fina';
        else if (connectsNext) form = 'init';

        const g = library[`${prefix}.${form}`] ?? library[`${prefix}.isol`];
        if (g) {
          logicalShaped.push({
            item: { glyph: g, char: rawCh },
            isLtr: false,
          });
          continue;
        }
      }
    }

    if (rawCh === 'ـ' && library['kashida']) {
      logicalShaped.push({
        item: { glyph: library['kashida'], char: rawCh },
        isLtr: false,
      });
      continue;
    }

    // Direct lookup for numerals, punctuation, Latin
    const direct = byUnicode.get(cp);
    const isLtr =
      (cp >= 0x0030 && cp <= 0x0039) ||
      (cp >= 0x0041 && cp <= 0x005a) ||
      (cp >= 0x0061 && cp <= 0x007a) ||
      (cp >= 0x06f0 && cp <= 0x06f9) ||
      (cp >= 0x0660 && cp <= 0x0669);

    if (direct) {
      logicalShaped.push({
        item: { glyph: direct, char: rawCh },
        isLtr,
      });
    }
  }

  // Convert RTL logical order to visual Left-to-Right order while preserving LTR runs (Latin/numbers)
  // Step 1: group consecutive LTR runs (including internal spaces between LTR words)
  const segments: Array<{ isLtr: boolean; items: ShapedGlyphItem[] }> = [];
  for (let i = 0; i < logicalShaped.length; i++) {
    const entry = logicalShaped[i];
    if (entry.isLtr) {
      if (segments.length > 0 && segments[segments.length - 1].isLtr) {
        segments[segments.length - 1].items.push(entry.item);
      } else {
        segments.push({ isLtr: true, items: [entry.item] });
      }
    } else if (
      entry.item.isSpace &&
      segments.length > 0 &&
      segments[segments.length - 1].isLtr &&
      i + 1 < logicalShaped.length &&
      logicalShaped[i + 1].isLtr
    ) {
      // Space between two LTR tokens stays inside LTR run
      segments[segments.length - 1].items.push(entry.item);
    } else {
      segments.push({ isLtr: false, items: [entry.item] });
    }
  }

  // Step 2: Reverse segment order for RTL base direction; inside LTR segments keep natural order
  const visual: ShapedGlyphItem[] = [];
  for (let s = segments.length - 1; s >= 0; s--) {
    const seg = segments[s];
    if (seg.isLtr) {
      for (const item of seg.items) visual.push(item);
    } else {
      for (let k = seg.items.length - 1; k >= 0; k--) visual.push(seg.items[k]);
    }
  }

  return visual;
}

export interface RenderedDot {
  cx: number; // grid column units (floating)
  cy: number; // grid row units (floating, 0 at top)
  radius: number; // fraction of cell pitch (0.1..0.75)
  shape: DotShape;
  isNuqta: boolean;
}

/**
 * Computes exact parametric dot positions, radii, and shapes for a glyph in grid-cell coordinates.
 * Shared identically by SVG/Canvas previews and the TrueType (.ttf) compiler!
 */
export function computeGlyphDots(
  glyph: GlyphData,
  params: FontParams
): {
  dots: RenderedDot[];
  leftBearingCols: number;
  rightBearingCols: number;
  totalAdvanceCols: number;
} {
  const spec = RESOLUTION_SPECS[params.gridResolution];
  const joinRow = spec.joinRow + params.joinRowOffset;

  // Compute average stroke row so nuqta vertical clearance pushes upper nuqtas UP and lower nuqtas DOWN
  let strokeRowSum = 0;
  let strokeCount = 0;
  for (let r = 0; r < glyph.rows; r++) {
    for (let c = 0; c < glyph.cols; c++) {
      if (glyph.cells[r]?.[c] === 1) {
        strokeRowSum += r;
        strokeCount++;
      }
    }
  }
  const refRow = strokeCount > 0 ? strokeRowSum / strokeCount : joinRow;

  const baseRadius = (params.dotDiameter * 0.5);
  const effectiveLeft = glyph.joinsLeft ? 0 : Math.max(0, glyph.leftBearing + params.tracking * 0.5);
  const effectiveRight = glyph.joinsRight ? 0 : Math.max(0, glyph.rightBearing + params.tracking * 0.5);
  const totalAdvanceCols = effectiveLeft + glyph.advanceCols + effectiveRight;

  const dots: RenderedDot[] = [];

  for (let r = 0; r < glyph.rows; r++) {
    for (let c = 0; c < glyph.cols; c++) {
      const cell = glyph.cells[r]?.[c] ?? 0;
      if (cell === 0) continue;

      const xCenter = effectiveLeft + c + 0.5;
      const yCenter = r + 0.5 + params.baselineOffset;

      if (cell === 1) {
        dots.push({
          cx: xCenter,
          cy: yCenter,
          radius: baseRadius,
          shape: params.dotShape,
          isNuqta: false,
        });
      } else {
        // Cell === 2: Persian Nuqta (diacritic dot)
        const dir = r < refRow ? -1 : 1; // -1 pushes upward (smaller row), +1 pushes downward (larger row)
        const applyJoining = matchesJoiningNuqtaScope(
          glyph,
          params.joiningNuqtaScope ?? 'all'
        );
        const jScale = applyJoining ? (params.joiningNuqtaScale ?? 1) : 1;
        const jOffX = applyJoining ? (params.joiningNuqtaOffsetX ?? 0) : 0;
        const jOffY = applyJoining ? (params.joiningNuqtaOffsetY ?? 0) : 0;

        if (params.nuqtaMode === 'uniform') {
          dots.push({
            cx: xCenter + jOffX,
            cy: yCenter + dir * jOffY,
            radius: Math.min(0.72, Math.max(0.12, baseRadius * jScale)),
            shape: params.dotShape,
            isNuqta: true,
          });
        } else if (params.nuqtaMode === 'cluster_2x2') {
          const shiftY = dir * (params.nuqtaOffsetY + jOffY);
          const subR = Math.min(0.48, Math.max(0.1, baseRadius * 0.54 * params.nuqtaScale * jScale));
          const off = Math.max(0.18, subR * 1.05);
          const offsets: [number, number][] = [
            [-off, -off],
            [off, -off],
            [-off, off],
            [off, off],
          ];
          for (const [dx, dy] of offsets) {
            dots.push({
              cx: xCenter + jOffX + dx,
              cy: yCenter + shiftY + dy,
              radius: subR,
              shape: params.dotShape,
              isNuqta: true,
            });
          }
        } else {
          // 'clearance_large' or 'diamond'
          const shiftY = dir * (params.nuqtaOffsetY + jOffY);
          const nRadius = Math.min(0.72, Math.max(0.12, baseRadius * params.nuqtaScale * jScale));
          const nShape: DotShape =
            params.nuqtaMode === 'diamond' ? 'diamond' : params.dotShape;
          dots.push({
            cx: xCenter + jOffX,
            cy: yCenter + shiftY,
            radius: nRadius,
            shape: nShape,
            isNuqta: true,
          });
        }
      }
    }
  }

  return {
    dots,
    leftBearingCols: effectiveLeft,
    rightBearingCols: effectiveRight,
    totalAdvanceCols,
  };
}

export function matchesJoiningNuqtaScope(
  glyph: GlyphData,
  scope: JoiningNuqtaScope
): boolean {
  if (!glyph.joinsLeft && !glyph.joinsRight) return false;
  if (scope === 'all') return true;
  return glyph.contextualForm === scope;
}

export function glyphHasNuqtas(glyph: GlyphData): boolean {
  for (let r = 0; r < glyph.rows; r++) {
    for (let c = 0; c < glyph.cols; c++) {
      if (glyph.cells[r]?.[c] === 2) return true;
    }
  }
  return false;
}

export function countDottedJoiningGlyphs(
  library: Record<string, GlyphData>,
  scope: JoiningNuqtaScope
): number {
  let count = 0;
  for (const g of Object.values(library)) {
    if (matchesJoiningNuqtaScope(g, scope) && glyphHasNuqtas(g)) {
      count++;
    }
  }
  return count;
}

/**
 * Bulk-shifts all nuqta cells (CellType = 2) by (dr, dc) across joining glyphs matching scope,
 * ensuring nuqtas stay inside grid bounds and never overwrite base stroke dots (CellType = 1).
 */
export function bulkNudgeJoiningNuqtas(
  library: Record<string, GlyphData>,
  scope: JoiningNuqtaScope,
  dr: number,
  dc: number
): { nextLibrary: Record<string, GlyphData>; movedCount: number; skippedCount: number } {
  const nextLibrary: Record<string, GlyphData> = { ...library };
  let movedCount = 0;
  let skippedCount = 0;

  for (const [id, glyph] of Object.entries(library)) {
    if (!matchesJoiningNuqtaScope(glyph, scope)) continue;

    const nuqtas: Array<[number, number]> = [];
    for (let r = 0; r < glyph.rows; r++) {
      for (let c = 0; c < glyph.cols; c++) {
        if (glyph.cells[r]?.[c] === 2) nuqtas.push([r, c]);
      }
    }
    if (nuqtas.length === 0) continue;

    // Validate all destination cells are in-bounds and do not collide with stroke dots
    const canMove = nuqtas.every(([r, c]) => {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= glyph.rows || nc < 0 || nc >= glyph.cols) return false;
      return glyph.cells[nr][nc] !== 1;
    });

    if (!canMove) {
      skippedCount++;
      continue;
    }

    const nextCells: CellType[][] = glyph.cells.map((row) =>
      row.map((cell) => (cell === 2 ? 0 : cell))
    );
    let maxCol = glyph.advanceCols;
    for (const [r, c] of nuqtas) {
      nextCells[r + dr][c + dc] = 2;
      if (c + dc + 1 > maxCol) maxCol = c + dc + 1;
    }

    nextLibrary[id] = {
      ...glyph,
      cells: nextCells,
      advanceCols: Math.min(glyph.cols, maxCol),
      isCustomized: true,
    };
    movedCount++;
  }

  return { nextLibrary, movedCount, skippedCount };
}

/**
 * Automatically ensures at least 1 empty row of vertical clearance between structural strokes
 * and nuqta clusters across all joining glyphs matching scope.
 */
export function bulkSeparateJoiningNuqtas(
  library: Record<string, GlyphData>,
  scope: JoiningNuqtaScope,
  joinRow: number
): { nextLibrary: Record<string, GlyphData>; adjustedCount: number } {
  const nextLibrary: Record<string, GlyphData> = { ...library };
  let adjustedCount = 0;

  for (const [id, glyph] of Object.entries(library)) {
    if (!matchesJoiningNuqtaScope(glyph, scope)) continue;

    const nuqtas: Array<[number, number]> = [];
    let strokeRowSum = 0;
    let strokeCount = 0;
    for (let r = 0; r < glyph.rows; r++) {
      for (let c = 0; c < glyph.cols; c++) {
        const cell = glyph.cells[r]?.[c] ?? 0;
        if (cell === 2) nuqtas.push([r, c]);
        else if (cell === 1) {
          strokeRowSum += r;
          strokeCount++;
        }
      }
    }
    if (nuqtas.length === 0) continue;

    const refRow = strokeCount > 0 ? strokeRowSum / strokeCount : joinRow;
    const avgNuqtaRow =
      nuqtas.reduce((acc, [r]) => acc + r, 0) / nuqtas.length;
    const dir = avgNuqtaRow < refRow ? -1 : 1;

    // Check whether any nuqta touches (within 1 row) a stroke dot in nearby columns
    const needsSeparation = nuqtas.some(([nr, nc]) => {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const sr = nr + dr;
          const sc = nc + dc;
          if (
            sr >= 0 &&
            sr < glyph.rows &&
            sc >= 0 &&
            sc < glyph.cols &&
            glyph.cells[sr][sc] === 1
          ) {
            return true;
          }
        }
      }
      return false;
    });

    if (!needsSeparation) continue;

    const canShift = nuqtas.every(([r, c]) => {
      const nr = r + dir;
      if (nr < 0 || nr >= glyph.rows) return false;
      return glyph.cells[nr][c] !== 1;
    });

    if (!canShift) continue;

    const nextCells: CellType[][] = glyph.cells.map((row) =>
      row.map((cell) => (cell === 2 ? 0 : cell))
    );
    for (const [r, c] of nuqtas) {
      nextCells[r + dir][c] = 2;
    }

    nextLibrary[id] = {
      ...glyph,
      cells: nextCells,
      isCustomized: true,
    };
    adjustedCount++;
  }

  return { nextLibrary, adjustedCount };
}

export function getContextualSampleWord(glyph: GlyphData): string {
  if (glyph.category === 'isol') return glyph.char;
  if (glyph.category === 'init') return `${glyph.baseLetter ?? glyph.char}ـ`;
  if (glyph.category === 'medi') return `ـ${glyph.baseLetter ?? glyph.char}ـ`;
  if (glyph.category === 'fina') return `ـ${glyph.baseLetter ?? glyph.char}`;
  return glyph.char;
}
