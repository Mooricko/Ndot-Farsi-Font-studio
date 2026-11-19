import {
  CellType,
  GlyphData,
  GridResolution,
  hasCustomSkeletonGuide,
  RESOLUTION_SPECS,
  resolveSkeletonGuideConfig,
  SkeletonGuideConfig,
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

// Authoritative Unicode Presentation Form codepoints (Blocks FB50–FDFF & FE70–FEFF)
// used as fallback if a browser/font fails to shape bare ZWJ contextual sequences.
const PERSIAN_PRESENTATION_FORMS: Record<
  string,
  Partial<Record<'isol' | 'init' | 'medi' | 'fina', number>>
> = {
  'آ': { isol: 0xfe81, fina: 0xfe82 },
  'ا': { isol: 0xfe8d, fina: 0xfe8e },
  'ب': { isol: 0xfe8f, fina: 0xfe90, init: 0xfe91, medi: 0xfe92 },
  'پ': { isol: 0xfb56, fina: 0xfb57, init: 0xfb58, medi: 0xfb59 },
  'ت': { isol: 0xfe95, fina: 0xfe96, init: 0xfe97, medi: 0xfe98 },
  'ث': { isol: 0xfe99, fina: 0xfe9a, init: 0xfe9b, medi: 0xfe9c },
  'ج': { isol: 0xfe9d, fina: 0xfe9e, init: 0xfe9f, medi: 0xfea0 },
  'چ': { isol: 0xfb7a, fina: 0xfb7b, init: 0xfb7c, medi: 0xfb7d },
  'ح': { isol: 0xfea1, fina: 0xfea2, init: 0xfea3, medi: 0xfea4 },
  'خ': { isol: 0xfea5, fina: 0xfea6, init: 0xfea7, medi: 0xfea8 },
  'د': { isol: 0xfea9, fina: 0xfeaa },
  'ذ': { isol: 0xfeab, fina: 0xfeac },
  'ر': { isol: 0xfead, fina: 0xfeae },
  'ز': { isol: 0xfeaf, fina: 0xfeb0 },
  'ژ': { isol: 0xfb8a, fina: 0xfb8b },
  'س': { isol: 0xfeb1, fina: 0xfeb2, init: 0xfeb3, medi: 0xfeb4 },
  'ش': { isol: 0xfeb5, fina: 0xfeb6, init: 0xfeb7, medi: 0xfeb8 },
  'ص': { isol: 0xfeb9, fina: 0xfeba, init: 0xfebb, medi: 0xfebc },
  'ض': { isol: 0xfebd, fina: 0xfebe, init: 0xfebf, medi: 0xfec0 },
  'ط': { isol: 0xfec1, fina: 0xfec2, init: 0xfec3, medi: 0xfec4 },
  'ظ': { isol: 0xfec5, fina: 0xfec6, init: 0xfec7, medi: 0xfec8 },
  'ع': { isol: 0xfec9, fina: 0xfeca, init: 0xfecb, medi: 0xfecc },
  'غ': { isol: 0xfecd, fina: 0xfece, init: 0xfecf, medi: 0xfed0 },
  'ف': { isol: 0xfed1, fina: 0xfed2, init: 0xfed3, medi: 0xfed4 },
  'ق': { isol: 0xfed5, fina: 0xfed6, init: 0xfed7, medi: 0xfed8 },
  'ک': { isol: 0xfb8e, fina: 0xfb8f, init: 0xfb90, medi: 0xfb91 },
  'گ': { isol: 0xfb92, fina: 0xfb93, init: 0xfb94, medi: 0xfb95 },
  'ل': { isol: 0xfedd, fina: 0xfede, init: 0xfedf, medi: 0xfee0 },
  'م': { isol: 0xfee1, fina: 0xfee2, init: 0xfee3, medi: 0xfee4 },
  'ن': { isol: 0xfee5, fina: 0xfee6, init: 0xfee7, medi: 0xfee8 },
  'و': { isol: 0xfeed, fina: 0xfeee },
  'ه': { isol: 0xfee9, fina: 0xfeea, init: 0xfeeb, medi: 0xfeec },
  'ی': { isol: 0xfbfc, fina: 0xfbfd, init: 0xfbfe, medi: 0xfbff },
};

const LIGA_PRESENTATION_FORMS: Record<string, number> = {
  'lam_alef.isol': 0xfefb,
  'lam_alef.fina': 0xfefc,
  'lam_alef_madda.isol': 0xfef5,
  'lam_alef_madda.fina': 0xfef6,
};

function hasArabicOrPersianChars(text: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
}

/**
 * Parses a user-entered replacement string or Unicode codepoint notation
 * (e.g. "U+FECA", "0xFECC", "U+0644 U+0627", or literal "ـعـ").
 * Returns null when empty or while the user is mid-way through typing a hex codepoint.
 */
export function parseCustomSkeletonInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Detect hex codepoint notation prefix so partial typing ("U+FE") doesn't render literal ASCII
  if (/^(?:U\+|0x)/i.test(trimmed)) {
    const tokens = trimmed.split(/[\s,]+/).filter(Boolean);
    const chars: string[] = [];
    for (const token of tokens) {
      const match = /^(?:U\+|0x)([0-9A-Fa-f]{4,6})$/i.exec(token);
      if (!match) return null;
      const cp = parseInt(match[1], 16);
      if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return null;
      chars.push(String.fromCodePoint(cp));
    }
    return chars.length > 0 ? chars.join('') : null;
  }

  return trimmed;
}

