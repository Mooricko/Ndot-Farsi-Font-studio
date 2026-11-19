import {
  CellType,
  GlyphData,
  GridResolution,
  RESOLUTION_SPECS,
} from '../types/font';

/**
 * Loads a user-uploaded .ttf / .otf / .woff / .woff2 font into document.fonts
 * for live Canvas2D rasterization and Zhang-Suen centerline extraction.
 */
export async function loadCustomBaseFont(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const safeFamily = `CustomBase_${Date.now()}`;
  const face = new FontFace(safeFamily, buffer);
  const loaded = await face.load();
  document.fonts.add(loaded);
  return safeFamily;
}

/**
 * Classic Zhang-Suen Morphological Thinning Algorithm.
 * Reduces arbitrary filled glyph bitmaps to strictly 1-pixel-wide single-row centerlines.
 */
export function zhangSuenThin(
  src: Uint8Array,
  width: number,
  height: number
): Uint8Array {
  const img = new Uint8Array(src);
  const toZero: number[] = [];

  const idx = (x: number, y: number) => y * width + x;

  let changed = true;
  let iterations = 0;
  const maxIter = 80;

  while (changed && iterations < maxIter) {
    changed = false;
    iterations++;

    // Sub-iteration 1
    toZero.length = 0;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = idx(x, y);
        if (img[i] === 0) continue;

        const p2 = img[idx(x, y - 1)];
        const p3 = img[idx(x + 1, y - 1)];
        const p4 = img[idx(x + 1, y)];
        const p5 = img[idx(x + 1, y + 1)];
        const p6 = img[idx(x, y + 1)];
        const p7 = img[idx(x - 1, y + 1)];
        const p8 = img[idx(x - 1, y)];
        const p9 = img[idx(x - 1, y - 1)];

        const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
        if (B < 2 || B > 6) continue;

        let A = 0;
        if (p2 === 0 && p3 === 1) A++;
        if (p3 === 0 && p4 === 1) A++;
        if (p4 === 0 && p5 === 1) A++;
        if (p5 === 0 && p6 === 1) A++;
        if (p6 === 0 && p7 === 1) A++;
        if (p7 === 0 && p8 === 1) A++;
        if (p8 === 0 && p9 === 1) A++;
        if (p9 === 0 && p2 === 1) A++;
        if (A !== 1) continue;

        if (p2 * p4 * p6 === 0 && p4 * p6 * p8 === 0) {
          toZero.push(i);
        }
      }
    }
    if (toZero.length > 0) {
      changed = true;
      for (let k = 0; k < toZero.length; k++) img[toZero[k]] = 0;
    }

    // Sub-iteration 2
    toZero.length = 0;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = idx(x, y);
        if (img[i] === 0) continue;

        const p2 = img[idx(x, y - 1)];
        const p3 = img[idx(x + 1, y - 1)];
        const p4 = img[idx(x + 1, y)];
        const p5 = img[idx(x + 1, y + 1)];
        const p6 = img[idx(x, y + 1)];
        const p7 = img[idx(x - 1, y + 1)];
        const p8 = img[idx(x - 1, y)];
        const p9 = img[idx(x - 1, y - 1)];

        const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
        if (B < 2 || B > 6) continue;

        let A = 0;
        if (p2 === 0 && p3 === 1) A++;
        if (p3 === 0 && p4 === 1) A++;
        if (p4 === 0 && p5 === 1) A++;
        if (p5 === 0 && p6 === 1) A++;
        if (p6 === 0 && p7 === 1) A++;
        if (p7 === 0 && p8 === 1) A++;
        if (p8 === 0 && p9 === 1) A++;
        if (p9 === 0 && p2 === 1) A++;
        if (A !== 1) continue;

        if (p2 * p4 * p8 === 0 && p2 * p6 * p8 === 0) {
          toZero.push(i);
        }
      }
    }
    if (toZero.length > 0) {
      changed = true;
      for (let k = 0; k < toZero.length; k++) img[toZero[k]] = 0;
    }
  }

  return img;
}

/**
 * Eliminates 2x2 dense dot blocks in a discrete dot matrix to enforce strict single-row thickness.
 */
function enforceSingleRowGrid(cells: CellType[][], rows: number, cols: number): void {
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      if (
        cells[r][c] === 1 &&
        cells[r][c + 1] === 1 &&
        cells[r + 1][c] === 1 &&
        cells[r + 1][c + 1] === 1
      ) {
        // Remove the corner that least impacts connectivity (prefer keeping outer curve)
        const upLeft = r > 0 && cells[r - 1][c] === 1 ? 1 : 0;
        const downRight = r + 2 < rows && cells[r + 2][c + 1] === 1 ? 1 : 0;
        if (upLeft + downRight >= 1) {
          cells[r][c + 1] = 0;
        } else {
          cells[r + 1][c] = 0;
        }
      }
    }
  }
}

