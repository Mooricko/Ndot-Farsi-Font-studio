import { CellType, GlyphData } from '../types/font';

const FORM_ORDER: Record<string, number> = {
  isol: 0,
  init: 1,
  medi: 2,
  fina: 3,
};

/**
 * Returns all contextual forms (isol, init, medi, fina) belonging to the same Persian base letter.
 */
export function getLetterFamilyGlyphs(
  library: Record<string, GlyphData>,
  glyph: GlyphData
): GlyphData[] {
  if (!glyph.baseLetter) return [glyph];
  return Object.values(library)
    .filter((g) => g.baseLetter === glyph.baseLetter)
    .sort(
      (a, b) =>
        (FORM_ORDER[a.contextualForm ?? ''] ?? 9) -
        (FORM_ORDER[b.contextualForm ?? ''] ?? 9)
    );
}

function isGridEmpty(cells: CellType[][]): boolean {
  for (let r = 0; r < cells.length; r++) {
    for (let c = 0; c < cells[r].length; c++) {
      if (cells[r][c] !== 0) return false;
    }
  }
  return true;
}

/**
 * Propagates incremental cell edits, advance width adjustments, or full clear
 * from a single contextual form to all sibling forms of the same Persian letter.
 */
export function buildSyncedFamilyPatch(
  library: Record<string, GlyphData>,
  sourcePrev: GlyphData,
  sourceNext: GlyphData,
  joinRow: number
): Record<string, GlyphData> {
  const patch: Record<string, GlyphData> = {
    [sourceNext.id]: sourceNext,
  };

  if (!sourcePrev.baseLetter) return patch;

  const siblings = getLetterFamilyGlyphs(library, sourcePrev).filter(
    (g) => g.id !== sourcePrev.id
  );
  if (siblings.length === 0) return patch;

  const clearedAll = isGridEmpty(sourceNext.cells);

  // Collect exact cell diffs between sourcePrev and sourceNext
  const diffs: Array<{ r: number; c: number; val: CellType }> = [];
  for (let r = 0; r < sourceNext.rows; r++) {
    for (let c = 0; c < sourceNext.cols; c++) {
      const prevVal = sourcePrev.cells[r]?.[c] ?? 0;
      const nextVal = sourceNext.cells[r]?.[c] ?? 0;
      if (prevVal !== nextVal) {
        diffs.push({ r, c, val: nextVal });
      }
    }
  }

  const advDelta = sourceNext.advanceCols - sourcePrev.advanceCols;
  const clampedJoinRow = Math.max(0, Math.min(sourceNext.rows - 1, joinRow));

  for (const sib of siblings) {
    if (clearedAll) {
      const emptyCells: CellType[][] = Array.from({ length: sib.rows }, () =>
        Array.from({ length: sib.cols }, () => 0 as CellType)
      );
      patch[sib.id] = {
        ...sib,
        cells: emptyCells,
        isCustomized: true,
      };
      continue;
    }

    const nextCells: CellType[][] = sib.cells.map((row) => [...row]);
    // Optical center alignment between source form width and sibling form width
    const offsetC = Math.round((sib.advanceCols - sourcePrev.advanceCols) / 2);
    let nextAdv = Math.max(1, Math.min(sib.cols, sib.advanceCols + advDelta));

    for (const d of diffs) {
      if (d.r < 0 || d.r >= sib.rows) continue;
      const targetC = d.c + offsetC;
      if (targetC < 0 || targetC >= sib.cols) continue;

      // Avoid accidentally breaking a sibling's required cursive join anchor
      // when erasing an unrelated corner on a non-joining form
      const isLeftJoinAnchor =
        sib.joinsLeft && d.r === clampedJoinRow && targetC === 0;
      const isRightJoinAnchor =
        sib.joinsRight && d.r === clampedJoinRow && targetC === nextAdv - 1;

      if (
        d.val === 0 &&
        ((isLeftJoinAnchor && !sourcePrev.joinsLeft) ||
          (isRightJoinAnchor && !sourcePrev.joinsRight))
      ) {
        continue;
      }

      nextCells[d.r][targetC] = d.val;
      if (d.val !== 0 && targetC + 1 > nextAdv) {
        nextAdv = Math.min(sib.cols, targetC + 1);
      }
    }

    patch[sib.id] = {
      ...sib,
      cells: nextCells,
      advanceCols: nextAdv,
      isCustomized: true,
    };
  }

  return patch;
}

/**
 * Nudges all contextual forms of the same Persian letter uniformly by (dr, dc).
 */
export function buildSyncedNudgePatch(
  library: Record<string, GlyphData>,
  sourceGlyph: GlyphData,
  dr: number,
  dc: number
): Record<string, GlyphData> {
  const family = getLetterFamilyGlyphs(library, sourceGlyph);
  const patch: Record<string, GlyphData> = {};

  for (const g of family) {
    const nextCells: CellType[][] = Array.from({ length: g.rows }, (_, r) =>
      Array.from({ length: g.cols }, (_, c) => {
        const sr = r - dr;
        const sc = c - dc;
        if (sr >= 0 && sr < g.rows && sc >= 0 && sc < g.cols) {
          return g.cells[sr][sc];
        }
        return 0;
      })
    );
    patch[g.id] = {
      ...g,
      cells: nextCells,
      isCustomized: true,
    };
  }

  return patch;
}

/**
 * Stamps the active glyph's full matrix design across every contextual form of its letter,
 * automatically adding row-aligned cursive join connectors where required (init/medi/fina).
 */
export function buildCloneShapeToFamilyPatch(
  library: Record<string, GlyphData>,
  sourceGlyph: GlyphData,
  joinRow: number
): Record<string, GlyphData> {
  const family = getLetterFamilyGlyphs(library, sourceGlyph);
  const patch: Record<string, GlyphData> = {};
  const clampedJoin = Math.max(0, Math.min(sourceGlyph.rows - 1, joinRow));

  for (const sib of family) {
    if (sib.id === sourceGlyph.id) continue;

    const nextCells: CellType[][] = sourceGlyph.cells.map((row) => [...row]);
    let nextAdv = sourceGlyph.advanceCols;

    // Ensure cursive join connectors align cleanly on joinRow for joining sibling forms
    if (sib.joinsLeft && !sourceGlyph.joinsLeft) {
      nextCells[clampedJoin][0] = 1;
      // Bridge to first stroke dot on joinRow if separated by 1 column
      if (nextAdv > 2 && nextCells[clampedJoin][1] === 0 && nextCells[clampedJoin][2] === 1) {
        nextCells[clampedJoin][1] = 1;
      }
    }

    if (sib.joinsRight && !sourceGlyph.joinsRight) {
      const rightCol = Math.min(sib.cols - 1, nextAdv);
      nextCells[clampedJoin][rightCol] = 1;
      nextAdv = Math.min(sib.cols, rightCol + 1);
    }

    patch[sib.id] = {
      ...sib,
      cells: nextCells,
      advanceCols: nextAdv,
      isCustomized: true,
    };
  }

  return patch;
}
