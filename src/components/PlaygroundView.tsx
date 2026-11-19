import React, { useRef, useState } from 'react';
import { Eye, Moon, Sun } from 'lucide-react';
import { FontParams, GlyphData } from '../types/font';
import { VectorLineSvg } from './DotSvgRenderer';

interface PlaygroundViewProps {
  library: Record<string, GlyphData>;
  params: FontParams;
  liveFontFamily: string | null;
  compileError: string | null;
  previewTheme: 'dark' | 'light';
  onChangePreviewTheme: (theme: 'dark' | 'light') => void;
}

const SAMPLE_PRESETS = [
  {
    id: 'nothing',
    label: 'Ndot Farsi',
    text: 'فونت فارسی اندات — تکنولوژی هیچ 1234567890',
  },
  {
    id: 'shaping',
    label: 'ZWNJ & Lam-Alef',
    text: 'سلام، می‌خواهم پژوهشگری کنم و طراحی حروف بسازم',
  },
  {
    id: 'persian4',
    label: 'گچ‌پژ & Numerals',
    text: 'گچ‌پژ در آینه روزگار ۰۱۲۳۴۵۶۷۸۹ — کلیدهای فارسی',
  },
  {
    id: 'bilingual',
    label: 'Bilingual',
    text: 'Nothing OS — طراحی ماتریسی فارسی ۱۴۰۵ / 2026',
  },
];

