import {
  DotShape,
  FontMetadata,
  FontParams,
  GlyphData,
  RESOLUTION_SPECS,
} from '../types/font';
import { computeGlyphDots } from './shaper';

// ============================================================================
// Big-Endian Binary Writer Helper
// ============================================================================
class BinWriter {
  private buf: number[] = [];

  get length(): number {
    return this.buf.length;
  }

  u8(v: number): this {
    this.buf.push(v & 0xff);
    return this;
  }

  i8(v: number): this {
    this.buf.push(v & 0xff);
    return this;
  }

  u16(v: number): this {
    this.buf.push((v >>> 8) & 0xff, v & 0xff);
    return this;
  }

  i16(v: number): this {
    this.buf.push((v >> 8) & 0xff, v & 0xff);
    return this;
  }

  u32(v: number): this {
    this.buf.push(
      (v >>> 24) & 0xff,
      (v >>> 16) & 0xff,
      (v >>> 8) & 0xff,
      v & 0xff
    );
    return this;
  }

  i64Zero(): this {
    for (let i = 0; i < 8; i++) this.buf.push(0);
    return this;
  }

  tag(t: string): this {
    for (let i = 0; i < 4; i++) {
      this.buf.push((t.charCodeAt(i) || 0x20) & 0xff);
    }
    return this;
  }

  bytes(arr: Uint8Array | number[]): this {
    for (let i = 0; i < arr.length; i++) this.buf.push(arr[i] & 0xff);
    return this;
  }

  pad4(): this {
    while (this.buf.length % 4 !== 0) this.buf.push(0);
    return this;
  }

  toUint8Array(): Uint8Array {
    return new Uint8Array(this.buf);
  }
}

interface ContourPoint {
  x: number;
  y: number;
  onCurve: boolean;
}

// ============================================================================
// Clockwise Quadratic Bézier Contours for TrueType 'glyf'
// (TrueType outer solid fills MUST wind clockwise in +X right, +Y up space)
// ============================================================================
function createDotContour(
  cx: number,
  cy: number,
  r: number,
  shape: DotShape
): ContourPoint[] {
  const rad = Math.max(4, Math.round(r));
  const x = Math.round(cx);
  const y = Math.round(cy);

  if (shape === 'square') {
    return [
      { x: x - rad, y: y + rad, onCurve: true },
      { x: x + rad, y: y + rad, onCurve: true },
      { x: x + rad, y: y - rad, onCurve: true },
      { x: x - rad, y: y - rad, onCurve: true },
    ];
  }

  if (shape === 'diamond') {
    return [
      { x, y: y + rad, onCurve: true },
      { x: x + rad, y, onCurve: true },
      { x, y: y - rad, onCurve: true },
      { x: x - rad, y, onCurve: true },
    ];
  }

  if (shape === 'rounded') {
    const cr = Math.max(2, Math.round(rad * 0.48));
    return [
      { x: x - rad + cr, y: y + rad, onCurve: true },
      { x: x + rad - cr, y: y + rad, onCurve: true },
      { x: x + rad, y: y + rad, onCurve: false },
      { x: x + rad, y: y + rad - cr, onCurve: true },
      { x: x + rad, y: y - rad + cr, onCurve: true },
      { x: x + rad, y: y - rad, onCurve: false },
      { x: x + rad - cr, y: y - rad, onCurve: true },
      { x: x - rad + cr, y: y - rad, onCurve: true },
      { x: x - rad, y: y - rad, onCurve: false },
      { x: x - rad, y: y - rad + cr, onCurve: true },
      { x: x - rad, y: y + rad - cr, onCurve: true },
      { x: x - rad, y: y + rad, onCurve: false },
    ];
  }

  // Circle: 8-segment clockwise TrueType quadratic spline (16 points)
  const pts: ContourPoint[] = [];
  const ctrlR = rad / Math.cos(Math.PI / 8); // ~1.0823922 * rad
  for (let k = 0; k < 8; k++) {
    const aOn = Math.PI / 2 - (k * Math.PI) / 4;
    const aOff = aOn - Math.PI / 8;
    pts.push({
      x: Math.round(x + rad * Math.cos(aOn)),
      y: Math.round(y + rad * Math.sin(aOn)),
      onCurve: true,
    });
    pts.push({
      x: Math.round(x + ctrlR * Math.cos(aOff)),
      y: Math.round(y + ctrlR * Math.sin(aOff)),
      onCurve: false,
    });
  }
  return pts;
}

interface CompiledGlyph {
  gid: number;
  psName: string;
  advanceWidth: number;
  lsb: number;
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
  numPoints: number;
  numContours: number;
  glyfBytes: Uint8Array;
}

