import React, { useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { FontParams, GlyphCategory, GlyphData } from '../types/font';
import { GlyphMiniSvg } from './DotSvgRenderer';

interface SpecimenViewProps {
  library: Record<string, GlyphData>;
  params: FontParams;
  selectedGlyphId: string;
  previewTheme: 'dark' | 'light';
  onChangePreviewTheme: (theme: 'dark' | 'light') => void;
  onSelectGlyphForEdit: (id: string) => void;
}

const GROUPS: Array<{ id: GlyphCategory; title: string; subtitle: string }> = [
  { id: 'isol', title: 'Isolated Forms', subtitle: '32 Persian letters · Base Unicode codepoints' },
  { id: 'init', title: 'Initial Forms', subtitle: 'OpenType GSUB init · Joins left' },
  { id: 'medi', title: 'Medial Forms', subtitle: 'OpenType GSUB medi · Dual-joining' },
  { id: 'fina', title: 'Final Forms', subtitle: 'OpenType GSUB fina · Joins right' },
  { id: 'liga', title: 'Ligatures & Kashida', subtitle: 'Required Lam-Alef (rlig) & Tatweel' },
  { id: 'num', title: 'Persian Numerals', subtitle: 'U+06F0–U+06F9 (۰–۹)' },
  { id: 'punct', title: 'Punctuation', subtitle: 'Persian & general typographic marks' },
  { id: 'latin', title: 'Latin & ASCII', subtitle: 'Bilingual Ndot A–Z, a–z, 0–9' },
];

export const SpecimenView: React.FC<SpecimenViewProps> = ({
  library,
  params,
  selectedGlyphId,
  previewTheme,
  onChangePreviewTheme,
  onSelectGlyphForEdit,
}) => {
  const [tileScale, setTileScale] = useState(52);
  const isLight = previewTheme === 'light';
  const dotColor = isLight ? '#111113' : '#F5F5F5';

  const glyphs = Object.values(library);

  return (
    <div className="flex flex-col h-full bg-[#0E0E10]">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 px-5 py-2.5 border-b border-[#262626] bg-[#141417]">
        <div className="text-xs text-[#8E8E93] font-mono-tech">
          Click any glyph to edit in Matrix Editor ·{' '}
          <span className="text-[#F5F5F5]">
            {glyphs.filter((g) => params.includeLatin || g.category !== 'latin').length} Active Glyphs
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5 w-40">
            <span className="text-xs text-[#8E8E93] whitespace-nowrap">Scale</span>
            <input
              type="range"
              className="ndot-slider"
              min={32}
              max={84}
              step={4}
              value={tileScale}
              onChange={(e) => setTileScale(Number(e.target.value))}
              aria-label="Specimen glyph scale"
            />
          </div>

          <div className="flex items-center bg-[#0E0E10] p-0.5 border border-[#262626]">
            <button
              type="button"
              onClick={() => onChangePreviewTheme('dark')}
              aria-label="Dark specimen surface"
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
              aria-label="Light specimen surface"
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

      {/* Grouped Character Grid */}
      <div
        className={`flex-1 overflow-y-auto ndot-scroll p-6 space-y-8 transition-colors duration-150 ${
          isLight ? 'bg-[#F4F4F1] text-[#111113]' : 'bg-[#0D0D0D] text-[#F5F5F5]'
        }`}
      >
        {GROUPS.map((group) => {
          if (group.id === 'latin' && !params.includeLatin) return null;
          const items = glyphs.filter((g) => g.category === group.id);
          if (items.length === 0) return null;

          return (
            <section key={group.id} className="space-y-3">
              <div
                className={`flex items-baseline justify-between pb-2 border-b ${
                  isLight ? 'border-[#D4D4CE]' : 'border-[#242428]'
                }`}
              >
                <h2 className="text-sm font-semibold">{group.title}</h2>
                <span
                  className={`text-[11px] font-mono-tech ${
                    isLight ? 'text-[#52525B]' : 'text-[#8E8E93]'
                  }`}
                >
                  {group.subtitle} · {items.length}
                </span>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 xl:grid-cols-8 gap-2">
                {items.map((g) => {
                  const active = g.id === selectedGlyphId;
                  const codeLabel =
                    g.unicode !== undefined
                      ? `U+${g.unicode.toString(16).toUpperCase().padStart(4, '0')}`
                      : g.contextualForm ?? g.category;

                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => onSelectGlyphForEdit(g.id)}
                      className={`group flex flex-col items-center justify-between p-2.5 border transition-colors text-center ${
                        active
                          ? 'border-[#D71921]'
                          : isLight
                            ? 'border-[#DCDCD6] hover:border-[#71717A] bg-white/70'
                            : 'border-[#222226] hover:border-[#52525B] bg-[#131316]'
                      }`}
                    >
                      <div className="w-full flex items-center justify-between text-[10px] font-mono-tech mb-1">
                        <span className={isLight ? 'text-[#71717A]' : 'text-[#71717A]'}>
                          {codeLabel}
                        </span>
                        <span className="font-farsi-ref text-xs opacity-70">{g.char}</span>
                      </div>

                      <div className="py-2 flex items-center justify-center min-h-[60px]">
                        <GlyphMiniSvg
                          glyph={g}
                          params={params}
                          size={tileScale}
                          dotColor={dotColor}
                        />
                      </div>

                      <div
                        className={`w-full text-[10px] truncate ${
                          isLight ? 'text-[#52525B]' : 'text-[#8E8E93]'
                        }`}
                      >
                        {g.name.replace(/\s*\([^)]*\)/, '')}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};