export const PlaygroundView: React.FC<PlaygroundViewProps> = ({
  library,
  params,
  liveFontFamily,
  compileError,
  previewTheme,
  onChangePreviewTheme,
}) => {
  const [text, setText] = useState(SAMPLE_PRESETS[0].text);
  const [fontSize, setFontSize] = useState(56);
  const [renderMode, setRenderMode] = useState<'ttf' | 'vector'>('ttf');
  const [showGuides, setShowGuides] = useState(true);
  const [highlightNuqta, setHighlightNuqta] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertZwnj = () => {
    const el = textareaRef.current;
    if (!el) {
      setText((prev) => prev + '\u200C');
      return;
    }
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const next = text.slice(0, start) + '\u200C' + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + 1, start + 1);
    });
  };

  const isLight = previewTheme === 'light';
  const canvasBg = isLight ? 'bg-[#F4F4F1] text-[#111113]' : 'bg-[#0D0D0D] text-[#F5F5F5]';
  const subtleBorder = isLight ? 'border-[#D4D4CE]' : 'border-[#222226]';
  const mutedText = isLight ? 'text-[#52525B]' : 'text-[#8E8E93]';
  const dotColor = isLight ? '#111113' : '#F5F5F5';

  const ttfFontStyle: React.CSSProperties = liveFontFamily
    ? { fontFamily: `"${liveFontFamily}", "Vazirmatn", sans-serif` }
    : { fontFamily: '"Vazirmatn", sans-serif' };

  return (
    <div className="flex flex-col h-full bg-[#0E0E10]">
      {/* Compact Workspace Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 border-b border-[#262626] bg-[#141417]">
        {/* Left: Render Mode Segmented Control */}
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-[#0E0E10] p-0.5 border border-[#262626]">
            <button
              type="button"
              onClick={() => setRenderMode('ttf')}
              className={`px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                renderMode === 'ttf'
                  ? 'bg-[#26262A] text-[#F5F5F5]'
                  : 'text-[#8E8E93] hover:text-[#F5F5F5]'
              }`}
            >
              Compiled .TTF
            </button>
            <button
              type="button"
              onClick={() => setRenderMode('vector')}
              className={`px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                renderMode === 'vector'
                  ? 'bg-[#26262A] text-[#F5F5F5]'
                  : 'text-[#8E8E93] hover:text-[#F5F5F5]'
              }`}
            >
              Vector Matrix
            </button>
          </div>

          {renderMode === 'vector' && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowGuides((v) => !v)}
                className={`px-2.5 py-1 text-xs border transition-colors whitespace-nowrap ${
                  showGuides
                    ? 'border-[#3F3F46] bg-[#1B1B1F] text-[#F5F5F5]'
                    : 'border-[#262626] text-[#8E8E93] hover:text-[#F5F5F5]'
                }`}
              >
                Join Guides
              </button>
              <button
                type="button"
                onClick={() => setHighlightNuqta((v) => !v)}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs border transition-colors whitespace-nowrap ${
                  highlightNuqta
                    ? 'border-[#D71921] bg-[#D71921]/15 text-[#F5F5F5]'
                    : 'border-[#262626] text-[#8E8E93] hover:text-[#F5F5F5]'
                }`}
              >
                <Eye className="w-3 h-3" />
                <span>Nuqta Tint</span>
              </button>
            </div>
          )}
        </div>

        {/* Right: Font Size + ZWNJ + Surface Theme */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5 w-44">
            <span className="text-xs text-[#8E8E93] whitespace-nowrap">Size</span>
            <input
              type="range"
              className="ndot-slider"
              min={12}
              max={120}
              step={2}
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              aria-label="Preview font size"
            />
            <span className="font-mono-tech text-[11px] text-[#F5F5F5] w-10 text-right shrink-0">
              {fontSize}px
            </span>
          </div>

          <button
            type="button"
            onClick={insertZwnj}
            title="Insert Zero-Width Non-Joiner (U+200C) at cursor"
            className="px-2.5 py-1 text-xs font-mono-tech bg-[#1B1B1F] hover:bg-[#26262A] text-[#F5F5F5] border border-[#2E2E33] whitespace-nowrap shrink-0 transition-colors"
          >
            + ZWNJ
          </button>

          <div className="flex items-center bg-[#0E0E10] p-0.5 border border-[#262626]">
            <button
              type="button"
              onClick={() => onChangePreviewTheme('dark')}
              aria-label="Dark preview surface"
              className={`p-1.5 transition-colors ${
                !isLight
                  ? 'bg-[#26262A] text-[#F5F5F5]'
                  : 'text-[#8E8E93] hover:text-[#F5F5F5]'
              }`}
            >
              <Moon className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onChangePreviewTheme('light')}
              aria-label="Light preview surface"
              className={`p-1.5 transition-colors ${
                isLight
                  ? 'bg-[#26262A] text-[#F5F5F5]'
                  : 'text-[#8E8E93] hover:text-[#F5F5F5]'
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Quick Test Phrases */}
      <div className="flex items-center gap-2 px-5 py-2 border-b border-[#262626] bg-[#111114] overflow-x-auto ndot-scroll">
        <span className="text-[11px] text-[#8E8E93] whitespace-nowrap shrink-0 mr-1">
          Test Phrases
        </span>
        {SAMPLE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => setText(preset.text)}
            className={`px-2.5 py-1 text-xs whitespace-nowrap shrink-0 transition-colors border ${
              text === preset.text
                ? 'border-[#D71921] text-[#F5F5F5] bg-[#1B1B1F]'
                : 'border-[#262626] text-[#A1A1AA] hover:text-[#F5F5F5] hover:border-[#3F3F46]'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Main Live Preview & Interactive RTL Editor */}
      <div className={`flex-1 overflow-y-auto ndot-scroll transition-colors duration-150 ${canvasBg}`}>
        {compileError && renderMode === 'ttf' && (
          <div className="mx-6 mt-4 px-4 py-2.5 text-xs bg-[#D71921]/15 border border-[#D71921]/50 text-[#F5F5F5]">
            Font compilation error: {compileError}
          </div>
        )}

        {/* Primary Editable Stage */}
        <div className={`px-8 py-8 border-b ${subtleBorder}`}>
          <div className={`flex items-center justify-between text-[11px] font-mono-tech mb-4 ${mutedText}`}>
            <span>
              {renderMode === 'ttf'
                ? 'Live Compiled .TTF · Browser HarfBuzz OpenType GSUB Shaping'
                : 'Direct Vector Matrix · Parametric SVG Preview'}
            </span>
            <span>RTL · Unicode Farsi + ZWNJ</span>
          </div>

          {renderMode === 'ttf' ? (
            <textarea
              ref={textareaRef}
              dir="rtl"
              lang="fa"
              rows={3}
              spellCheck={false}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="متن فارسی یا انگلیسی خود را اینجا تایپ کنید..."
              style={{
                ...ttfFontStyle,
                fontSize: `${fontSize}px`,
                lineHeight: 1.55,
              }}
              className={`w-full resize-y bg-transparent focus:outline-none text-right ${
                isLight ? 'placeholder:text-[#A1A1AA]' : 'placeholder:text-[#3F3F46]'
              }`}
            />
          ) : (
            <div className="space-y-6">
              <VectorLineSvg
                text={text || 'فونت فارسی اندات'}
                library={library}
                params={params}
                fontSizePx={fontSize}
                dotColor={dotColor}
                showGuides={showGuides}
                highlightNuqta={highlightNuqta}
              />
              <textarea
                ref={textareaRef}
                dir="rtl"
                lang="fa"
                rows={2}
                spellCheck={false}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="متن فارسی یا انگلیسی خود را اینجا تایپ کنید..."
                className={`w-full font-farsi-ref text-sm p-3 border focus:outline-none focus:border-[#D71921] text-right ${
                  isLight
                    ? 'bg-white border-[#D4D4CE] text-[#111113]'
                    : 'bg-[#141417] border-[#262626] text-[#F5F5F5]'
                }`}
              />
            </div>
          )}
        </div>

        {/* Multi-Scale Legibility Waterfall */}
        <div className="px-8 py-7 space-y-6">
          <div className={`text-[11px] font-mono-tech ${mutedText}`}>
            Optical Scale Verification · Real-Time Compiled TrueType
          </div>

          {[
            { size: 40, sample: 'تکنولوژی هیچ — سلام دنیا، می‌خواهم بنویسم' },
            { size: 28, sample: 'پژوهشگر گچ‌پژ · اعداد فارسی: ۰۱۲۳۴۵۶۷۸۹ · ASCII: 0123456789' },
            { size: 18, sample: 'حروف فارسی متصل و منفصل: ا ب پ ت ث ج چ ح خ د ذ ر ز ژ س ش ص ض ط ظ ع غ ف ق ک گ ل م ن و ه ی' },
          ].map((row) => (
            <div
              key={row.size}
              className={`pb-5 border-b last:border-b-0 ${subtleBorder} flex flex-col gap-2`}
            >
              <div className={`text-[11px] font-mono-tech ${mutedText}`}>
                {row.size}px
              </div>
              {renderMode === 'ttf' ? (
                <div
                  dir="rtl"
                  lang="fa"
                  style={{
                    ...ttfFontStyle,
                    fontSize: `${row.size}px`,
                    lineHeight: 1.65,
                  }}
                  className="text-right break-words"
                >
                  {row.sample}
                </div>
              ) : (
                <VectorLineSvg
                  text={row.sample}
                  library={library}
                  params={params}
                  fontSizePx={row.size}
                  dotColor={dotColor}
                  showGuides={false}
                  highlightNuqta={highlightNuqta}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