function encodeSimpleGlyph(contours: ContourPoint[][]): {
  bytes: Uint8Array;
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
  numPoints: number;
} {
  if (contours.length === 0) {
    return {
      bytes: new Uint8Array(0),
      xMin: 0,
      yMin: 0,
      xMax: 0,
      yMax: 0,
      numPoints: 0,
    };
  }

  let xMin = Infinity;
  let yMin = Infinity;
  let xMax = -Infinity;
  let yMax = -Infinity;

  const flatPts: ContourPoint[] = [];
  const endPts: number[] = [];

  for (const contour of contours) {
    for (const pt of contour) {
      flatPts.push(pt);
      if (pt.x < xMin) xMin = pt.x;
      if (pt.x > xMax) xMax = pt.x;
      if (pt.y < yMin) yMin = pt.y;
      if (pt.y > yMax) yMax = pt.y;
    }
    endPts.push(flatPts.length - 1);
  }

  const w = new BinWriter();
  w.i16(contours.length);
  w.i16(xMin);
  w.i16(yMin);
  w.i16(xMax);
  w.i16(yMax);

  for (const ep of endPts) w.u16(ep);
  w.u16(0); // instructionLength = 0

  const flags: number[] = [];
  const xDeltas: number[] = [];
  const yDeltas: number[] = [];

  let prevX = 0;
  let prevY = 0;

  for (const pt of flatPts) {
    const dx = pt.x - prevX;
    const dy = pt.y - prevY;
    prevX = pt.x;
    prevY = pt.y;

    let flag = pt.onCurve ? 0x01 : 0x00;

    if (dx === 0) {
      flag |= 0x10; // X_IS_SAME
    } else if (dx >= -255 && dx <= 255) {
      flag |= 0x02; // X_SHORT_VECTOR
      if (dx > 0) flag |= 0x10; // POSITIVE_X_SHORT_VECTOR
    }

    if (dy === 0) {
      flag |= 0x20; // Y_IS_SAME
    } else if (dy >= -255 && dy <= 255) {
      flag |= 0x04; // Y_SHORT_VECTOR
      if (dy > 0) flag |= 0x20; // POSITIVE_Y_SHORT_VECTOR
    }

    flags.push(flag);
    xDeltas.push(dx);
    yDeltas.push(dy);
  }

  for (const f of flags) w.u8(f);

  for (let i = 0; i < flatPts.length; i++) {
    const dx = xDeltas[i];
    if (dx === 0) continue;
    if (dx >= -255 && dx <= 255) {
      w.u8(Math.abs(dx));
    } else {
      w.i16(dx);
    }
  }

  for (let i = 0; i < flatPts.length; i++) {
    const dy = yDeltas[i];
    if (dy === 0) continue;
    if (dy >= -255 && dy <= 255) {
      w.u8(Math.abs(dy));
    } else {
      w.i16(dy);
    }
  }

  w.pad4();
  return {
    bytes: w.toUint8Array(),
    xMin,
    yMin,
    xMax,
    yMax,
    numPoints: flatPts.length,
  };
}

// ============================================================================
// Table Builders: cmap (Format 4 + Format 12), name, post, GSUB v1.0
// ============================================================================
function buildCmapTable(unicodeToGid: Map<number, number>): Uint8Array {
  const entries = Array.from(unicodeToGid.entries())
    .filter(([cp]) => cp <= 0xffff)
    .sort((a, b) => a[0] - b[0]);

  // Group contiguous BMP runs into Format 4 segments
  interface Seg {
    start: number;
    end: number;
    delta: number;
  }
  const segs: Seg[] = [];
  for (const [cp, gid] of entries) {
    const delta = (gid - cp) & 0xffff;
    const prev = segs[segs.length - 1];
    if (prev && cp === prev.end + 1 && delta === prev.delta) {
      prev.end = cp;
    } else {
      segs.push({ start: cp, end: cp, delta });
    }
  }
  // Mandatory sentinel segment
  segs.push({ start: 0xffff, end: 0xffff, delta: 1 });

  const segCount = segs.length;
  const segCountX2 = segCount * 2;
  const searchRange = 2 * Math.pow(2, Math.floor(Math.log2(segCount)));
  const entrySelector = Math.floor(Math.log2(searchRange / 2));
  const rangeShift = segCountX2 - searchRange;

  const fmt4 = new BinWriter();
  const fmt4Len = 16 + segCount * 8;
  fmt4.u16(4); // format
  fmt4.u16(fmt4Len);
  fmt4.u16(0); // language
  fmt4.u16(segCountX2);
  fmt4.u16(searchRange);
  fmt4.u16(entrySelector);
  fmt4.u16(rangeShift);

  for (const s of segs) fmt4.u16(s.end);
  fmt4.u16(0); // reservedPad
  for (const s of segs) fmt4.u16(s.start);
  for (const s of segs) fmt4.u16(s.delta);
  for (let i = 0; i < segCount; i++) fmt4.u16(0); // idRangeOffset = 0
  const fmt4Bytes = fmt4.toUint8Array();

  // Format 12 (Full Unicode segmented coverage)
  interface Group12 {
    start: number;
    end: number;
    startGid: number;
  }
  const allEntries = Array.from(unicodeToGid.entries()).sort((a, b) => a[0] - b[0]);
  const groups: Group12[] = [];
  for (const [cp, gid] of allEntries) {
    const prev = groups[groups.length - 1];
    if (
      prev &&
      cp === prev.end + 1 &&
      gid === prev.startGid + (cp - prev.start)
    ) {
      prev.end = cp;
    } else {
      groups.push({ start: cp, end: cp, startGid: gid });
    }
  }

  const fmt12 = new BinWriter();
  const fmt12Len = 16 + groups.length * 12;
  fmt12.u16(12); // format
  fmt12.u16(0); // reserved
  fmt12.u32(fmt12Len);
  fmt12.u32(0); // language
  fmt12.u32(groups.length);
  for (const g of groups) {
    fmt12.u32(g.start);
    fmt12.u32(g.end);
    fmt12.u32(g.startGid);
  }
  const fmt12Bytes = fmt12.toUint8Array();

  // cmap header with 3 encoding records:
  // (0, 3) Unicode BMP -> fmt4
  // (3, 1) Windows BMP -> fmt4
  // (3, 10) Windows Full -> fmt12
  const headerSize = 4 + 3 * 8;
  const fmt4Offset = headerSize;
  const fmt12Offset = fmt4Offset + fmt4Bytes.length;

  const out = new BinWriter();
  out.u16(0); // version
  out.u16(3); // numTables

  out.u16(0).u16(3).u32(fmt4Offset);
  out.u16(3).u16(1).u32(fmt4Offset);
  out.u16(3).u16(10).u32(fmt12Offset);

  out.bytes(fmt4Bytes);
  out.bytes(fmt12Bytes);
  return out.toUint8Array();
}