interface ResolvedRenderSpec {
  primaryText: string;
  isolatedComparisonText?: string;
  presentationFallbackText?: string;
  isRtl: boolean;
  allowNuqtaSplit: boolean;
}

function resolveRenderSpecForGlyph(
  glyph: GlyphData,
  guide: SkeletonGuideConfig
): ResolvedRenderSpec {
  const parsedCustom = parseCustomSkeletonInput(guide.customChar);
  if (parsedCustom) {
    const isRtl = hasArabicOrPersianChars(parsedCustom);
    return {
      primaryText: parsedCustom,
      isRtl,
      allowNuqtaSplit: isRtl,
    };
  }

  const effectiveForm =
    guide.sourceForm !== 'auto' ? guide.sourceForm : glyph.contextualForm;

  if (glyph.category === 'liga') {
    if (glyph.id === 'lam_alef.isol' || glyph.id === 'lam_alef.fina') {
      const useFina =
        effectiveForm === 'fina' ||
        effectiveForm === 'medi' ||
        (guide.sourceForm === 'auto' && glyph.id === 'lam_alef.fina');
      const fallbackCp = useFina
        ? LIGA_PRESENTATION_FORMS['lam_alef.fina']
        : LIGA_PRESENTATION_FORMS['lam_alef.isol'];
      return {
        primaryText: useFina ? '\u200Dلا' : 'لا',
        isolatedComparisonText: useFina ? 'لا' : undefined,
        presentationFallbackText: String.fromCodePoint(fallbackCp),
        isRtl: true,
        allowNuqtaSplit: false,
      };
    }
    if (glyph.id === 'lam_alef_madda.isol' || glyph.id === 'lam_alef_madda.fina') {
      const useFina =
        effectiveForm === 'fina' ||
        effectiveForm === 'medi' ||
        (guide.sourceForm === 'auto' && glyph.id === 'lam_alef_madda.fina');
      const fallbackCp = useFina
        ? LIGA_PRESENTATION_FORMS['lam_alef_madda.fina']
        : LIGA_PRESENTATION_FORMS['lam_alef_madda.isol'];
      return {
        primaryText: useFina ? '\u200Dلآ' : 'لآ',
        isolatedComparisonText: useFina ? 'لآ' : undefined,
        presentationFallbackText: String.fromCodePoint(fallbackCp),
        isRtl: true,
        allowNuqtaSplit: false,
      };
    }
    return {
      primaryText: glyph.char,
      isRtl: hasArabicOrPersianChars(glyph.char),
      allowNuqtaSplit: false,
    };
  }

  const base = glyph.baseLetter ?? glyph.char;
  const isRtl = hasArabicOrPersianChars(base);
  const isPersianLetter =
    glyph.category === 'isol' ||
    glyph.category === 'init' ||
    glyph.category === 'medi' ||
    glyph.category === 'fina';

  if (effectiveForm && isRtl) {
    const presMap = PERSIAN_PRESENTATION_FORMS[base];
    const presCp = presMap?.[effectiveForm];
    const presChar = presCp !== undefined ? String.fromCodePoint(presCp) : undefined;

    if (effectiveForm === 'init') {
      return {
        primaryText: `${base}\u200D`,
        isolatedComparisonText: base,
        presentationFallbackText: presChar,
        isRtl: true,
        allowNuqtaSplit: isPersianLetter,
      };
    }
    if (effectiveForm === 'medi') {
      return {
        primaryText: `\u200D${base}\u200D`,
        isolatedComparisonText: base,
        presentationFallbackText: presChar,
        isRtl: true,
        allowNuqtaSplit: isPersianLetter,
      };
    }
    if (effectiveForm === 'fina') {
      return {
        primaryText: `\u200D${base}`,
        isolatedComparisonText: base,
        presentationFallbackText: presChar,
        isRtl: true,
        allowNuqtaSplit: isPersianLetter,
      };
    }
    return {
      primaryText: base,
      presentationFallbackText: presChar,
      isRtl: true,
      allowNuqtaSplit: isPersianLetter,
    };
  }

  return {
    primaryText: base,
    isRtl,
    allowNuqtaSplit: isPersianLetter,
  };
}

