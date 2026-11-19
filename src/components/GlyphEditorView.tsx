import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Copy,
  Eraser,
  Link2,
  Minus,
  Plus,
  Redo2,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Undo2,
} from 'lucide-react';
import {
  CellType,
  FontParams,
  GlyphData,
  hasCustomSkeletonGuide,
  RESOLUTION_SPECS,
  SkeletonGuideConfig,
} from '../types/font';
import {
  getContextualSampleWord,
  matchesJoiningNuqtaScope,
} from '../engine/shaper';
import { getLetterFamilyGlyphs } from '../engine/formSync';
import {
  ensureGuideImageLoaded,
  getCachedGuideImage,
  renderSkeletonSketchToCanvas,
} from '../engine/skeletonizer';
import { GlyphMiniSvg, SvgDotShape, VectorLineSvg } from './DotSvgRenderer';
import { SkeletonGuidePanel } from './SkeletonGuidePanel';

interface GlyphEditorViewProps {
  glyph: GlyphData;
  library: Record<string, GlyphData>;
  params: FontParams;
  liveFontFamily: string | null;
  syncLetterForms: boolean;
  showSkeletonGuide: boolean;
  skeletonFontFamily: string;
  skeletonFontLabel: string;
  skeletonThreshold: number;
  canUndo: boolean;
  canRedo: boolean;
  onToggleSyncLetterForms: () => void;
  onToggleSkeletonGuide: (show: boolean) => void;
  onUpdateSkeletonGuide: (patch: Partial<SkeletonGuideConfig>) => void;
  onResetSkeletonGuide: () => void;
  onErrorToast: (message: string) => void;
  onSelectGlyph: (id: string) => void;
  onUpdateGlyph: (updated: GlyphData) => void;
  onNudgeGlyph: (dr: number, dc: number) => void;
  onCloneShapeToAllForms: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onResetGlyph: () => void;
  onSkeletonizeGlyph: () => void;
}