function buildNameTable(meta: FontMetadata): Uint8Array {
  const family = (meta.familyName || 'Ndot Farsi').trim();
  const style = (meta.styleName || 'Regular').trim();
  const versionStr = `Version ${(meta.version || '1.000').replace(/^Version\s*/i, '')}`;
  const fullName = style === 'Regular' ? family : `${family} ${style}`;
  const psName = `${family}-${style}`.replace(/[^A-Za-z0-9-]/g, '').slice(0, 60) || 'NdotFarsi-Regular';
  const uniqueId = `${psName};${meta.version || '1.000'}`;
  const designer = meta.designer || 'Ndot Farsi Studio';
  const copyright = meta.copyright || `Copyright (c) 2026 ${designer}`;

  const strings: Array<[number, string]> = [
    [0, copyright],
    [1, family],
    [2, style],
    [3, uniqueId],
    [4, fullName],
    [5, versionStr],
    [6, psName],
    [9, designer],
  ];

  interface NameRec {
    platformID: number;
    encodingID: number;
    languageID: number;
    nameID: number;
    data: Uint8Array;
  }

  const recs: NameRec[] = [];

  // Platform 1 (MacRoman)
  for (const [id, str] of strings) {
    const bytes = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      bytes[i] = code < 128 ? code : 0x3f;
    }
    recs.push({ platformID: 1, encodingID: 0, languageID: 0, nameID: id, data: bytes });
  }

  // Platform 3 (Windows UTF-16BE)
  for (const [id, str] of strings) {
    const bytes = new Uint8Array(str.length * 2);
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      bytes[i * 2] = (code >>> 8) & 0xff;
      bytes[i * 2 + 1] = code & 0xff;
    }
    recs.push({ platformID: 3, encodingID: 1, languageID: 0x0409, nameID: id, data: bytes });
  }

  recs.sort(
    (a, b) =>
      a.platformID - b.platformID ||
      a.encodingID - b.encodingID ||
      a.languageID - b.languageID ||
      a.nameID - b.nameID
  );

  const storageOffset = 6 + recs.length * 12;
  const w = new BinWriter();
  w.u16(0); // format
  w.u16(recs.length);
  w.u16(storageOffset);

  let strOff = 0;
  for (const r of recs) {
    w.u16(r.platformID);
    w.u16(r.encodingID);
    w.u16(r.languageID);
    w.u16(r.nameID);
    w.u16(r.data.length);
    w.u16(strOff);
    strOff += r.data.length;
  }
  for (const r of recs) {
    w.bytes(r.data);
  }
  return w.toUint8Array();
}

function buildPostTable(glyphs: CompiledGlyph[]): Uint8Array {
  const w = new BinWriter();
  w.u32(0x00020000); // Version 2.0
  w.u32(0); // italicAngle
  w.i16(-100); // underlinePosition
  w.i16(50); // underlineThickness
  w.u32(0); // isFixedPitch
  w.u32(0).u32(0).u32(0).u32(0);

  w.u16(glyphs.length);
  const customNames: string[] = [];

  for (const g of glyphs) {
    if (g.psName === '.notdef') {
      w.u16(0);
    } else if (g.psName === 'space') {
      w.u16(3);
    } else {
      w.u16(258 + customNames.length);
      customNames.push(g.psName);
    }
  }

  for (const name of customNames) {
    const clean = name.slice(0, 63);
    w.u8(clean.length);
    for (let i = 0; i < clean.length; i++) w.u8(clean.charCodeAt(i) & 0x7f);
  }

  return w.toUint8Array();
}

// ============================================================================
// OpenType GSUB v1.0 Builder (arab / FAR + DFLT: isol, init, medi, fina, rlig, liga)
// ============================================================================
function buildCoverageFormat1(sortedGids: number[]): Uint8Array {
  const w = new BinWriter();
  w.u16(1); // coverageFormat = 1
  w.u16(sortedGids.length);
  for (const gid of sortedGids) w.u16(gid);
  return w.toUint8Array();
}

function buildSingleSubstLookup(pairs: Array<[number, number]>): Uint8Array {
  // Deduplicate & sort strictly ascending by input GID (required by HarfBuzz/OTS)
  const map = new Map<number, number>();
  for (const [inp, out] of pairs) map.set(inp, out);
  const sorted = Array.from(map.entries()).sort((a, b) => a[0] - b[0]);

  const sub = new BinWriter();
  const covOffset = 6 + sorted.length * 2;
  sub.u16(2); // SingleSubst Format 2
  sub.u16(covOffset);
  sub.u16(sorted.length);
  for (const [, outGid] of sorted) sub.u16(outGid);
  sub.bytes(buildCoverageFormat1(sorted.map(([inp]) => inp)));
  const subBytes = sub.toUint8Array();

  // Lookup Table header: lookupType=1, lookupFlag=0, subTableCount=1, subtableOffset=8
  const lookup = new BinWriter();
  lookup.u16(1); // LookupType 1: Single Substitution
  lookup.u16(0); // LookupFlag
  lookup.u16(1); // subTableCount
  lookup.u16(8); // subtableOffset[0]
  lookup.bytes(subBytes);
  return lookup.toUint8Array();
}

