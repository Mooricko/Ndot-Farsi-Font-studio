import React, { useRef } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ImagePlus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import {
  DEFAULT_SKELETON_GUIDE_CONFIG,
  GlyphData,
  hasCustomSkeletonGuide,
  resolveSkeletonGuideConfig,
  SkeletonGuideConfig,
  SkeletonGuideSourceForm,
} from '../types/font';
import {
  loadGuideImageDataUrlFromFile,
  parseCustomSkeletonInput,
} from '../engine/skeletonizer';

interface SkeletonGuidePanelProps {
  glyph: GlyphData;
  skeletonFontLabel: string;
  onUpdateGuide: (patch: Partial<SkeletonGuideConfig>) => void;
  onResetGuide: () => void;
  onErrorToast: (message: string) => void;
}

interface GuideSliderProps {
  label: string;
  value: number;
  defaultValue: number;
  min: number;
  max: number;
  step: number;
  displayValue: string;
  onChange: (value: number) => void;
}

const GuideSlider: React.FC<GuideSliderProps> = ({
  label,
  value,
  defaultValue,
  min,
  max,
  step,
  displayValue,
  onChange,
}) => (
  <div className="min-w-0">
    <div className="flex items-center justify-between gap-2 text-[11px] mb-1">
      <span className="text-[#A1A1AA] truncate">{label}</span>
      <span className="font-mono-tech tabular-nums text-[#E0F2FE] shrink-0">
        {displayValue}
      </span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      onDoubleClick={() => onChange(defaultValue)}
      title="Double-click to reset to default"
      className="w-full h-1 bg-[#26262A] accent-[#38BDF8] cursor-pointer appearance-none"
    />
  </div>
);

const FORM_OPTIONS: Array<{ id: SkeletonGuideSourceForm; label: string }> = [
  { id: 'auto', label: 'Auto' },
  { id: 'isol', label: 'Isol' },
  { id: 'init', label: 'Init' },
  { id: 'medi', label: 'Medi' },
  { id: 'fina', label: 'Fina' },
];