export const GlyphEditorView: React.FC<GlyphEditorViewProps> = ({
  glyph,
  library,
  params,
  liveFontFamily,
  syncLetterForms,
  showSkeletonGuide,
  skeletonFontFamily,
  skeletonFontLabel,
  skeletonThreshold,
  canUndo,
  canRedo,
  onToggleSyncLetterForms,
  onToggleSkeletonGuide,
  onUpdateSkeletonGuide,
  onResetSkeletonGuide,
  onErrorToast,
  onSelectGlyph,
  onUpdateGlyph,
  onNudgeGlyph,
  onCloneShapeToAllForms,
  onUndo,
  onRedo,
  onResetGlyph,
  onSkeletonizeGlyph,
}) => {
  const [brushMode, setBrushMode] = useState<'stroke' | 'nuqta'>('stroke');
  const [paintValue, setPaintValue] = useState<CellType | null>(null);
  const [hoverCoord, setHoverCoord] = useState<{ r: number; c: number } | null>(null);
  const [guideSettingsOpen, setGuideSettingsOpen] = useState<boolean>(false);
  const [fontsReadyRev, setFontsReadyRev] = useState<number>(0);
  const [guideImageRev, setGuideImageRev] = useState<number>(0);
  const skeletonCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const spec = RESOLUTION_SPECS[params.gridResolution];
  const joinRow = Math.max(0, Math.min(glyph.rows - 1, spec.joinRow + params.joinRowOffset));
  const cellPixelSize = glyph.rows <= 9 ? 44 : glyph.rows <= 11 ? 38 : glyph.rows <= 13 ? 32 : 28;
  const hasGuideOverrides = hasCustomSkeletonGuide(glyph.skeletonGuide);
  const customImageUrl = glyph.skeletonGuide?.customImageDataUrl;

  // Refresh reference sketch once web fonts (e.g. Vazirmatn) finish loading
  useEffect(() => {
    let active = true;
    document.fonts?.ready.then(() => {
      if (active) setFontsReadyRev((n) => n + 1);
    });
    return () => {
      active = false;
    };
  }, [skeletonFontFamily]);

  // Decode per-glyph uploaded reference image asynchronously if not yet cached
  useEffect(() => {
    if (!customImageUrl) return;
    if (getCachedGuideImage(customImageUrl)) return;
    let active = true;
    ensureGuideImageLoaded(customImageUrl)
      .then(() => {
        if (active) setGuideImageRev((n) => n + 1);
      })
      .catch(() => {
        // Ignore broken data URL silently
      });
    return () => {
      active = false;
    };
  }, [customImageUrl]);

  // Render original or overridden skeleton sketch behind the matrix grid when enabled
  useEffect(() => {
    if (!showSkeletonGuide || !skeletonCanvasRef.current) return;
    const preloadedImg = customImageUrl ? getCachedGuideImage(customImageUrl) : null;
    renderSkeletonSketchToCanvas(
      skeletonCanvasRef.current,
      glyph,
      skeletonFontFamily,
      params.gridResolution,
      cellPixelSize,
      params.joinRowOffset,
      skeletonThreshold,
      preloadedImg
    );
  }, [
    showSkeletonGuide,
    glyph,
    skeletonFontFamily,
    params.gridResolution,
    cellPixelSize,
    params.joinRowOffset,
    skeletonThreshold,
    fontsReadyRev,
    guideImageRev,
    customImageUrl,
  ]);

  const applyCell = (r: number, c: number, val: CellType) => {
    if (r < 0 || r >= glyph.rows || c < 0 || c >= glyph.cols) return;
    if (glyph.cells[r][c] === val) return;

    const nextCells = glyph.cells.map((row, ri) =>
      ri === r ? row.map((cell, ci) => (ci === c ? val : cell)) : row
    );

    // Auto-expand advanceCols if user draws past current advance boundary
    const nextAdvance = val !== 0 && c + 1 > glyph.advanceCols ? c + 1 : glyph.advanceCols;

    onUpdateGlyph({
      ...glyph,
      cells: nextCells,
      advanceCols: nextAdvance,
      isCustomized: true,
    });
  };

  const handleCellPointerDown = (
    e: React.PointerEvent,
    r: number,
    c: number
  ) => {
    e.preventDefault();
    const isRightClick = e.button === 2;
    const targetType: CellType = isRightClick
      ? 2
      : brushMode === 'stroke'
        ? 1
        : 2;
    const current = glyph.cells[r][c];
    const nextVal: CellType = current === targetType ? 0 : targetType;
    setPaintValue(nextVal);
    applyCell(r, c, nextVal);
  };

  const handleCellPointerEnter = (r: number, c: number) => {
    setHoverCoord({ r, c });
    if (paintValue !== null) {
      applyCell(r, c, paintValue);
    }
  };

  const nudgeCells = (dr: number, dc: number) => {
    onNudgeGlyph(dr, dc);
  };

  const letterFamily = getLetterFamilyGlyphs(library, glyph);
  const hasMultipleForms = letterFamily.length > 1;

  const clearGlyph = () => {
    const empty: CellType[][] = Array.from({ length: glyph.rows }, () =>
      Array.from({ length: glyph.cols }, () => 0 as CellType)
    );
    onUpdateGlyph({
      ...glyph,
      cells: empty,
      isCustomized: true,
    });
  };

  const changeAdvance = (delta: number) => {
    const next = Math.max(1, Math.min(glyph.cols, glyph.advanceCols + delta));
    if (next !== glyph.advanceCols) {
      onUpdateGlyph({
        ...glyph,
        advanceCols: next,
        isCustomized: true,
      });
    }
  };

  const unicodeHex =
    glyph.unicode !== undefined
      ? `U+${glyph.unicode.toString(16).toUpperCase().padStart(4, '0')}`
      : glyph.psName;

  const joinSummary =
    glyph.joinsRight && glyph.joinsLeft
      ? 'Dual-Joining'
      : glyph.joinsRight
        ? 'Joins Right'
        : glyph.joinsLeft
          ? 'Joins Left'
          : 'Non-Joining';

  const contextSample = getContextualSampleWord(glyph);
  const contextSentence =
    glyph.baseLetter && glyph.contextualForm
      ? `${contextSample}   س${glyph.baseLetter}م   ت${glyph.baseLetter}ا`
      : `${glyph.char}  ${glyph.char}${glyph.char}`;

  return (
    <div
      className="flex flex-col h-full bg-[#0E0E10] select-none"
      onPointerUp={() => setPaintValue(null)}
      onPointerLeave={() => {
        setPaintValue(null);
        setHoverCoord(null);
      }}
    >
      {/* Top Glyph Info & Brush Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 border-b border-[#262626] bg-[#141417]">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 flex items-center justify-center bg-[#0E0E10] border border-[#262626] font-farsi-ref text-xl text-[#F5F5F5] shrink-0">
            {glyph.char}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-[#F5F5F5] truncate">
              {glyph.name}
            </div>
            <div className="text-[11px] font-mono-tech text-[#8E8E93] flex items-center gap-1.5">
              <span>{unicodeHex}</span>
              <span aria-hidden="true">·</span>
              <span>{joinSummary}</span>
              <span aria-hidden="true">·</span>
              <span>Adv {glyph.advanceCols}/{glyph.cols}</span>
            </div>
          </div>
        </div>

        {/* Skeleton Guide Toggle, Collapsible Settings Button & Brush Selector */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center">
            <label
              title={`Show original ${skeletonFontLabel} skeleton centerline behind the grid as a tracing guide`}
              className={`flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium border whitespace-nowrap cursor-pointer transition-colors ${
                showSkeletonGuide
                  ? 'bg-[#38BDF8]/10 border-[#38BDF8]/60 text-[#E0F2FE]'
                  : 'bg-[#0E0E10] border-[#262626] text-[#A1A1AA] hover:text-[#F5F5F5] hover:border-[#3F3F46]'
              }`}
            >
              <input
                type="checkbox"
                checked={showSkeletonGuide}
                onChange={(e) => onToggleSkeletonGuide(e.target.checked)}
                className="w-3.5 h-3.5 accent-[#38BDF8] cursor-pointer"
              />
              <span>Skeleton Guide</span>
            </label>

            <button
              type="button"
              aria-expanded={guideSettingsOpen}
              onClick={() => {
                const next = !guideSettingsOpen;
                setGuideSettingsOpen(next);
                if (next && !showSkeletonGuide) {
                  onToggleSkeletonGuide(true);
                }
              }}
              title="Resize, scale, reposition, or override this glyph's skeleton guide"
              className={`flex items-center gap-1 px-2 py-1.5 text-xs font-medium border-y border-r whitespace-nowrap transition-colors ${
                guideSettingsOpen
                  ? 'bg-[#1B1B1F] border-[#38BDF8]/60 text-[#E0F2FE]'
                  : hasGuideOverrides
                    ? 'bg-[#0E0E10] border-[#38BDF8]/40 text-[#7DD3FC] hover:bg-[#1B1B1F]'
                    : 'bg-[#0E0E10] border-[#262626] text-[#A1A1AA] hover:text-[#F5F5F5] hover:bg-[#1B1B1F]'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Settings</span>
              {guideSettingsOpen ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          <div className="flex items-center bg-[#0E0E10] p-0.5 border border-[#262626]">
            <button
              type="button"
              onClick={() => setBrushMode('stroke')}
              className={`px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                brushMode === 'stroke'
                  ? 'bg-[#26262A] text-[#F5F5F5]'
                  : 'text-[#8E8E93] hover:text-[#F5F5F5]'
              }`}
            >
              Stroke Dot
            </button>
            <button
              type="button"
              onClick={() => setBrushMode('nuqta')}
              className={`px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                brushMode === 'nuqta'
                  ? 'bg-[#D71921] text-white'
                  : 'text-[#8E8E93] hover:text-[#F5F5F5]'
              }`}
            >
              Nuqta Dot
            </button>
          </div>
        </div>
      </div>

      {/* Collapsible Per-Glyph Skeleton Guide Settings Panel */}
      {guideSettingsOpen && (
        <SkeletonGuidePanel
          glyph={glyph}
          skeletonFontLabel={skeletonFontLabel}
          onUpdateGuide={onUpdateSkeletonGuide}
          onResetGuide={onResetSkeletonGuide}
          onErrorToast={onErrorToast}
        />
      )}

      {/* Universal Letter-Form Sync & Sibling Strip (for multi-form Persian letters like ع) */}
      {hasMultipleForms && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-2 border-b border-[#262626] bg-[#101013]">
          <div className="flex items-center gap-2 overflow-x-auto ndot-scroll">
            <span className="text-[11px] font-mono-tech text-[#8E8E93] whitespace-nowrap shrink-0">
              Forms of <span className="font-farsi-ref text-xs text-[#F5F5F5]">{glyph.baseLetter}</span>
            </span>
            <div className="flex items-center gap-1.5">
              {letterFamily.map((sib) => {
                const isCurrent = sib.id === glyph.id;
                const formLabel =
                  sib.contextualForm === 'isol'
                    ? 'Isol'
                    : sib.contextualForm === 'init'
                      ? 'Init'
                      : sib.contextualForm === 'medi'
                        ? 'Medi'
                        : 'Fina';
                return (
                  <button
                    key={sib.id}
                    type="button"
                    onClick={() => onSelectGlyph(sib.id)}
                    title={`Switch to ${sib.name}`}
                    className={`flex items-center gap-2 px-2 py-1 border transition-colors whitespace-nowrap shrink-0 ${
                      isCurrent
                        ? 'border-[#D71921] bg-[#1C1C21] text-[#F5F5F5]'
                        : syncLetterForms
                          ? 'border-[#D71921]/40 bg-[#141417] text-[#D4D4D8] hover:border-[#D71921]'
                          : 'border-[#262626] bg-[#141417] text-[#A1A1AA] hover:border-[#3F3F46] hover:text-[#F5F5F5]'
                    }`}
                  >
                    <GlyphMiniSvg glyph={sib} params={params} size={18} dotColor="#F5F5F5" />
                    <span className="font-mono-tech text-[10px]">{formLabel}</span>
                    <span className="font-farsi-ref text-xs opacity-75">{sib.char}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              role="switch"
              aria-checked={syncLetterForms}
              onClick={onToggleSyncLetterForms}
              title="When enabled, edits to any form universally update all contextual forms of this letter"
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border whitespace-nowrap transition-colors ${
                syncLetterForms
                  ? 'bg-[#D71921] border-[#D71921] text-white'
                  : 'bg-[#18181C] border-[#2E2E33] text-[#D4D4D8] hover:border-[#52525B]'
              }`}
            >
              <Link2 className="w-3.5 h-3.5" />
              <span>Sync All Forms</span>
            </button>

            <button
              type="button"
              onClick={onCloneShapeToAllForms}
              title={`Copy this exact glyph matrix across all ${letterFamily.length} forms of ${glyph.baseLetter} with auto cursive joins`}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-[#A1A1AA] hover:text-[#F5F5F5] bg-[#141417] hover:bg-[#1E1E24] border border-[#262626] whitespace-nowrap transition-colors"
            >
              <Copy className="w-3 h-3" />
              <span>Copy to All</span>
            </button>
          </div>
        </div>
      )}

      {/* Edit Actions & Advance Width Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-2 border-b border-[#262626] bg-[#111114]">
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={!canUndo}
            onClick={onUndo}
            title="Undo"
            className="p-1.5 text-[#A1A1AA] hover:text-[#F5F5F5] hover:bg-[#1B1B1F] disabled:opacity-30 border border-transparent hover:border-[#262626] transition-colors"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={!canRedo}
            onClick={onRedo}
            title="Redo"
            className="p-1.5 text-[#A1A1AA] hover:text-[#F5F5F5] hover:bg-[#1B1B1F] disabled:opacity-30 border border-transparent hover:border-[#262626] transition-colors"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>

          <span className="w-px h-4 bg-[#262626] mx-1.5" aria-hidden="true" />

          <button
            type="button"
            onClick={() => nudgeCells(0, -1)}
            title="Shift Left"
            className="p-1.5 text-[#A1A1AA] hover:text-[#F5F5F5] hover:bg-[#1B1B1F] transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => nudgeCells(-1, 0)}
            title="Shift Up"
            className="p-1.5 text-[#A1A1AA] hover:text-[#F5F5F5] hover:bg-[#1B1B1F] transition-colors"
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => nudgeCells(1, 0)}
            title="Shift Down"
            className="p-1.5 text-[#A1A1AA] hover:text-[#F5F5F5] hover:bg-[#1B1B1F] transition-colors"
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => nudgeCells(0, 1)}
            title="Shift Right"
            className="p-1.5 text-[#A1A1AA] hover:text-[#F5F5F5] hover:bg-[#1B1B1F] transition-colors"
          >
            <ArrowRight className="w-3.5 h-3.5" />
          </button>

          <span className="w-px h-4 bg-[#262626] mx-1.5" aria-hidden="true" />

          <div className="flex items-center gap-1.5 text-xs text-[#A1A1AA]">
            <span>Width</span>
            <button
              type="button"
              onClick={() => changeAdvance(-1)}
              className="p-1 bg-[#1B1B1F] hover:bg-[#26262A] text-[#F5F5F5] border border-[#262626]"
              aria-label="Decrease advance width"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="font-mono-tech text-[#F5F5F5] w-5 text-center">
              {glyph.advanceCols}
            </span>
            <button
              type="button"
              onClick={() => changeAdvance(1)}
              className="p-1 bg-[#1B1B1F] hover:bg-[#26262A] text-[#F5F5F5] border border-[#262626]"
              aria-label="Increase advance width"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onSkeletonizeGlyph}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-[#F5F5F5] bg-[#1B1B1F] hover:bg-[#26262A] border border-[#2E2E33] whitespace-nowrap transition-colors"
          >
            <Sparkles className="w-3 h-3 text-[#D71921]" />
            <span>Skeletonize</span>
          </button>
          <button
            type="button"
            onClick={onResetGlyph}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-[#A1A1AA] hover:text-[#F5F5F5] border border-[#262626] hover:border-[#3F3F46] whitespace-nowrap transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset</span>
          </button>
          <button
            type="button"
            onClick={clearGlyph}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-[#A1A1AA] hover:text-[#F5F5F5] border border-[#262626] hover:border-[#3F3F46] whitespace-nowrap transition-colors"
          >
            <Eraser className="w-3 h-3" />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* Interactive Matrix Grid Canvas */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 overflow-auto ndot-scroll">
        <div className="relative">
          {/* Column Index Header */}
          <div className="flex ml-7 mb-1.5">
            {Array.from({ length: glyph.cols }, (_, c) => (
              <div
                key={c}
                style={{ width: cellPixelSize }}
                className={`text-center font-mono-tech text-[10px] ${
                  c < glyph.advanceCols ? 'text-[#8E8E93]' : 'text-[#3F3F46]'
                }`}
              >
                {c}
              </div>
            ))}
          </div>

          <div className="flex">
            {/* Row Index Gutter */}
            <div className="flex flex-col mr-2">
              {Array.from({ length: glyph.rows }, (_, r) => (
                <div
                  key={r}
                  style={{ height: cellPixelSize }}
                  className={`w-5 flex items-center justify-end font-mono-tech text-[10px] ${
                    r === joinRow ? 'text-[#D71921] font-semibold' : 'text-[#52525B]'
                  }`}
                >
                  {r}
                </div>
              ))}
            </div>

            {/* Clickable Matrix */}
            <div
              className="relative border border-[#2C2C31] bg-[#0B0B0D]"
              onContextMenu={(e) => e.preventDefault()}
            >
              {/* Original Skeleton Sketch Reference Overlay (behind grid & dots) */}
              {showSkeletonGuide && (
                <canvas
                  ref={skeletonCanvasRef}
                  aria-hidden="true"
                  style={{
                    width: glyph.cols * cellPixelSize,
                    height: glyph.rows * cellPixelSize,
                  }}
                  className="pointer-events-none absolute inset-0 z-0"
                />
              )}

              <div className="relative z-10">
                {glyph.cells.map((row, r) => (
                  <div key={r} className="flex">
                    {row.map((cell, c) => {
                      const outsideAdvance = c >= glyph.advanceCols;
                      const isJoinCell = r === joinRow;
                      const isJoinAnchor =
                        isJoinCell &&
                        ((glyph.joinsLeft && c === 0) ||
                          (glyph.joinsRight && c === glyph.advanceCols - 1));
                      const dotRadius = (cellPixelSize * params.dotDiameter) * 0.44;
                      const shape =
                        cell === 2 && params.nuqtaMode === 'diamond'
                          ? 'diamond'
                          : params.dotShape;

                      return (
                        <button
                          key={c}
                          type="button"
                          onPointerDown={(e) => handleCellPointerDown(e, r, c)}
                          onPointerEnter={() => handleCellPointerEnter(r, c)}
                          style={{
                            width: cellPixelSize,
                            height: cellPixelSize,
                          }}
                          className={`relative flex items-center justify-center border-r border-b border-[#1D1D22] transition-colors cursor-crosshair focus:outline-none ${
                            outsideAdvance
                              ? 'bg-[#08080A]/65 hover:bg-[#141418]/75'
                              : isJoinCell
                                ? 'bg-[#D71921]/[0.05] hover:bg-[#1C1C22]/70'
                                : 'hover:bg-[#17171C]/65'
                          }`}
                          aria-label={`Row ${r} Column ${c}`}
                        >
                          {/* Subtle center crosshair guide */}
                          {cell === 0 && (
                            <span
                              className={`w-1 h-1 rounded-full ${
                                isJoinAnchor ? 'bg-[#D71921]/70' : 'bg-[#26262C]'
                              }`}
                            />
                          )}

                          {cell !== 0 && (
                            <svg
                              width={cellPixelSize}
                              height={cellPixelSize}
                              viewBox={`0 0 ${cellPixelSize} ${cellPixelSize}`}
                              className="pointer-events-none"
                            >
                              <SvgDotShape
                                cx={cellPixelSize / 2}
                                cy={cellPixelSize / 2}
                                r={
                                  cell === 2
                                    ? Math.min(
                                        cellPixelSize * 0.46,
                                        dotRadius *
                                          (params.nuqtaMode !== 'uniform' ? params.nuqtaScale : 1) *
                                          (matchesJoiningNuqtaScope(
                                            glyph,
                                            params.joiningNuqtaScope ?? 'all'
                                          )
                                            ? (params.joiningNuqtaScale ?? 1)
                                            : 1)
                                      )
                                    : dotRadius
                                }
                                shape={shape}
                                fill={cell === 2 ? '#D71921' : '#F5F5F5'}
                              />
                            </svg>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>

              {/* Advance Width Right Boundary Hairline */}
              <div
                style={{ left: glyph.advanceCols * cellPixelSize }}
                className="pointer-events-none absolute top-0 bottom-0 z-20 w-px bg-[#52525B]"
              />
            </div>
          </div>

          {/* Footer Coordinate & Legend Readout */}
          <div className="mt-3 ml-7 flex items-center justify-between gap-4 text-[11px] font-mono-tech text-[#8E8E93]">
            <span>
              {hoverCoord
                ? `Col ${hoverCoord.c} · Row ${hoverCoord.r}${hoverCoord.r === joinRow ? ' (Cursive Join Row)' : ''}`
                : 'Left-click drag to paint · Right-click toggles Nuqta'}
            </span>
            <span className="flex items-center gap-3 shrink-0">
              {showSkeletonGuide && (
                <span
                  title={`Reference centerline from ${skeletonFontLabel}`}
                  className="flex items-center gap-1.5 text-[#7DD3FC]"
                >
                  <span className="inline-block w-2.5 h-0.5 bg-[#38BDF8]" />
                  Skeleton
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-[#F5F5F5]" />
                Stroke
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-[#D71921]" />
                Nuqta
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Live Contextual Join Preview Strip */}
      <div className="px-6 py-4 border-t border-[#262626] bg-[#141417]">
        <div className="flex items-center justify-between text-[11px] font-mono-tech text-[#8E8E93] mb-2.5">
          <span>Contextual Join Preview · Live Updates</span>
          <span>Row {joinRow} Aligned</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
          <div className="bg-[#0D0D0D] border border-[#262626] px-4 py-3 overflow-hidden">
            <div className="text-[10px] font-mono-tech text-[#71717A] mb-1">
              Vector Matrix
            </div>
            <VectorLineSvg
              text={contextSentence}
              library={library}
              params={params}
              fontSizePx={34}
              dotColor="#F5F5F5"
              showGuides={true}
              highlightNuqta={false}
            />
          </div>

          <div className="bg-[#0D0D0D] border border-[#262626] px-4 py-3 overflow-hidden">
            <div className="text-[10px] font-mono-tech text-[#71717A] mb-1">
              Compiled .TTF (HarfBuzz)
            </div>
            <div
              dir="rtl"
              lang="fa"
              style={{
                fontFamily: liveFontFamily
                  ? `"${liveFontFamily}", "Vazirmatn", sans-serif`
                  : '"Vazirmatn", sans-serif',
                fontSize: '34px',
                lineHeight: 1.5,
              }}
              className="text-right text-[#F5F5F5] whitespace-nowrap overflow-x-auto ndot-scroll"
            >
              {contextSentence}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