interface LigatureRule {
  firstGid: number;
  restGids: number[];
  targetGid: number;
}

function buildLigatureSubstLookup(rules: LigatureRule[]): Uint8Array {
  // Group rules by firstGid sorted strictly ascending
  const grouped = new Map<number, LigatureRule[]>();
  for (const rule of rules) {
    const arr = grouped.get(rule.firstGid) ?? [];
    arr.push(rule);
    grouped.set(rule.firstGid, arr);
  }
  const firstGids = Array.from(grouped.keys()).sort((a, b) => a - b);

  // Build each LigatureSet table
  const ligSetBuffers: Uint8Array[] = [];
  for (const fg of firstGids) {
    const ligs = grouped.get(fg)!;
    // Sort longer ligatures first (standard OpenType precedence)
    ligs.sort((a, b) => b.restGids.length - a.restGids.length);

    const ligBuffers = ligs.map((l) => {
      const lw = new BinWriter();
      lw.u16(l.targetGid);
      lw.u16(1 + l.restGids.length); // componentCount
      for (const cg of l.restGids) lw.u16(cg);
      return lw.toUint8Array();
    });

    const ls = new BinWriter();
    ls.u16(ligs.length);
    let offset = 2 + ligs.length * 2;
    for (const lb of ligBuffers) {
      ls.u16(offset);
      offset += lb.length;
    }
    for (const lb of ligBuffers) ls.bytes(lb);
    ligSetBuffers.push(ls.toUint8Array());
  }

  const covBytes = buildCoverageFormat1(firstGids);
  const sub = new BinWriter();
  const subHeaderSize = 6 + firstGids.length * 2;
  const covOffset = subHeaderSize;
  let ligSetOffset = covOffset + covBytes.length;

  sub.u16(1); // LigatureSubst Format 1
  sub.u16(covOffset);
  sub.u16(firstGids.length);
  for (const lsb of ligSetBuffers) {
    sub.u16(ligSetOffset);
    ligSetOffset += lsb.length;
  }
  sub.bytes(covBytes);
  for (const lsb of ligSetBuffers) sub.bytes(lsb);
  const subBytes = sub.toUint8Array();

  const lookup = new BinWriter();
  lookup.u16(4); // LookupType 4: Ligature Substitution
  lookup.u16(0); // LookupFlag
  lookup.u16(1); // subTableCount
  lookup.u16(8); // subtableOffset[0]
  lookup.bytes(subBytes);
  return lookup.toUint8Array();
}

function buildLangSys(featureIndices: number[]): Uint8Array {
  const w = new BinWriter();
  w.u16(0); // lookupOrder (reserved)
  w.u16(0xffff); // requiredFeatureIndex (none)
  w.u16(featureIndices.length);
  for (const fi of featureIndices) w.u16(fi);
  return w.toUint8Array();
}

function buildGsubTable(
  isolPairs: Array<[number, number]>,
  initPairs: Array<[number, number]>,
  mediPairs: Array<[number, number]>,
  finaPairs: Array<[number, number]>,
  ligRules: LigatureRule[]
): Uint8Array {
  // 1. LookupList: 0=isol, 1=init, 2=medi, 3=fina, 4=rlig/liga
  const lookups = [
    buildSingleSubstLookup(isolPairs),
    buildSingleSubstLookup(initPairs),
    buildSingleSubstLookup(mediPairs),
    buildSingleSubstLookup(finaPairs),
    buildLigatureSubstLookup(ligRules),
  ];

  const lookupList = new BinWriter();
  lookupList.u16(lookups.length);
  let lOff = 2 + lookups.length * 2;
  for (const lb of lookups) {
    lookupList.u16(lOff);
    lOff += lb.length;
  }
  for (const lb of lookups) lookupList.bytes(lb);
  const lookupListBytes = lookupList.toUint8Array();

  // 2. FeatureList (strictly sorted alphabetically by tag!)
  const featureDefs: Array<[string, number[]]> = [
    ['fina', [3]],
    ['init', [1]],
    ['isol', [0]],
    ['liga', [4]],
    ['medi', [2]],
    ['rlig', [4]],
  ];

  const featureTables = featureDefs.map(([, lIndices]) => {
    const fw = new BinWriter();
    fw.u16(0); // featureParamsOffset
    fw.u16(lIndices.length);
    for (const li of lIndices) fw.u16(li);
    return fw.toUint8Array();
  });

  const featureList = new BinWriter();
  featureList.u16(featureDefs.length);
  let fOff = 2 + featureDefs.length * 6;
  for (let i = 0; i < featureDefs.length; i++) {
    featureList.tag(featureDefs[i][0]);
    featureList.u16(fOff);
    fOff += featureTables[i].length;
  }
  for (const ft of featureTables) featureList.bytes(ft);
  const featureListBytes = featureList.toUint8Array();

  // 3. ScriptList (strictly sorted alphabetically: 'DFLT', 'arab')
  const allFeatureIndices = [0, 1, 2, 3, 4, 5];
  const langSysBytes = buildLangSys(allFeatureIndices);

  // DFLT script table: defaultLangSys only
  const dfltScript = new BinWriter();
  dfltScript.u16(4); // defaultLangSysOffset = 4
  dfltScript.u16(0); // langSysCount = 0
  dfltScript.bytes(langSysBytes);
  const dfltScriptBytes = dfltScript.toUint8Array();

  // arab script table: defaultLangSys + 'FAR ' (Farsi) LangSys
  const arabScript = new BinWriter();
  const arabHeaderSize = 4 + 1 * 6; // 10 bytes
  arabScript.u16(arabHeaderSize); // defaultLangSysOffset
  arabScript.u16(1); // langSysCount = 1 ('FAR ')
  arabScript.tag('FAR ');
  arabScript.u16(arabHeaderSize); // shares identical feature set
  arabScript.bytes(langSysBytes);
  const arabScriptBytes = arabScript.toUint8Array();

  const scriptList = new BinWriter();
  scriptList.u16(2); // scriptCount
  const sOff0 = 2 + 2 * 6; // 14
  const sOff1 = sOff0 + dfltScriptBytes.length;
  scriptList.tag('DFLT').u16(sOff0);
  scriptList.tag('arab').u16(sOff1);
  scriptList.bytes(dfltScriptBytes);
  scriptList.bytes(arabScriptBytes);
  const scriptListBytes = scriptList.toUint8Array();

  // 4. Assemble GSUB Header v1.0
  const gsub = new BinWriter();
  const scriptListOffset = 10;
  const featureListOffset = scriptListOffset + scriptListBytes.length;
  const lookupListOffset = featureListOffset + featureListBytes.length;

  gsub.u16(1); // majorVersion
  gsub.u16(0); // minorVersion
  gsub.u16(scriptListOffset);
  gsub.u16(featureListOffset);
  gsub.u16(lookupListOffset);

  gsub.bytes(scriptListBytes);
  gsub.bytes(featureListBytes);
  gsub.bytes(lookupListBytes);
  return gsub.toUint8Array();
}