// In-memory cache of decoded per-glyph custom reference images
const guideImageCache = new Map<string, HTMLImageElement>();

export function getCachedGuideImage(dataUrl?: string): HTMLImageElement | null {
  if (!dataUrl) return null;
  const img = guideImageCache.get(dataUrl);
  if (img && img.complete && img.naturalWidth > 0) return img;
  return null;
}

export function ensureGuideImageLoaded(dataUrl: string): Promise<HTMLImageElement> {
  const cached = getCachedGuideImage(dataUrl);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      guideImageCache.set(dataUrl, img);
      resolve(img);
    };
    img.onerror = () => reject(new Error('Failed to decode reference image'));
    img.src = dataUrl;
  });
}

/**
 * Loads a user-selected image file (PNG, JPG, SVG, WebP) and normalizes it
 * to a compact max-256px PNG data URL suitable for per-glyph persistence.
 */
export async function loadGuideImageDataUrlFromFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please upload an image file (PNG, JPG, SVG, or WebP)');
  }

  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read image file'));
    reader.readAsDataURL(file);
  });

  const img = await ensureGuideImageLoaded(rawDataUrl);
  const maxDim = 256;
  const ratio = Math.min(1, maxDim / Math.max(1, img.naturalWidth, img.naturalHeight));
  const outW = Math.max(1, Math.round(img.naturalWidth * ratio));
  const outH = Math.max(1, Math.round(img.naturalHeight * ratio));

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return rawDataUrl;

  ctx.clearRect(0, 0, outW, outH);
  ctx.drawImage(img, 0, 0, outW, outH);
  const normalizedUrl = canvas.toDataURL('image/png');
  await ensureGuideImageLoaded(normalizedUrl);
  return normalizedUrl;
}

interface ExtractedSkeletonGeometry {
  W: number;
  H: number;
  silhouetteCanvas: HTMLCanvasElement;
  thinned: Uint8Array;
  nuqtaComps: Component[];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  anchorOffX: number;
  anchorOffY: number;
  targetAnchorCol: number;
  targetAnchorRow: number;
  effScaleX: number;
  effScaleY: number;
  toGridCol: (x: number) => number;
  toGridRow: (y: number) => number;
  isCustomImage: boolean;
}

function rasterizeTextBinary(
  ctx: CanvasRenderingContext2D,
  text: string,
  font: string,
  W: number,
  H: number,
  baselinePx: number,
  isRtl: boolean,
  alphaThreshold: number
): { binary: Uint8Array; activeCount: number } {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#38BDF8';
  ctx.font = font;
  ctx.direction = isRtl ? 'rtl' : 'ltr';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, W / 2, baselinePx);

  const imgData = ctx.getImageData(0, 0, W, H).data;
  const binary = new Uint8Array(W * H);
  let activeCount = 0;
  for (let i = 0; i < W * H; i++) {
    if (imgData[i * 4 + 3] >= alphaThreshold) {
      binary[i] = 1;
      activeCount++;
    }
  }
  return { binary, activeCount };
}

function bitmapsNearlyEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diffs = 0;
  let union = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) diffs++;
    if (a[i] === 1 || b[i] === 1) union++;
  }
  if (union === 0) return true;
  return diffs / union < 0.03;
}

/**
 * Unified skeleton geometry pipeline consumed by BOTH the live Blueprint Overlay
 * and the Skeletonize CTA so the visual guide and generated dots align 1-to-1.
 */
function extractSkeletonGeometry(
  glyph: GlyphData,
  fontFamily: string,
  resolution: GridResolution,
  joinRowOffset: number,
  alphaThreshold: number,
  preloadedImage?: HTMLImageElement | null
): ExtractedSkeletonGeometry | null {
  const spec = RESOLUTION_SPECS[resolution];
  const targetCols = spec.cols;
  const targetRows = spec.rows;
  const guide = resolveSkeletonGuideConfig(glyph.skeletonGuide);

  const W = 144;
  const H = 144;
  const off = document.createElement('canvas');
  off.width = W;
  off.height = H;
  const octx = off.getContext('2d', { willReadFrequently: true });
  if (!octx) return null;

  const fontSize = Math.round(H * 0.62);
  const baselinePx = Math.round(((spec.baselineRow + 0.5) / targetRows) * H);

  let binary: Uint8Array = new Uint8Array(W * H);
  let activeCount = 0;
  let allowNuqtaSplit = false;
  let isCustomImage = false;

  const customImg =
    guide.customImageDataUrl
      ? (preloadedImage ?? getCachedGuideImage(guide.customImageDataUrl))
      : null;

  if (customImg) {
    isCustomImage = true;
    // Draw uploaded image fitted cleanly inside offscreen frame
    const pad = 16;
    const avail = W - pad * 2;
    const imgScale = Math.min(avail / Math.max(1, customImg.naturalWidth), avail / Math.max(1, customImg.naturalHeight));
    const drawW = customImg.naturalWidth * imgScale;
    const drawH = customImg.naturalHeight * imgScale;
    const drawX = (W - drawW) / 2;
    const drawY = (H - drawH) / 2;

    octx.clearRect(0, 0, W, H);
    octx.drawImage(customImg, drawX, drawY, drawW, drawH);

    const imgData = octx.getImageData(0, 0, W, H);
    const data = imgData.data;

    // Detect transparent background vs solid opaque background
    let transparentPixels = 0;
    for (let i = 0; i < W * H; i++) {
      if (data[i * 4 + 3] < 32) transparentPixels++;
    }
    const hasTransparentBg = transparentPixels > W * H * 0.08;

    // Build binary stroke mask & replace silhouette with clean blueprint cyan
    const lumCutoff = Math.max(30, 255 - Math.min(220, alphaThreshold));
    for (let i = 0; i < W * H; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      const a = data[i * 4 + 3];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;

      let isFg = false;
      if (hasTransparentBg) {
        if (a >= alphaThreshold) {
          isFg = guide.invertImage ? lum < 245 : true;
        }
      } else {
        isFg = guide.invertImage ? lum < lumCutoff : lum >= alphaThreshold;
      }

      if (isFg) {
        binary[i] = 1;
        activeCount++;
        data[i * 4] = 56;     // #38
        data[i * 4 + 1] = 189; // #BD
        data[i * 4 + 2] = 248; // #F8
        data[i * 4 + 3] = 255;
      } else {
        data[i * 4 + 3] = 0;
      }
    }
    octx.putImageData(imgData, 0, 0);
    allowNuqtaSplit =
      glyph.category === 'isol' ||
      glyph.category === 'init' ||
      glyph.category === 'medi' ||
      glyph.category === 'fina';
  } else {
    const renderSpec = resolveRenderSpecForGlyph(glyph, guide);
    const fontStr = `400 ${fontSize}px "${fontFamily}", "Vazirmatn", sans-serif`;
    allowNuqtaSplit = renderSpec.allowNuqtaSplit;

    let result = rasterizeTextBinary(
      octx,
      renderSpec.primaryText,
      fontStr,
      W,
      H,
      baselinePx,
      renderSpec.isRtl,
      alphaThreshold
    );

    // Automatic verification fallback: if a font/browser ignored ZWJ for a contextual form
    // and produced the isolated silhouette, switch to the exact Unicode Presentation Form.
    if (
      renderSpec.isolatedComparisonText &&
      renderSpec.presentationFallbackText &&
      result.activeCount >= 6
    ) {
      const cmpCanvas = document.createElement('canvas');
      cmpCanvas.width = W;
      cmpCanvas.height = H;
      const cmpCtx = cmpCanvas.getContext('2d', { willReadFrequently: true });
      if (cmpCtx) {
        const isoRes = rasterizeTextBinary(
          cmpCtx,
          renderSpec.isolatedComparisonText,
          fontStr,
          W,
          H,
          baselinePx,
          renderSpec.isRtl,
          alphaThreshold
        );
        if (bitmapsNearlyEqual(result.binary, isoRes.binary)) {
          const presRes = rasterizeTextBinary(
            octx,
            renderSpec.presentationFallbackText,
            fontStr,
            W,
            H,
            baselinePx,
            renderSpec.isRtl,
            alphaThreshold
          );
          if (presRes.activeCount >= 6) {
            result = presRes;
          } else {
            // Re-render primary text if presentation form wasn't in font
            result = rasterizeTextBinary(
              octx,
              renderSpec.primaryText,
              fontStr,
              W,
              H,
              baselinePx,
              renderSpec.isRtl,
              alphaThreshold
            );
          }
        }
      }
    }

    binary = result.binary;
    activeCount = result.activeCount;
  }

  if (activeCount < 6) return null;

  let minX = W;
  let maxX = 0;
  let minY = H;
  let maxY = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (binary[y * W + x] === 1) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (minX > maxX || minY > maxY) return null;

  const comps = extractConnectedComponents(binary, W, H);
  comps.sort((a, b) => b.area - a.area);

  const maxArea = comps[0].area;
  const strokeBinary = new Uint8Array(W * H);
  const nuqtaComps: Component[] = [];

  for (let i = 0; i < comps.length; i++) {
    const comp = comps[i];
    const bw = comp.maxX - comp.minX + 1;
    const bh = comp.maxY - comp.minY + 1;
    const aspect = Math.max(bw, bh) / Math.max(1, Math.min(bw, bh));
    const isSmallDot =
      allowNuqtaSplit &&
      i > 0 &&
      comp.area < maxArea * 0.32 &&
      bw < fontSize * 0.34 &&
      bh < fontSize * 0.34 &&
      aspect < 2.1;

    if (isSmallDot) {
      nuqtaComps.push(comp);
    } else {
      for (const [px, py] of comp.pixels) {
        strokeBinary[py * W + px] = 1;
      }
    }
  }

  const thinned = zhangSuenThin(strokeBinary, W, H);

  // Unified grid-cell projection math (1 grid row = H / targetRows offscreen pixels at scale 1.0)
  const baseCellScale = targetRows / H;
  const effScaleX = baseCellScale * guide.scale * guide.scaleX;
  const effScaleY = baseCellScale * guide.scale * guide.scaleY;

  const anchorOffX = (minX + maxX) / 2;
  const anchorOffY = isCustomImage ? (minY + maxY) / 2 : baselinePx;

  let targetAnchorCol = glyph.advanceCols / 2 + guide.offsetX;
  const targetAnchorRow = isCustomImage
    ? targetRows / 2 + guide.offsetY
    : spec.baselineRow + 0.5 + joinRowOffset + guide.offsetY;

  // When user hasn't explicitly shifted/scaled horizontally, gently keep wide glyphs inside [0..targetCols]
  const isDefaultHorizontal =
    Math.abs(guide.offsetX) < 0.001 &&
    Math.abs(guide.scale - 1) < 0.001 &&
    Math.abs(guide.scaleX - 1) < 0.001;
  if (isDefaultHorizontal) {
    const halfSpanCols = ((maxX - minX) / 2) * effScaleX;
    const minCenter = halfSpanCols + 0.1;
    const maxCenter = targetCols - halfSpanCols - 0.1;
    if (minCenter <= maxCenter) {
      targetAnchorCol = Math.max(minCenter, Math.min(maxCenter, targetAnchorCol));
    }
  }

  const toGridCol = (x: number) => (x + 0.5 - anchorOffX) * effScaleX + targetAnchorCol;
  const toGridRow = (y: number) => (y + 0.5 - anchorOffY) * effScaleY + targetAnchorRow;

  return {
    W,
    H,
    silhouetteCanvas: off,
    thinned,
    nuqtaComps,
    minX,
    maxX,
    minY,
    maxY,
    anchorOffX,
    anchorOffY,
    targetAnchorCol,
    targetAnchorRow,
    effScaleX,
    effScaleY,
    toGridCol,
    toGridRow,
    isCustomImage,
  };
}