export const SkeletonGuidePanel: React.FC<SkeletonGuidePanelProps> = ({
  glyph,
  skeletonFontLabel,
  onUpdateGuide,
  onResetGuide,
  onErrorToast,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const guide = resolveSkeletonGuideConfig(glyph.skeletonGuide);
  const isModified = hasCustomSkeletonGuide(glyph.skeletonGuide);

  const trimmedCustom = guide.customChar.trim();
  const parsedCustom = parseCustomSkeletonInput(guide.customChar);
  const isIncompleteHex =
    trimmedCustom.length > 0 &&
    /^(?:U\+|0x)/i.test(trimmedCustom) &&
    parsedCustom === null;

  const nudgeOffset = (dx: number, dy: number) => {
    const nextX = Math.max(-4, Math.min(4, Number((guide.offsetX + dx).toFixed(2))));
    const nextY = Math.max(-4, Math.min(4, Number((guide.offsetY + dy).toFixed(2))));
    onUpdateGuide({ offsetX: nextX, offsetY: nextY });
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await loadGuideImageDataUrlFromFile(file);
      onUpdateGuide({ customImageDataUrl: dataUrl });
    } catch (err) {
      onErrorToast(err instanceof Error ? err.message : 'Failed to load reference image');
    }
  };

  const usingCustomImage = Boolean(guide.customImageDataUrl);
  const usingCustomChar = !usingCustomImage && Boolean(parsedCustom);

  return (
    <div className="px-5 py-3 border-b border-[#262626] bg-[#111114] space-y-3">
      {/* Row 1: Skeleton Source Override (Contextual Form, Custom Char/Unicode, Custom Image) + Nudge & Reset */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 min-w-0">
          {/* Form Override Segmented Selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-[#8E8E93] whitespace-nowrap">Form</span>
            <div className="flex items-center bg-[#0B0B0D] p-0.5 border border-[#262626]">
              {FORM_OPTIONS.map((opt) => {
                const active =
                  !usingCustomImage && !usingCustomChar && guide.sourceForm === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() =>
                      onUpdateGuide({
                        sourceForm: opt.id,
                        customChar: '',
                        customImageDataUrl: undefined,
                      })
                    }
                    className={`px-2 py-0.5 text-[11px] font-mono-tech whitespace-nowrap transition-colors ${
                      active
                        ? 'bg-[#38BDF8]/20 text-[#E0F2FE]'
                        : 'text-[#8E8E93] hover:text-[#F5F5F5]'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Character or Unicode Codepoint Input */}
          <div className="flex items-center gap-1.5">
            <label
              htmlFor="skeleton-custom-char"
              className="text-[11px] text-[#8E8E93] whitespace-nowrap"
            >
              Char / Unicode
            </label>
            <div className="relative flex items-center">
              <input
                id="skeleton-custom-char"
                type="text"
                value={guide.customChar}
                onChange={(e) =>
                  onUpdateGuide({
                    customChar: e.target.value,
                    customImageDataUrl: e.target.value.trim()
                      ? undefined
                      : guide.customImageDataUrl,
                  })
                }
                placeholder="ع or U+FECA"
                title="Type any replacement character(s) or Unicode hex (e.g. U+FECA, 0xFB8E) from the active base font"
                className={`w-32 px-2 py-1 pr-6 text-xs font-mono-tech bg-[#0B0B0D] border text-[#F5F5F5] placeholder-[#52525B] focus:outline-none ${
                  isIncompleteHex
                    ? 'border-[#FBBF24]/70'
                    : usingCustomChar
                      ? 'border-[#38BDF8]/60'
                      : 'border-[#262626] focus:border-[#38BDF8]/60'
                }`}
              />
              {guide.customChar && (
                <button
                  type="button"
                  onClick={() => onUpdateGuide({ customChar: '' })}
                  title="Clear custom character"
                  className="absolute right-1.5 text-[#71717A] hover:text-[#F5F5F5]"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            {usingCustomChar && parsedCustom && (
              <span
                className="font-farsi-ref text-sm text-[#7DD3FC] px-1"
                title={`Active override from ${skeletonFontLabel}`}
              >
                {parsedCustom}
              </span>
            )}
          </div>

          {/* Custom Reference Image Upload */}
          <div className="flex items-center gap-1.5">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelected}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Upload a custom PNG, JPG, SVG, or WebP reference sketch for this glyph"
              className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium border whitespace-nowrap transition-colors ${
                usingCustomImage
                  ? 'bg-[#38BDF8]/15 border-[#38BDF8]/60 text-[#E0F2FE]'
                  : 'bg-[#0B0B0D] border-[#262626] text-[#A1A1AA] hover:text-[#F5F5F5] hover:border-[#3F3F46]'
              }`}
            >
              <ImagePlus className="w-3.5 h-3.5" />
              <span>{usingCustomImage ? 'Replace Image' : 'Upload Sketch'}</span>
            </button>

            {usingCustomImage && (
              <>
                <label
                  title="Treat dark strokes on light backgrounds as foreground strokes (uncheck for white strokes on dark backgrounds)"
                  className="flex items-center gap-1.5 px-2 py-1 text-[11px] text-[#A1A1AA] bg-[#0B0B0D] border border-[#262626] whitespace-nowrap cursor-pointer hover:text-[#F5F5F5]"
                >
                  <input
                    type="checkbox"
                    checked={guide.invertImage}
                    onChange={(e) => onUpdateGuide({ invertImage: e.target.checked })}
                    className="w-3 h-3 accent-[#38BDF8] cursor-pointer"
                  />
                  <span>Dark Ink</span>
                </label>

                <button
                  type="button"
                  onClick={() => onUpdateGuide({ customImageDataUrl: undefined })}
                  title="Remove custom reference image"
                  className="p-1 text-[#A1A1AA] hover:text-[#FCA5A5] bg-[#0B0B0D] border border-[#262626] hover:border-[#D71921]/60 transition-colors"
                  aria-label="Remove reference image"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Precision 0.25-cell Nudge Pad + Per-Glyph Reset */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-0.5 bg-[#0B0B0D] p-0.5 border border-[#262626]">
            <button
              type="button"
              onClick={() => nudgeOffset(-0.25, 0)}
              title="Nudge guide left (0.25 cell)"
              className="p-1 text-[#A1A1AA] hover:text-[#7DD3FC] hover:bg-[#1B1B1F] transition-colors"
              aria-label="Nudge skeleton guide left"
            >
              <ArrowLeft className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => nudgeOffset(0, -0.25)}
              title="Nudge guide up (0.25 cell)"
              className="p-1 text-[#A1A1AA] hover:text-[#7DD3FC] hover:bg-[#1B1B1F] transition-colors"
              aria-label="Nudge skeleton guide up"
            >
              <ArrowUp className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => nudgeOffset(0, 0.25)}
              title="Nudge guide down (0.25 cell)"
              className="p-1 text-[#A1A1AA] hover:text-[#7DD3FC] hover:bg-[#1B1B1F] transition-colors"
              aria-label="Nudge skeleton guide down"
            >
              <ArrowDown className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => nudgeOffset(0.25, 0)}
              title="Nudge guide right (0.25 cell)"
              className="p-1 text-[#A1A1AA] hover:text-[#7DD3FC] hover:bg-[#1B1B1F] transition-colors"
              aria-label="Nudge skeleton guide right"
            >
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <button
            type="button"
            disabled={!isModified}
            onClick={onResetGuide}
            title="Reset all skeleton guide transforms and overrides for this glyph"
            className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] text-[#A1A1AA] hover:text-[#F5F5F5] disabled:opacity-35 bg-[#0B0B0D] border border-[#262626] hover:border-[#3F3F46] whitespace-nowrap transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset Guide</span>
          </button>
        </div>
      </div>

      {/* Row 2: Per-Glyph Transform Sliders (Double-Click to Reset) */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-x-4 gap-y-2.5 pt-2 border-t border-[#1E1E22]">
        <GuideSlider
          label="Scale"
          value={guide.scale}
          defaultValue={DEFAULT_SKELETON_GUIDE_CONFIG.scale}
          min={0.4}
          max={2.0}
          step={0.05}
          displayValue={`${Math.round(guide.scale * 100)}%`}
          onChange={(v) => onUpdateGuide({ scale: v })}
        />
        <GuideSlider
          label="Width X"
          value={guide.scaleX}
          defaultValue={DEFAULT_SKELETON_GUIDE_CONFIG.scaleX}
          min={0.5}
          max={1.8}
          step={0.05}
          displayValue={`${Math.round(guide.scaleX * 100)}%`}
          onChange={(v) => onUpdateGuide({ scaleX: v })}
        />
        <GuideSlider
          label="Height Y"
          value={guide.scaleY}
          defaultValue={DEFAULT_SKELETON_GUIDE_CONFIG.scaleY}
          min={0.5}
          max={1.8}
          step={0.05}
          displayValue={`${Math.round(guide.scaleY * 100)}%`}
          onChange={(v) => onUpdateGuide({ scaleY: v })}
        />
        <GuideSlider
          label="Offset X"
          value={guide.offsetX}
          defaultValue={DEFAULT_SKELETON_GUIDE_CONFIG.offsetX}
          min={-4.0}
          max={4.0}
          step={0.1}
          displayValue={`${guide.offsetX >= 0 ? '+' : ''}${guide.offsetX.toFixed(1)}c`}
          onChange={(v) => onUpdateGuide({ offsetX: v })}
        />
        <GuideSlider
          label="Offset Y"
          value={guide.offsetY}
          defaultValue={DEFAULT_SKELETON_GUIDE_CONFIG.offsetY}
          min={-4.0}
          max={4.0}
          step={0.1}
          displayValue={`${guide.offsetY >= 0 ? '+' : ''}${guide.offsetY.toFixed(1)}c`}
          onChange={(v) => onUpdateGuide({ offsetY: v })}
        />
        <GuideSlider
          label="Opacity"
          value={guide.opacity}
          defaultValue={DEFAULT_SKELETON_GUIDE_CONFIG.opacity}
          min={0.15}
          max={1.0}
          step={0.05}
          displayValue={`${Math.round(guide.opacity * 100)}%`}
          onChange={(v) => onUpdateGuide({ opacity: v })}
        />
      </div>
    </div>
  );
};