// ============================================================================
// SFNT Checksum & Full TrueType (.TTF) Binary Compilation
// ============================================================================
function calcTableChecksum(data: Uint8Array): number {
  let sum = 0;
  const len = data.length;
  for (let i = 0; i < len; i += 4) {
    const b0 = data[i] ?? 0;
    const b1 = data[i + 1] ?? 0;
    const b2 = data[i + 2] ?? 0;
    const b3 = data[i + 3] ?? 0;
    const val = ((b0 << 24) | (b1 << 16) | (b2 << 8) | b3) >>> 0;
    sum = (sum + val) >>> 0;
  }
  return sum;
}

export interface CompiledFontResult {
  buffer: ArrayBuffer;
  bytes: Uint8Array;
  glyphCount: number;
  byteSize: number;
  compileTimeMs: number;
}

/**
 * Compiles the full Ndot Farsi parametric dot-matrix typeface into a standards-compliant,
 * OTS/HarfBuzz-validated TrueType (.ttf) binary complete with OpenType GSUB Arabic/Farsi shaping.
 */
export function compileNdotTtf(
  library: Record<string, GlyphData>,
  params: FontParams,
  metadata: FontMetadata
): CompiledFontResult {
  const t0 = performance.now();

  const unitsPerEm = 1000;
  const spec = RESOLUTION_SPECS[params.gridResolution];
  const basePitch = Math.round(unitsPerEm / spec.rows);
  const pitchX = Math.round(basePitch * params.dotSpacingX);
  const pitchY = Math.round(basePitch * params.dotSpacingY);

  // Baseline sits at bottom of spec.baselineRow (so row == baselineRow rests cleanly at y >= 0)
  const effectiveBaselineRow = spec.baselineRow + params.baselineOffset;
  const ascender = Math.round((spec.baselineRow + 1.5) * pitchY);
  const descender = -Math.round((spec.rows - spec.baselineRow) * pitchY);

  const compiledGlyphs: CompiledGlyph[] = [];
  const idToGid = new Map<string, number>();
  const unicodeToGid = new Map<number, number>();

  // GID 0: .notdef (minimal 4-corner dot frame)
  {
    const ndR = Math.max(8, Math.round(basePitch * 0.28));
    const ndContours = [
      createDotContour(120, 620, ndR, 'square'),
      createDotContour(420, 620, ndR, 'square'),
      createDotContour(120, 120, ndR, 'square'),
      createDotContour(420, 120, ndR, 'square'),
    ];
    const enc = encodeSimpleGlyph(ndContours);
    compiledGlyphs.push({
      gid: 0,
      psName: '.notdef',
      advanceWidth: 540,
      lsb: enc.xMin,
      xMin: enc.xMin,
      yMin: enc.yMin,
      xMax: enc.xMax,
      yMax: enc.yMax,
      numPoints: enc.numPoints,
      numContours: ndContours.length,
      glyfBytes: enc.bytes,
    });
  }

  // GID 1: space (U+0020, U+00A0)
  {
    const spaceAdv = Math.max(120, Math.round(params.wordSpacing * pitchX));
    compiledGlyphs.push({
      gid: 1,
      psName: 'space',
      advanceWidth: spaceAdv,
      lsb: 0,
      xMin: 0,
      yMin: 0,
      xMax: 0,
      yMax: 0,
      numPoints: 0,
      numContours: 0,
      glyfBytes: new Uint8Array(0),
    });
    unicodeToGid.set(0x0020, 1);
    unicodeToGid.set(0x00a0, 1);
  }

  // GID 2: ZWNJ (U+200C) — critical zero-width non-joiner for Persian words like می‌خواهم
  {
    compiledGlyphs.push({
      gid: 2,
      psName: 'uni200C',
      advanceWidth: 0,
      lsb: 0,
      xMin: 0,
      yMin: 0,
      xMax: 0,
      yMax: 0,
      numPoints: 0,
      numContours: 0,
      glyfBytes: new Uint8Array(0),
    });
    unicodeToGid.set(0x200c, 2);
  }

  // GID 3: ZWJ (U+200D) — zero-width joiner
  {
    compiledGlyphs.push({
      gid: 3,
      psName: 'uni200D',
      advanceWidth: 0,
      lsb: 0,
      xMin: 0,
      yMin: 0,
      xMax: 0,
      yMax: 0,
      numPoints: 0,
      numContours: 0,
      glyfBytes: new Uint8Array(0),
    });
    unicodeToGid.set(0x200d, 3);
  }

  // Compile all active glyphs from library
  const allGlyphs = Object.values(library).filter(
    (g) => params.includeLatin || g.category !== 'latin'
  );

  for (const glyph of allGlyphs) {
    const gid = compiledGlyphs.length;
    idToGid.set(glyph.id, gid);

    const { dots, totalAdvanceCols } = computeGlyphDots(glyph, params);
    const contours: ContourPoint[][] = [];

    // Use uniform base radius in font units scaled by average pitch
    const minPitch = Math.min(pitchX, pitchY);

    for (const dot of dots) {
      const fx = Math.round(dot.cx * pitchX);
      // Convert top-down grid cy to TrueType +Y up coordinates
      // Center of effectiveBaselineRow sits at y = 0.5 * pitchY
      const fy = Math.round((effectiveBaselineRow + 1 - dot.cy) * pitchY);
      const fr = Math.round(dot.radius * minPitch);
      contours.push(createDotContour(fx, fy, fr, dot.shape));
    }

    const enc = encodeSimpleGlyph(contours);
    const advWidth = Math.max(
      1,
      Math.round(totalAdvanceCols * pitchX)
    );

    compiledGlyphs.push({
      gid,
      psName: glyph.psName,
      advanceWidth: advWidth,
      lsb: enc.numPoints > 0 ? enc.xMin : 0,
      xMin: enc.xMin,
      yMin: enc.yMin,
      xMax: enc.xMax,
      yMax: enc.yMax,
      numPoints: enc.numPoints,
      numContours: contours.length,
      glyfBytes: enc.bytes,
    });

    if (glyph.unicode !== undefined) {
      unicodeToGid.set(glyph.unicode, gid);
    }
    if (glyph.altUnicodes) {
      for (const cp of glyph.altUnicodes) {
        if (!unicodeToGid.has(cp)) {
          unicodeToGid.set(cp, gid);
        }
      }
    }
  }

  // Build GSUB contextual lookup mappings (isol, init, medi, fina, rlig/liga)
  const isolPairs: Array<[number, number]> = [];
  const initPairs: Array<[number, number]> = [];
  const mediPairs: Array<[number, number]> = [];
  const finaPairs: Array<[number, number]> = [];

  // Map every base Unicode letter's nominal cmap GID -> its isol/init/medi/fina GIDs
  const baseByLetter = new Map<string, number>();
  for (const glyph of allGlyphs) {
    if (glyph.baseLetter && glyph.contextualForm === 'isol') {
      const gid = idToGid.get(glyph.id);
      if (gid !== undefined) baseByLetter.set(glyph.baseLetter, gid);
    }
  }

  for (const glyph of allGlyphs) {
    if (!glyph.baseLetter || !glyph.contextualForm) continue;
    const baseGid = baseByLetter.get(glyph.baseLetter);
    const formGid = idToGid.get(glyph.id);
    if (baseGid === undefined || formGid === undefined) continue;

    if (glyph.contextualForm === 'isol') isolPairs.push([baseGid, formGid]);
    else if (glyph.contextualForm === 'init') initPairs.push([baseGid, formGid]);
    else if (glyph.contextualForm === 'medi') mediPairs.push([baseGid, formGid]);
    else if (glyph.contextualForm === 'fina') finaPairs.push([baseGid, formGid]);
  }

  // Required Lam-Alef Ligatures (rlig & liga)
  const ligRules: LigatureRule[] = [];
  const lamInit = idToGid.get('lam.init');
  const lamMedi = idToGid.get('lam.medi');
  const alefFina = idToGid.get('alef.fina');
  const alefMaddaFina = idToGid.get('alef_madda.fina');
  const lamAlefIsol = idToGid.get('lam_alef.isol');
  const lamAlefFina = idToGid.get('lam_alef.fina');
  const lamAlefMaddaIsol = idToGid.get('lam_alef_madda.isol');
  const lamAlefMaddaFina = idToGid.get('lam_alef_madda.fina');

  if (lamInit !== undefined && alefFina !== undefined && lamAlefIsol !== undefined) {
    ligRules.push({ firstGid: lamInit, restGids: [alefFina], targetGid: lamAlefIsol });
  }
  if (lamMedi !== undefined && alefFina !== undefined && lamAlefFina !== undefined) {
    ligRules.push({ firstGid: lamMedi, restGids: [alefFina], targetGid: lamAlefFina });
  }
  if (lamInit !== undefined && alefMaddaFina !== undefined && lamAlefMaddaIsol !== undefined) {
    ligRules.push({ firstGid: lamInit, restGids: [alefMaddaFina], targetGid: lamAlefMaddaIsol });
  }
  if (lamMedi !== undefined && alefMaddaFina !== undefined && lamAlefMaddaFina !== undefined) {
    ligRules.push({ firstGid: lamMedi, restGids: [alefMaddaFina], targetGid: lamAlefMaddaFina });
  }

  // Aggregate global font metrics
  let fontXMin = 0;
  let fontYMin = 0;
  let fontXMax = 0;
  let fontYMax = 0;
  let maxPoints = 0;
  let maxContours = 0;
  let advanceWidthMax = 0;
  let minLsb = 0;
  let minRsb = 0;
  let xMaxExtent = 0;
  let advSum = 0;
  let nonEmptyCount = 0;

  for (const g of compiledGlyphs) {
    if (g.advanceWidth > advanceWidthMax) advanceWidthMax = g.advanceWidth;
    if (g.numPoints > maxPoints) maxPoints = g.numPoints;
    if (g.numContours > maxContours) maxContours = g.numContours;
    if (g.numPoints > 0) {
      if (nonEmptyCount === 0) {
        fontXMin = g.xMin;
        fontYMin = g.yMin;
        fontXMax = g.xMax;
        fontYMax = g.yMax;
        minLsb = g.lsb;
        minRsb = g.advanceWidth - g.xMax;
        xMaxExtent = g.xMax;
      } else {
        if (g.xMin < fontXMin) fontXMin = g.xMin;
        if (g.yMin < fontYMin) fontYMin = g.yMin;
        if (g.xMax > fontXMax) fontXMax = g.xMax;
        if (g.yMax > fontYMax) fontYMax = g.yMax;
        if (g.lsb < minLsb) minLsb = g.lsb;
        const rsb = g.advanceWidth - g.xMax;
        if (rsb < minRsb) minRsb = rsb;
        if (g.xMax > xMaxExtent) xMaxExtent = g.xMax;
      }
      advSum += g.advanceWidth;
      nonEmptyCount++;
    }
  }
  const avgCharWidth = nonEmptyCount > 0 ? Math.round(advSum / nonEmptyCount) : 500;

  // Build glyf & loca (Format 1: uint32 offsets)
  const glyfWriter = new BinWriter();
  const locaWriter = new BinWriter();
  for (const g of compiledGlyphs) {
    locaWriter.u32(glyfWriter.length);
    if (g.glyfBytes.length > 0) {
      glyfWriter.bytes(g.glyfBytes);
    }
  }
  locaWriter.u32(glyfWriter.length); // trailing sentinel
  const glyfBytes = glyfWriter.toUint8Array();
  const locaBytes = locaWriter.toUint8Array();

  // Build hmtx
  const hmtxWriter = new BinWriter();
  for (const g of compiledGlyphs) {
    hmtxWriter.u16(g.advanceWidth);
    hmtxWriter.i16(g.lsb);
  }
  const hmtxBytes = hmtxWriter.toUint8Array();

  // Build head (54 bytes; checkSumAdjustment patched after assembly)
  const headWriter = new BinWriter();
  headWriter.u32(0x00010000); // majorVersion 1, minorVersion 0
  headWriter.u32(0x00010000); // fontRevision 1.0
  headWriter.u32(0); // checkSumAdjustment (placeholder at offset 8)
  headWriter.u32(0x5f0f3cf5); // magicNumber
  headWriter.u16(0x000b); // flags (baseline y=0, lsb x=0, integer ppem)
  headWriter.u16(unitsPerEm);
  headWriter.i64Zero(); // created
  headWriter.i64Zero(); // modified
  headWriter.i16(fontXMin);
  headWriter.i16(fontYMin);
  headWriter.i16(fontXMax);
  headWriter.i16(fontYMax);
  headWriter.u16(0); // macStyle (Regular)
  headWriter.u16(8); // lowestRecPPEM
  headWriter.i16(2); // fontDirectionHint
  headWriter.i16(1); // indexToLocFormat = 1 (32-bit loca)
  headWriter.i16(0); // glyphDataFormat
  const headBytes = headWriter.toUint8Array();

  // Build hhea (36 bytes)
  const hheaWriter = new BinWriter();
  hheaWriter.u32(0x00010000);
  hheaWriter.i16(Math.max(ascender, fontYMax));
  hheaWriter.i16(Math.min(descender, fontYMin));
  hheaWriter.i16(Math.round(pitchY * 1.2)); // lineGap
  hheaWriter.u16(advanceWidthMax);
  hheaWriter.i16(minLsb);
  hheaWriter.i16(minRsb);
  hheaWriter.i16(xMaxExtent);
  hheaWriter.i16(1); // caretSlopeRise
  hheaWriter.i16(0); // caretSlopeRun
  hheaWriter.i16(0); // caretOffset
  hheaWriter.i16(0).i16(0).i16(0).i16(0); // reserved
  hheaWriter.i16(0); // metricDataFormat
  hheaWriter.u16(compiledGlyphs.length);
  const hheaBytes = hheaWriter.toUint8Array();

  // Build maxp (Version 1.0, 32 bytes)
  const maxpWriter = new BinWriter();
  maxpWriter.u32(0x00010000);
  maxpWriter.u16(compiledGlyphs.length);
  maxpWriter.u16(maxPoints);
  maxpWriter.u16(maxContours);
  maxpWriter.u16(0); // maxCompositePoints
  maxpWriter.u16(0); // maxCompositeContours
  maxpWriter.u16(2); // maxZones
  maxpWriter.u16(0); // maxTwilightPoints
  maxpWriter.u16(0); // maxStorage
  maxpWriter.u16(0); // maxFunctionDefs
  maxpWriter.u16(0); // maxInstructionDefs
  maxpWriter.u16(0); // maxStackElements
  maxpWriter.u16(0); // maxSizeOfInstructions
  maxpWriter.u16(0); // maxComponentElements
  maxpWriter.u16(0); // maxComponentDepth
  const maxpBytes = maxpWriter.toUint8Array();

  // Build OS/2 (Version 4, 96 bytes)
  const cps = Array.from(unicodeToGid.keys());
  const firstChar = Math.min(0xffff, ...cps);
  const lastChar = Math.min(0xffff, ...cps);
  const winAscent = Math.max(ascender, fontYMax);
  const winDescent = Math.abs(Math.min(descender, fontYMin));

  const os2Writer = new BinWriter();
  os2Writer.u16(4); // version 4
  os2Writer.i16(avgCharWidth);
  os2Writer.u16(400); // usWeightClass (Regular)
  os2Writer.u16(5); // usWidthClass (Medium)
  os2Writer.u16(0); // fsType (Installable embedding)
  os2Writer.i16(650).i16(600).i16(0).i16(75); // ySubscript
  os2Writer.i16(650).i16(600).i16(0).i16(350); // ySuperscript
  os2Writer.i16(50).i16(300); // yStrikeout
  os2Writer.i16(0); // sFamilyClass
  os2Writer.bytes([2, 0, 5, 0, 0, 0, 0, 0, 0, 0]); // panose (10 bytes)
  os2Writer.u32((1 << 0) | (1 << 13)); // ulUnicodeRange1: Basic Latin + Arabic
  os2Writer.u32((1 << 30) | (1 << 31)); // ulUnicodeRange2: Arabic Presentation Forms A & B
  os2Writer.u32(0).u32(0); // ulUnicodeRange3, 4
  os2Writer.tag('NDOT'); // achVendID
  os2Writer.u16(0x0040 | 0x0080); // fsSelection: REGULAR | USE_TYPO_METRICS
  os2Writer.u16(firstChar);
  os2Writer.u16(lastChar);
  os2Writer.i16(winAscent); // sTypoAscender
  os2Writer.i16(-winDescent); // sTypoDescender
  os2Writer.i16(Math.round(pitchY * 1.2)); // sTypoLineGap
  os2Writer.u16(winAscent); // usWinAscent
  os2Writer.u16(winDescent); // usWinDescent
  os2Writer.u32((1 << 0) | (1 << 6)); // ulCodePageRange1: Latin 1 + Arabic
  os2Writer.u32(0); // ulCodePageRange2
  os2Writer.i16(Math.round(pitchY * 5)); // sxHeight
  os2Writer.i16(Math.round(pitchY * 7)); // sCapHeight
  os2Writer.u16(0); // usDefaultChar
  os2Writer.u16(0x0020); // usBreakChar
  os2Writer.u16(2); // usMaxContext
  const os2Bytes = os2Writer.toUint8Array();

  const cmapBytes = buildCmapTable(unicodeToGid);
  const nameBytes = buildNameTable(metadata);
  const postBytes = buildPostTable(compiledGlyphs);
  const gsubBytes = buildGsubTable(isolPairs, initPairs, mediPairs, finaPairs, ligRules);

  // Assemble SFNT Table Directory sorted alphabetically by tag
  const tables: Array<{ tag: string; data: Uint8Array }> = [
    { tag: 'GSUB', data: gsubBytes },
    { tag: 'OS/2', data: os2Bytes },
    { tag: 'cmap', data: cmapBytes },
    { tag: 'glyf', data: glyfBytes },
    { tag: 'head', data: headBytes },
    { tag: 'hhea', data: hheaBytes },
    { tag: 'hmtx', data: hmtxBytes },
    { tag: 'loca', data: locaBytes },
    { tag: 'maxp', data: maxpBytes },
    { tag: 'name', data: nameBytes },
    { tag: 'post', data: postBytes },
  ].sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));

  const numTables = tables.length;
  const maxPow2 = Math.pow(2, Math.floor(Math.log2(numTables)));
  const searchRange = maxPow2 * 16;
  const entrySelector = Math.floor(Math.log2(maxPow2));
  const rangeShift = numTables * 16 - searchRange;

  const sfnt = new BinWriter();
  sfnt.u32(0x00010000); // TrueType sfntVersion
  sfnt.u16(numTables);
  sfnt.u16(searchRange);
  sfnt.u16(entrySelector);
  sfnt.u16(rangeShift);

  let dataOffset = 12 + numTables * 16;
  let headTableOffset = 0;

  for (const t of tables) {
    if (t.tag === 'head') headTableOffset = dataOffset;
    sfnt.tag(t.tag);
    sfnt.u32(calcTableChecksum(t.data));
    sfnt.u32(dataOffset);
    sfnt.u32(t.data.length);
    dataOffset += Math.ceil(t.data.length / 4) * 4;
  }

  for (const t of tables) {
    sfnt.bytes(t.data);
    sfnt.pad4();
  }

  const finalBytes = sfnt.toUint8Array();

  // Patch head.checkSumAdjustment = (0xB1B0AFBA - totalFontChecksum) >>> 0
  const totalSum = calcTableChecksum(finalBytes);
  const checkSumAdjustment = (0xb1b0afba - totalSum) >>> 0;
  const adjPos = headTableOffset + 8;
  finalBytes[adjPos] = (checkSumAdjustment >>> 24) & 0xff;
  finalBytes[adjPos + 1] = (checkSumAdjustment >>> 16) & 0xff;
  finalBytes[adjPos + 2] = (checkSumAdjustment >>> 8) & 0xff;
  finalBytes[adjPos + 3] = checkSumAdjustment & 0xff;

  const compileTimeMs = Math.round((performance.now() - t0) * 10) / 10;
  return {
    buffer: finalBytes.buffer.slice(0) as ArrayBuffer,
    bytes: finalBytes,
    glyphCount: compiledGlyphs.length,
    byteSize: finalBytes.length,
    compileTimeMs,
  };
}
