import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { FontParams, GlyphCategory, GlyphData } from '../types/font';
import { GlyphMiniSvg } from './DotSvgRenderer';

interface RightNavigatorProps {
  library: Record<string, GlyphData>;
  params: FontParams;
  selectedGlyphId: string;
  onSelectGlyph: (id: string) => void;
}

type FilterKey = 'all' | GlyphCategory;

const FILTER_TABS: Array<{ id: FilterKey; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'isol', label: 'Isol' },
  { id: 'init', label: 'Init' },
  { id: 'medi', label: 'Medi' },
  { id: 'fina', label: 'Fina' },
  { id: 'liga', label: 'Lig' },
  { id: 'num', label: 'Num' },
  { id: 'punct', label: 'Pnc' },
  { id: 'latin', label: 'Lat' },
];

export const RightNavigator: React.FC<RightNavigatorProps> = ({
  library,
  params,
  selectedGlyphId,
  onSelectGlyph,
}) => {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');

  const filteredGlyphs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.values(library).filter((g) => {
      if (!params.includeLatin && g.category === 'latin') return false;
      if (filter !== 'all' && g.category !== filter) return false;
      if (!q) return true;
      const hex =
        g.unicode !== undefined ? g.unicode.toString(16).toLowerCase() : '';
      return (
        g.name.toLowerCase().includes(q) ||
        g.char.includes(q) ||
        g.psName.toLowerCase().includes(q) ||
        hex.includes(q)
      );
    });
  }, [library, params.includeLatin, filter, query]);

  return (
    <aside className="w-full lg:w-[264px] shrink-0 bg-[#141417] border-l border-[#262626] flex flex-col h-full">
      {/* Header + Search */}
      <div className="p-3.5 border-b border-[#262626] space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold text-[#F5F5F5]">
            Glyph Navigator
          </span>
          <span className="font-mono-tech text-[11px] text-[#8E8E93]">
            {filteredGlyphs.length}
          </span>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-[#71717A] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter glyph or U+06A9..."
            className="w-full bg-[#0E0E10] border border-[#262626] focus:border-[#D71921] focus:outline-none pl-8 pr-2.5 py-1.5 text-xs text-[#F5F5F5] placeholder:text-[#52525B]"
          />
        </div>

        {/* Compact Category Filter Grid */}
        <div className="grid grid-cols-5 gap-1">
          {FILTER_TABS.map((tab) => {
            if (tab.id === 'latin' && !params.includeLatin) return null;
            const active = filter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`py-1 text-[10px] font-mono-tech whitespace-nowrap transition-colors border ${
                  active
                    ? 'bg-[#D71921] border-[#D71921] text-white font-medium'
                    : 'bg-[#0E0E10] border-[#262626] text-[#A1A1AA] hover:text-[#F5F5F5]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Scrollable Glyph List */}
      <div className="flex-1 overflow-y-auto ndot-scroll divide-y divide-[#1E1E22]">
        {filteredGlyphs.length === 0 ? (
          <div className="p-6 text-center text-xs text-[#71717A]">
            No glyphs match "{query}".
          </div>
        ) : (
          filteredGlyphs.map((g) => {
            const active = g.id === selectedGlyphId;
            const hex =
              g.unicode !== undefined
                ? `U+${g.unicode.toString(16).toUpperCase().padStart(4, '0')}`
                : g.contextualForm?.toUpperCase() ?? g.category.toUpperCase();

            return (
              <button
                key={g.id}
                type="button"
                onClick={() => onSelectGlyph(g.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2 text-left transition-colors ${
                  active
                    ? 'bg-[#1F1F24] text-[#F5F5F5]'
                    : 'hover:bg-[#19191D] text-[#D4D4D8]'
                }`}
              >
                <div
                  className={`w-9 h-9 flex items-center justify-center bg-[#0B0B0D] border shrink-0 ${
                    active ? 'border-[#D71921]' : 'border-[#262626]'
                  }`}
                >
                  <GlyphMiniSvg glyph={g} params={params} size={28} dotColor="#F5F5F5" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium truncate">
                      {g.name}
                    </span>
                    <span className="font-farsi-ref text-sm text-[#A1A1AA] shrink-0">
                      {g.char}
                    </span>
                  </div>
                  <div className="text-[10px] font-mono-tech text-[#71717A] flex items-center gap-1.5 mt-0.5">
                    <span>{hex}</span>
                    {g.isCustomized && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-[#D71921]">Edited</span>
                      </>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
};