interface Component {
  pixels: Array<[number, number]>;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  cx: number;
  cy: number;
  area: number;
}

function extractConnectedComponents(
  binary: Uint8Array,
  width: number,
  height: number
): Component[] {
  const visited = new Uint8Array(width * height);
  const comps: Component[] = [];
  const queue: number[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = y * width + x;
      if (binary[start] === 0 || visited[start]) continue;

      visited[start] = 1;
      queue.length = 0;
      queue.push(start);

      const pixels: Array<[number, number]> = [];
      let minX = x, maxX = x, minY = y, maxY = y;
      let sumX = 0, sumY = 0;

      while (queue.length > 0) {
        const cur = queue.pop()!;
        const cx = cur % width;
        const cy = (cur - cx) / width;
        pixels.push([cx, cy]);
        sumX += cx;
        sumY += cy;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
            const ni = ny * width + nx;
            if (binary[ni] === 1 && !visited[ni]) {
              visited[ni] = 1;
              queue.push(ni);
            }
          }
        }
      }

      comps.push({
        pixels,
        minX,
        maxX,
        minY,
        maxY,
        cx: sumX / pixels.length,
        cy: sumY / pixels.length,
        area: pixels.length,
      });
    }
  }

  return comps;
}

function getRenderStringForGlyph(glyph: GlyphData): string {
  if (glyph.category === 'liga') {
    if (glyph.id === 'lam_alef.isol') return 'لا';
    if (glyph.id === 'lam_alef.fina') return '\u200Dلا';
    if (glyph.id === 'lam_alef_madda.isol') return 'لآ';
    if (glyph.id === 'lam_alef_madda.fina') return '\u200Dلآ';
    return glyph.char;
  }
  const base = glyph.baseLetter ?? glyph.char;
  if (glyph.contextualForm === 'init') return `${base}\u200D`;
  if (glyph.contextualForm === 'medi') return `\u200D${base}\u200D`;
  if (glyph.contextualForm === 'fina') return `\u200D${base}`;
  return base;
}

/**
 * Approach A: Rasterizes a Farsi/Latin glyph from any loaded browser/uploaded font
 * (e.g., Vazirmatn or custom uploaded TTF), separates nuqta dots from main strokes,
 * applies Zhang-Suen morphological thinning, snaps to the active dot-matrix grid,
 * and enforces cursive join alignment.
 */