/**
 * Approach A: Rasterizes a Farsi/Latin glyph from any loaded browser/uploaded font
 * (or per-glyph custom reference image), respects per-glyph Skeleton Guide overrides
 * (source form, custom char/Unicode, scale, width/height resize, X/Y offset),
 * applies Zhang-Suen morphological thinning, snaps to the active dot-matrix grid,
 * and enforces strict single-row thickness + cursive join alignment.
 */
export function skeletonizeGlyphFromFont(
  glyph: GlyphData,
  fontFamily: string,
  resolution: GridResolution,
  alphaThreshold = 96,
  joinRowOffset = 0,
  preloadedImage?: HTMLImageElement | null
): GlyphData {
  const spec = RESOLUTION_SPECS[resolution];
  const targetCols = spec.cols;
  const targetRows = spec.rows;
  const joinRow = Math.max(0, Math.min(targetRows - 1, spec.joinRow + joinRowOffset));
  const guide = resolveSkeletonGuideConfig(glyph.skeletonGuide);
  const hasCustomGuide = hasCustomSkeletonGuide(glyph.skeletonGuide);

  // Special case for Tatweel / Kashida when no custom source override is set
  if (
    glyph.id === 'kashida' &&
    !guide.customChar.trim() &&
    !guide.customImageDataUrl
  ) {
    const cells: CellType[][] = Array.from({ length: targetRows }, (_, r) =>
      Array.from({ length: targetCols }, (_, c) =>
        r === joinRow && c < 4 ? 1 : 0
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

  const geom = extractSkeletonGeometry(
    glyph,
    fontFamily,
    resolution,
    joinRowOffset,
    alphaThreshold,
    preloadedImage
  );

  if (!geom) {
    return resampleGlyphToResolution(glyph, resolution);
  }

  const { W, H, thinned, nuqtaComps, toGridCol, toGridRow } = geom;

  const cells: CellType[][] = Array.from({ length: targetRows }, () =>
    Array.from({ length: targetCols }, () => 0 as CellType)
  );

  // Project transformed thinned stroke pixels directly onto discrete grid cells (1-to-1 with overlay)
  const strokeHits = new Uint16Array(targetRows * targetCols);
  let maxActiveCol = 0;
  let hasAnyStroke = false;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (thinned[y * W + x] === 0) continue;
      const col = Math.floor(toGridCol(x));
      const row = Math.floor(toGridRow(y));
      if (col >= 0 && col < targetCols && row >= 0 && row < targetRows) {
        strokeHits[row * targetCols + col]++;
        if (col > maxActiveCol) maxActiveCol = col;
        hasAnyStroke = true;
      }
    }
  }

  if (!hasAnyStroke) {
    return resampleGlyphToResolution(glyph, resolution);
  }

  for (let r = 0; r < targetRows; r++) {
    for (let c = 0; c < targetCols; c++) {
      if (strokeHits[r * targetCols + c] >= 1) {
        cells[r][c] = 1;
      }
    }
  }

  // Enforce strict single-row dot thickness (no 2x2 double-thick clusters)
  enforceSingleRowGrid(cells, targetRows, targetCols);

  // Place detected nuqta centroids onto exact transformed grid cells
  for (const nc of nuqtaComps) {
    const col = Math.floor(toGridCol(nc.cx));
    const row = Math.floor(toGridRow(nc.cy));
    if (col >= 0 && col < targetCols && row >= 0 && row < targetRows) {
      if (col > maxActiveCol) maxActiveCol = col;
      if (cells[row][col] === 0) {
        cells[row][col] = 2;
      }
    }
  }

  // Preserve current advanceCols when using a custom guide so the user's manual
  // positioning stays rock-steady (expanding automatically if dots extend further)
  const spanCols = hasCustomGuide
    ? Math.max(glyph.advanceCols, Math.min(targetCols, maxActiveCol + 1))
    : Math.max(
        glyph.joinsLeft || glyph.joinsRight ? 3 : 2,
        Math.min(targetCols, maxActiveCol + 1)
      );

  // Snap cursive connection points to joinRow so connected letters align seamlessly
  if (glyph.joinsLeft) {
    cells[joinRow][0] = 1;
    if (spanCols > 1 && cells[joinRow][1] === 0) {
      const hasNeighbor =
        (joinRow > 0 && cells[joinRow - 1][1] === 1) ||
        (joinRow + 1 < targetRows && cells[joinRow + 1][1] === 1);
      if (!hasNeighbor) cells[joinRow][1] = 1;
    }
  }
  if (glyph.joinsRight) {
    cells[joinRow][spanCols - 1] = 1;
    if (spanCols > 1 && cells[joinRow][spanCols - 2] === 0) {
      const hasNeighbor =
        (joinRow > 0 && cells[joinRow - 1][spanCols - 2] === 1) ||
        (joinRow + 1 < targetRows && cells[joinRow + 1][spanCols - 2] === 1);
      if (!hasNeighbor) cells[joinRow][spanCols - 2] = 1;
    }
  }

  return {
    ...glyph,
    cols: targetCols,
    rows: targetRows,
    cells,
    advanceCols: spanCols,
    isCustomized: hasCustomGuide ? true : false,
  };
}

/**
 * Async wrapper that ensures any per-glyph custom reference image is decoded
 * before running unified WYSIWYG skeletonization.
 */
export async function skeletonizeGlyphWithGuideAsync(
  glyph: GlyphData,
  fontFamily: string,
  resolution: GridResolution,
  alphaThreshold = 96,
  joinRowOffset = 0
): Promise<GlyphData> {
  let preloaded: HTMLImageElement | null = null;
  const imgUrl = glyph.skeletonGuide?.customImageDataUrl;
  if (imgUrl) {
    try {
      preloaded = await ensureGuideImageLoaded(imgUrl);
    } catch {
      preloaded = null;
    }
  }
  return skeletonizeGlyphFromFont(
    glyph,
    fontFamily,
    resolution,
    alphaThreshold,
    joinRowOffset,
    preloaded
  );
}

/**
 * Renders the per-glyph reference skeleton sketch (low-opacity silhouette wash +
 * crisp Zhang-Suen centerline wireframe + original nuqta centroid rings) onto
 * an overlay canvas aligned 1-to-1 with the Glyph Editor grid and Skeletonize CTA.
 */
export function renderSkeletonSketchToCanvas(
  canvas: HTMLCanvasElement,
  glyph: GlyphData,
  fontFamily: string,
  resolution: GridResolution,
  cellPixelSize: number,
  joinRowOffset: number,
  alphaThreshold = 96,
  preloadedImage?: HTMLImageElement | null
): void {
  const cssW = glyph.cols * cellPixelSize;
  const cssH = glyph.rows * cellPixelSize;
  const dpr = Math.min(2, window.devicePixelRatio || 2);

  if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const spec = RESOLUTION_SPECS[resolution];
  const joinRow = Math.max(0, Math.min(glyph.rows - 1, spec.joinRow + joinRowOffset));
  const guide = resolveSkeletonGuideConfig(glyph.skeletonGuide);
  const opacity = Math.max(0.1, Math.min(1, guide.opacity));

  // Special case for Tatweel / Kashida without custom source override
  if (
    glyph.id === 'kashida' &&
    !guide.customChar.trim() &&
    !guide.customImageDataUrl
  ) {
    const y = (joinRow + 0.5 + guide.offsetY) * cellPixelSize;
    const centerX = (glyph.advanceCols / 2 + guide.offsetX) * cellPixelSize;
    const halfLen = ((Math.max(1, glyph.advanceCols - 1) * guide.scale * guide.scaleX) / 2) * cellPixelSize;
    ctx.strokeStyle = `rgba(56, 189, 248, ${opacity.toFixed(2)})`;
    ctx.lineWidth = Math.max(2, cellPixelSize * 0.07);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(centerX - halfLen, y);
    ctx.lineTo(centerX + halfLen, y);
    ctx.stroke();
    return;
  }

  const geom = extractSkeletonGeometry(
    glyph,
    fontFamily,
    resolution,
    joinRowOffset,
    alphaThreshold,
    preloadedImage
  );

  if (!geom) return;

  const {
    W,
    H,
    silhouetteCanvas,
    thinned,
    nuqtaComps,
    anchorOffX,
    anchorOffY,
    targetAnchorCol,
    targetAnchorRow,
    effScaleX,
    effScaleY,
    toGridCol,
    toGridRow,
  } = geom;

  // 1. Low-opacity ghost wash of the original font glyph or uploaded sketch
  const destX = (targetAnchorCol - anchorOffX * effScaleX) * cellPixelSize;
  const destY = (targetAnchorRow - anchorOffY * effScaleY) * cellPixelSize;
  const destW = W * effScaleX * cellPixelSize;
  const destH = H * effScaleY * cellPixelSize;

  ctx.save();
  ctx.globalAlpha = Math.min(0.28, opacity * 0.22);
  ctx.drawImage(silhouetteCanvas, destX, destY, destW, destH);
  ctx.restore();

  // 2. Crisp Zhang-Suen 1px centerline wireframe in technical blueprint cyan
  ctx.save();
  ctx.strokeStyle = `rgba(56, 189, 248, ${opacity.toFixed(2)})`;
  ctx.fillStyle = `rgba(56, 189, 248, ${opacity.toFixed(2)})`;
  ctx.lineWidth = Math.max(1.75, cellPixelSize * 0.065);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const toPxX = (x: number) => toGridCol(x) * cellPixelSize;
  const toPxY = (y: number) => toGridRow(y) * cellPixelSize;

  ctx.beginPath();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (thinned[y * W + x] === 0) continue;
      const sx = toPxX(x);
      const sy = toPxY(y);
      let connected = false;

      if (x + 1 < W && thinned[y * W + (x + 1)] === 1) {
        ctx.moveTo(sx, sy);
        ctx.lineTo(toPxX(x + 1), sy);
        connected = true;
      }
      if (y + 1 < H && thinned[(y + 1) * W + x] === 1) {
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx, toPxY(y + 1));
        connected = true;
      }
      if (x + 1 < W && y + 1 < H && thinned[(y + 1) * W + (x + 1)] === 1) {
        ctx.moveTo(sx, sy);
        ctx.lineTo(toPxX(x + 1), toPxY(y + 1));
        connected = true;
      }
      if (x - 1 >= 0 && y + 1 < H && thinned[(y + 1) * W + (x - 1)] === 1) {
        ctx.moveTo(sx, sy);
        ctx.lineTo(toPxX(x - 1), toPxY(y + 1));
        connected = true;
      }

      if (!connected) {
        const hasPrev =
          (x > 0 && thinned[y * W + (x - 1)] === 1) ||
          (y > 0 && thinned[(y - 1) * W + x] === 1) ||
          (x > 0 && y > 0 && thinned[(y - 1) * W + (x - 1)] === 1) ||
          (x + 1 < W && y > 0 && thinned[(y - 1) * W + (x + 1)] === 1);
        if (!hasPrev) {
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + 0.01, sy);
        }
      }
    }
  }
  ctx.stroke();
  ctx.restore();

  // 3. Original nuqta centroids in soft amber drafting rings
  if (nuqtaComps.length > 0) {
    ctx.save();
    const r = Math.max(3.5, cellPixelSize * 0.14);
    const fillAlpha = Math.min(0.4, opacity * 0.32);
    const strokeAlpha = Math.min(1, opacity * 1.05);
    for (const nc of nuqtaComps) {
      const nx = toPxX(nc.cx);
      const ny = toPxY(nc.cy);
      ctx.beginPath();
      ctx.arc(nx, ny, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(251, 191, 36, ${fillAlpha.toFixed(2)})`;
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = `rgba(251, 191, 36, ${strokeAlpha.toFixed(2)})`;
      ctx.stroke();
    }
    ctx.restore();
  }
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