export function skeletonizeGlyphFromFont(
  glyph: GlyphData,
  fontFamily: string,
  resolution: GridResolution,
  alphaThreshold = 96
): GlyphData {
  const spec = RESOLUTION_SPECS[resolution];
  const targetCols = spec.cols;
  const targetRows = spec.rows;

  // Special case for Tatweel / Kashida: clean single horizontal row on joinRow
  if (glyph.id === 'kashida') {
    const cells: CellType[][] = Array.from({ length: targetRows }, (_, r) =>
      Array.from({ length: targetCols }, (_, c) =>
        r === spec.joinRow && c < 4 ? 1 : 0
      )
    );
    return {
      ...glyph,
      cols: targetCols,
      rows: targetRows,
      cells,
      advanceCols: 4,
      isCustomized: false,
    };
  }

  const W = 144;
  const H = 144;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return glyph;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#FFFFFF';
  const fontSize = Math.round(H * 0.62);
  ctx.font = `400 ${fontSize}px "${fontFamily}", "Vazirmatn", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  const baselinePx = Math.round(((spec.baselineRow + 0.5) / targetRows) * H);
  const renderStr = getRenderStringForGlyph(glyph);
  ctx.fillText(renderStr, W / 2, baselinePx);

  const imgData = ctx.getImageData(0, 0, W, H).data;
  const binary = new Uint8Array(W * H);
  let activeCount = 0;

  for (let i = 0; i < W * H; i++) {
    if (imgData[i * 4 + 3] >= alphaThreshold) {
      binary[i] = 1;
      activeCount++;
    }
  }

  if (activeCount < 6) {
    // Fallback to resampled master if font lacks glyph
    return resampleGlyphToResolution(glyph, resolution);
  }

  const comps = extractConnectedComponents(binary, W, H);
  comps.sort((a, b) => b.area - a.area);

  // Classify small compact detached components on Persian letters as nuqtas
  const isPersianLetter =
    glyph.category === 'isol' ||
    glyph.category === 'init' ||
    glyph.category === 'medi' ||
    glyph.category === 'fina';

  const maxArea = comps[0].area;
  const strokeBinary = new Uint8Array(W * H);
  const nuqtaComps: Component[] = [];

  for (let i = 0; i < comps.length; i++) {
    const comp = comps[i];
    const bw = comp.maxX - comp.minX + 1;
    const bh = comp.maxY - comp.minY + 1;
    const aspect = Math.max(bw, bh) / Math.max(1, Math.min(bw, bh));
    const isSmallDot =
      isPersianLetter &&
      i > 0 &&
      comp.area < maxArea * 0.32 &&
      bw < fontSize * 0.34 &&
      bh < fontSize * 0.34 &&
      aspect < 2.2;

    if (isSmallDot) {
      nuqtaComps.push(comp);
    } else {
      for (const [px, py] of comp.pixels) {
        strokeBinary[py * W + px] = 1;
      }
    }
  }

  // Run Zhang-Suen thinning on stroke body ONLY
  const thinned = zhangSuenThin(strokeBinary, W, H);

  // Measure horizontal bounds across both thinned strokes & nuqtas
  let minX = W;
  let maxX = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (thinned[y * W + x] === 1) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
  }
  for (const nc of nuqtaComps) {
    if (nc.minX < minX) minX = nc.minX;
    if (nc.maxX > maxX) maxX = nc.maxX;
  }

  if (minX >= maxX) {
    return resampleGlyphToResolution(glyph, resolution);
  }

  const cellPx = H / targetRows;
  const spanCols = Math.max(
    glyph.joinsLeft || glyph.joinsRight ? 3 : 2,
    Math.min(targetCols, Math.round((maxX - minX) / cellPx) + 1)
  );

  const cells: CellType[][] = Array.from({ length: targetRows }, () =>
    Array.from({ length: targetCols }, () => 0 as CellType)
  );

  // Project thinned stroke pixels onto discrete grid
  const strokeHits = new Uint16Array(targetRows * targetCols);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (thinned[y * W + x] === 0) continue;
      const col = Math.min(
        spanCols - 1,
        Math.max(0, Math.round(((x - minX) / Math.max(1, maxX - minX)) * (spanCols - 1)))
      );
      const row = Math.min(targetRows - 1, Math.max(0, Math.floor(y / cellPx)));
      strokeHits[row * targetCols + col]++;
    }
  }

  for (let r = 0; r < targetRows; r++) {
    for (let c = 0; c < spanCols; c++) {
      if (strokeHits[r * targetCols + c] >= 1) {
        cells[r][c] = 1;
      }
    }
  }

  // Enforce strict single-row dot thickness (no 2x2 double-thick clusters)
  enforceSingleRowGrid(cells, targetRows, targetCols);

  // Snap cursive connection points to spec.joinRow so connected letters align seamlessly
  if (glyph.joinsLeft) {
    cells[spec.joinRow][0] = 1;
    if (spanCols > 1 && cells[spec.joinRow][1] === 0) {
      // Connect left join dot smoothly if adjacent col has no dot nearby
      const hasNeighbor =
        (spec.joinRow > 0 && cells[spec.joinRow - 1][1] === 1) ||
        (spec.joinRow + 1 < targetRows && cells[spec.joinRow + 1][1] === 1);
      if (!hasNeighbor) cells[spec.joinRow][1] = 1;
    }
  }
  if (glyph.joinsRight) {
    cells[spec.joinRow][spanCols - 1] = 1;
    if (spanCols > 1 && cells[spec.joinRow][spanCols - 2] === 0) {
      const hasNeighbor =
        (spec.joinRow > 0 && cells[spec.joinRow - 1][spanCols - 2] === 1) ||
        (spec.joinRow + 1 < targetRows && cells[spec.joinRow + 1][spanCols - 2] === 1);
      if (!hasNeighbor) cells[spec.joinRow][spanCols - 2] = 1;
    }
  }

  // Place detected nuqta centroids cleanly onto grid as CellType = 2
  for (const nc of nuqtaComps) {
    const col = Math.min(
      spanCols - 1,
      Math.max(0, Math.round(((nc.cx - minX) / Math.max(1, maxX - minX)) * (spanCols - 1)))
    );
    const row = Math.min(targetRows - 1, Math.max(0, Math.floor(nc.cy / cellPx)));
    if (cells[row][col] === 0) {
      cells[row][col] = 2;
    }
  }

  return {
    ...glyph,
    cols: targetCols,
    rows: targetRows,
    cells,
    advanceCols: spanCols,
    isCustomized: false,
  };
}

/**
 * Cleanly resamples a master glyph from its current grid dimensions to a new GridResolution
 * (7x9, 9x11, 11x13, 13x15) while preserving single-row strokes, nuqta separation, and joinRow alignment.
 */
export function resampleGlyphToResolution(
  glyph: GlyphData,
  targetRes: GridResolution
): GlyphData {
  const spec = RESOLUTION_SPECS[targetRes];
  if (glyph.cols === spec.cols && glyph.rows === spec.rows) {
    return glyph;
  }

  const srcRows = glyph.rows;
  const srcAdv = Math.max(1, glyph.advanceCols);

  const scaleX = spec.cols / glyph.cols;
  const targetAdv = Math.max(
    glyph.joinsLeft || glyph.joinsRight ? 3 : 2,
    Math.min(spec.cols, Math.round(srcAdv * scaleX))
  );

  // Align old baseline/join row proportionally to new spec.joinRow
  const srcJoin =
    srcRows === 9 ? 6 : srcRows === 11 ? 7 : srcRows === 13 ? 9 : 10;

  const mapRow = (sr: number): number => {
    if (sr === srcJoin) return spec.joinRow;
    if (sr < srcJoin) {
      return Math.min(
        spec.joinRow - 1,
        Math.max(0, Math.round((sr / Math.max(1, srcJoin)) * spec.joinRow))
      );
    }
    const belowSrc = srcRows - 1 - srcJoin;
    const belowDst = spec.rows - 1 - spec.joinRow;
    return Math.min(
      spec.rows - 1,
      spec.joinRow + Math.max(1, Math.round(((sr - srcJoin) / Math.max(1, belowSrc)) * belowDst))
    );
  };

  const mapCol = (sc: number): number => {
    if (srcAdv <= 1) return 0;
    return Math.min(
      targetAdv - 1,
      Math.max(0, Math.round((sc / (srcAdv - 1)) * (targetAdv - 1)))
    );
  };

  const cells: CellType[][] = Array.from({ length: spec.rows }, () =>
    Array.from({ length: spec.cols }, () => 0 as CellType)
  );

  // Map structural strokes first, preserving single-row continuity when scaling up
  const strokePoints: Array<[number, number]> = [];
  const nuqtaPoints: Array<[number, number]> = [];

  for (let r = 0; r < srcRows; r++) {
    for (let c = 0; c < srcAdv; c++) {
      const val = glyph.cells[r]?.[c] ?? 0;
      if (val === 1) strokePoints.push([r, c]);
      else if (val === 2) nuqtaPoints.push([r, c]);
    }
  }

  for (const [r, c] of strokePoints) {
    const tr = mapRow(r);
    const tc = mapCol(c);
    cells[tr][tc] = 1;

    // Bridge 1-cell gaps when upscaling connected adjacent master dots
    if (spec.rows > srcRows || targetAdv > srcAdv) {
      const neighbors: Array<[number, number]> = [
        [r, c + 1],
        [r + 1, c],
        [r + 1, c + 1],
        [r + 1, c - 1],
      ];
      for (const [nr, nc] of neighbors) {
        if (nr >= 0 && nr < srcRows && nc >= 0 && nc < srcAdv && glyph.cells[nr]?.[nc] === 1) {
          const ntr = mapRow(nr);
          const ntc = mapCol(nc);
          // Bresenham single-row bridge between (tc, tr) and (ntc, ntr)
          const steps = Math.max(Math.abs(ntc - tc), Math.abs(ntr - tr));
          if (steps > 1) {
            for (let s = 1; s < steps; s++) {
              const br = Math.round(tr + ((ntr - tr) * s) / steps);
              const bc = Math.round(tc + ((ntc - tc) * s) / steps);
              cells[br][bc] = 1;
            }
          }
        }
      }
    }
  }

  enforceSingleRowGrid(cells, spec.rows, spec.cols);

  // Ensure exact cursive connection dots on joinRow
  if (glyph.joinsLeft) cells[spec.joinRow][0] = 1;
  if (glyph.joinsRight) cells[spec.joinRow][targetAdv - 1] = 1;

  // Map nuqtas cleanly without overwriting structural strokes
  for (const [r, c] of nuqtaPoints) {
    const tr = mapRow(r);
    const tc = mapCol(c);
    if (cells[tr][tc] === 0) {
      cells[tr][tc] = 2;
    } else if (tr > 0 && cells[tr - 1][tc] === 0) {
      cells[tr - 1][tc] = 2;
    } else if (tr + 1 < spec.rows && cells[tr + 1][tc] === 0) {
      cells[tr + 1][tc] = 2;
    }
  }

  return {
    ...glyph,
    cols: spec.cols,
    rows: spec.rows,
    cells,
    advanceCols: targetAdv,
  };
}
