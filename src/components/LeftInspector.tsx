import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BookmarkPlus,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  MoveVertical,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  DEFAULT_FONT_PARAMS,
  DotShape,
  FontMetadata,
  FontParams,
  FontPreset,
  GridResolution,
  JoiningNuqtaScope,
  NuqtaMode,
  RESOLUTION_SPECS,
} from '../types/font';

interface LeftInspectorProps {
  params: FontParams;
  metadata: FontMetadata;
  presets: FontPreset[];
  activePresetId: string | null;
  dottedJoiningCount: number;
  skeletonFontName: string;
  skeletonThreshold: number;
  isSkeletonizing: boolean;
  onSelectPreset: (preset: FontPreset) => void;
  onSavePreset: (name: string) => void;
  onDeletePreset: (id: string) => void;
  onBulkNudgeJoiningNuqtas: (dr: number, dc: number) => void;
  onBulkSeparateJoiningNuqtas: () => void;
  onResetJoiningNuqtas: () => void;
  onChangeParams: (patch: Partial<FontParams>) => void;
  onChangeResolution: (res: GridResolution) => void;
  onChangeMetadata: (patch: Partial<FontMetadata>) => void;
  onChangeThreshold: (val: number) => void;
  onUploadBaseFont: (file: File) => void;
  onSkeletonizeCurrent: () => void;
  onSkeletonizeAll: () => void;
  onRestoreMasters: () => void;
  onSaveProject: () => void;
  onLoadProject: (file: File) => void;
}

interface SectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

const InspectorSection: React.FC<SectionProps> = ({
  title,
  defaultOpen = true,
  children,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-[#262626]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left text-[13px] font-semibold text-[#F5F5F5] hover:bg-[#1B1B1F] transition-colors"
      >
        <span>{title}</span>
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-[#8E8E93]" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-[#8E8E93]" />
        )}
      </button>
      {open && <div className="px-4 pb-4 space-y-3.5">{children}</div>}
    </div>
  );
};

interface SliderRowProps {
  label: string;
  valueLabel: string;
  min: number;
  max: number;
  step: number;
  value: number;
  defaultValue: number;
  onChange: (val: number) => void;
}

const SliderRow: React.FC<SliderRowProps> = ({
  label,
  valueLabel,
  min,
  max,
  step,
  value,
  defaultValue,
  onChange,
}) => {
  const handleReset = () => onChange(defaultValue);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-[#A1A1AA] select-none">{label}</span>
        <span
          onDoubleClick={handleReset}
          title="Double-click to reset to default"
          className="font-mono-tech text-[#F5F5F5] text-[11px] select-none cursor-pointer"
        >
          {valueLabel}
        </span>
      </div>
      <input
        type="range"
        className="ndot-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        title="Double-click to reset to default"
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onDoubleClick={handleReset}
      />
    </div>
  );
};

const DOT_SHAPES: Array<{ id: DotShape; label: string }> = [
  { id: 'circle', label: 'Circle' },
  { id: 'rounded', label: 'Rounded' },
  { id: 'square', label: 'Square' },
  { id: 'diamond', label: 'Diamond' },
];

const NUQTA_MODES: Array<{ id: NuqtaMode; label: string }> = [
  { id: 'clearance_large', label: 'Clearance+' },
  { id: 'diamond', label: 'Diamond' },
  { id: 'cluster_2x2', label: '2×2 Cluster' },
  { id: 'uniform', label: 'Uniform' },
];

const RESOLUTIONS: GridResolution[] = ['7x9', '9x11', '11x13', '13x15'];

const JOINING_SCOPES: Array<{ id: JoiningNuqtaScope; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'init', label: 'Init' },
  { id: 'medi', label: 'Medi' },
  { id: 'fina', label: 'Fina' },
];

export const LeftInspector: React.FC<LeftInspectorProps> = ({
  params,
  metadata,
  presets,
  activePresetId,
  dottedJoiningCount,
  skeletonFontName,
  skeletonThreshold,
  isSkeletonizing,
  onSelectPreset,
  onSavePreset,
  onDeletePreset,
  onBulkNudgeJoiningNuqtas,
  onBulkSeparateJoiningNuqtas,
  onResetJoiningNuqtas,
  onChangeParams,
  onChangeResolution,
  onChangeMetadata,
  onChangeThreshold,
  onUploadBaseFont,
  onSkeletonizeCurrent,
  onSkeletonizeAll,
  onRestoreMasters,
  onSaveProject,
  onLoadProject,
}) => {
  const fontInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');

  useEffect(() => {
    if (!presetMenuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setPresetMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPresetMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [presetMenuOpen]);

  const activePreset = presets.find((p) => p.id === activePresetId) ?? null;
  const builtInPresets = presets.filter((p) => p.builtIn);
  const savedPresets = presets.filter((p) => !p.builtIn);

  const commitSavePreset = () => {
    const trimmed = newPresetName.trim();
    if (!trimmed) return;
    onSavePreset(trimmed);
    setNewPresetName('');
    setIsSavingPreset(false);
    setPresetMenuOpen(false);
  };

  return (
    <aside className="w-full lg:w-[310px] shrink-0 bg-[#141417] border-r border-[#262626] flex flex-col h-full overflow-y-auto ndot-scroll">
      {/* 0. Configuration Presets Dropdown */}
      <div className="px-4 py-3.5 border-b border-[#262626] bg-[#111114] space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold text-[#F5F5F5]">Presets</span>
          <button
            type="button"
            onClick={() => {
              setIsSavingPreset((v) => !v);
              setPresetMenuOpen(false);
            }}
            className={`flex items-center gap-1 text-[11px] font-medium whitespace-nowrap transition-colors ${
              isSavingPreset
                ? 'text-[#D71921]'
                : 'text-[#A1A1AA] hover:text-[#F5F5F5]'
            }`}
          >
            <BookmarkPlus className="w-3.5 h-3.5" />
            <span>Save Current</span>
          </button>
        </div>

        <div ref={dropdownRef} className="relative">
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={presetMenuOpen}
            onClick={() => setPresetMenuOpen((v) => !v)}
            className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 text-left bg-[#0E0E10] border transition-colors ${
              presetMenuOpen
                ? 'border-[#D71921]'
                : 'border-[#262626] hover:border-[#3F3F46]'
            }`}
          >
            <div className="min-w-0">
              <div className="text-xs font-medium text-[#F5F5F5] truncate">
                {activePreset ? activePreset.name : 'Custom Configuration'}
              </div>
              <div className="text-[10px] font-mono-tech text-[#8E8E93] truncate mt-0.5">
                {activePreset
                  ? activePreset.description
                  : `${RESOLUTION_SPECS[params.gridResolution].label} · ${params.dotShape} · ${Math.round(params.dotDiameter * 100)}%`}
              </div>
            </div>
            <ChevronDown
              className={`w-3.5 h-3.5 text-[#8E8E93] shrink-0 transition-transform duration-150 ${
                presetMenuOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {presetMenuOpen && (
            <div
              role="listbox"
              aria-label="Font configuration presets"
              className="absolute left-0 right-0 top-full mt-1 z-30 bg-[#141417] border border-[#323238] shadow-xl max-h-72 overflow-y-auto ndot-scroll"
            >
              <div className="px-2.5 py-1.5 text-[10px] font-mono-tech text-[#71717A] border-b border-[#222226] bg-[#101013]">
                Built-in Profiles
              </div>
              <div className="divide-y divide-[#1E1E22]">
                {builtInPresets.map((preset) => {
                  const selected = preset.id === activePresetId;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => {
                        onSelectPreset(preset);
                        setPresetMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 text-left transition-colors ${
                        selected
                          ? 'bg-[#1F1F24] text-[#F5F5F5]'
                          : 'hover:bg-[#1A1A1F] text-[#D4D4D8]'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-medium truncate">{preset.name}</div>
                        <div className="text-[10px] font-mono-tech text-[#8E8E93] truncate">
                          {preset.description}
                        </div>
                      </div>
                      {selected && <Check className="w-3.5 h-3.5 text-[#D71921] shrink-0" />}
                    </button>
                  );
                })}
              </div>

              {savedPresets.length > 0 && (
                <>
                  <div className="px-2.5 py-1.5 text-[10px] font-mono-tech text-[#71717A] border-y border-[#222226] bg-[#101013]">
                    Saved Profiles ({savedPresets.length})
                  </div>
                  <div className="divide-y divide-[#1E1E22]">
                    {savedPresets.map((preset) => {
                      const selected = preset.id === activePresetId;
                      return (
                        <div
                          key={preset.id}
                          className={`flex items-center justify-between gap-1 px-2.5 py-2 transition-colors ${
                            selected ? 'bg-[#1F1F24]' : 'hover:bg-[#1A1A1F]'
                          }`}
                        >
                          <button
                            type="button"
                            role="option"
                            aria-selected={selected}
                            onClick={() => {
                              onSelectPreset(preset);
                              setPresetMenuOpen(false);
                            }}
                            className="flex-1 min-w-0 text-left"
                          >
                            <div className="text-xs font-medium text-[#F5F5F5] truncate">
                              {preset.name}
                            </div>
                            <div className="text-[10px] font-mono-tech text-[#8E8E93] truncate">
                              {preset.description}
                            </div>
                          </button>
                          <div className="flex items-center gap-1 shrink-0">
                            {selected && <Check className="w-3.5 h-3.5 text-[#D71921]" />}
                            <button
                              type="button"
                              aria-label={`Delete preset ${preset.name}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeletePreset(preset.id);
                              }}
                              className="p-1 text-[#71717A] hover:text-[#D71921] transition-colors"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {isSavingPreset && (
          <div className="flex items-center gap-1.5 pt-0.5">
            <input
              type="text"
              autoFocus
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitSavePreset();
                if (e.key === 'Escape') {
                  setIsSavingPreset(false);
                  setNewPresetName('');
                }
              }}
              placeholder="Profile name..."
              className="flex-1 min-w-0 bg-[#0E0E10] border border-[#262626] focus:border-[#D71921] focus:outline-none px-2 py-1.5 text-xs text-[#F5F5F5] placeholder:text-[#52525B]"
            />
            <button
              type="button"
              disabled={!newPresetName.trim()}
              onClick={commitSavePreset}
              className="px-2.5 py-1.5 text-xs font-medium bg-[#D71921] hover:bg-[#B8141B] disabled:opacity-40 text-white whitespace-nowrap shrink-0 transition-colors"
            >
              Save
            </button>
          </div>
        )}
      </div>

      {/* 1. Dot Geometry */}
      <InspectorSection title="Dot Geometry" defaultOpen={true}>
        <SliderRow
          label="Dot Diameter"
          valueLabel={`${Math.round(params.dotDiameter * 100)}%`}
          min={0.2}
          max={0.95}
          step={0.01}
          value={params.dotDiameter}
          defaultValue={DEFAULT_FONT_PARAMS.dotDiameter}
          onChange={(v) => onChangeParams({ dotDiameter: v })}
        />
        <SliderRow
          label="Horizontal Pitch"
          valueLabel={`${Math.round(params.dotSpacingX * 100)}%`}
          min={0.75}
          max={1.45}
          step={0.02}
          value={params.dotSpacingX}
          defaultValue={DEFAULT_FONT_PARAMS.dotSpacingX}
          onChange={(v) => onChangeParams({ dotSpacingX: v })}
        />
        <SliderRow
          label="Vertical Pitch"
          valueLabel={`${Math.round(params.dotSpacingY * 100)}%`}
          min={0.75}
          max={1.45}
          step={0.02}
          value={params.dotSpacingY}
          defaultValue={DEFAULT_FONT_PARAMS.dotSpacingY}
          onChange={(v) => onChangeParams({ dotSpacingY: v })}
        />

        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#A1A1AA]">Grid Resolution</span>
            <span className="font-mono-tech text-[11px] text-[#8E8E93]">
              {RESOLUTION_SPECS[params.gridResolution].cols}×{RESOLUTION_SPECS[params.gridResolution].rows} em
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1 bg-[#0E0E10] p-1 border border-[#262626]">
            {RESOLUTIONS.map((res) => {
              const active = params.gridResolution === res;
              return (
                <button
                  key={res}
                  type="button"
                  onClick={() => onChangeResolution(res)}
                  className={`py-1.5 text-[11px] font-mono-tech whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-[#D71921] text-white font-medium'
                      : 'text-[#A1A1AA] hover:text-[#F5F5F5] hover:bg-[#1B1B1F]'
                  }`}
                >
                  {RESOLUTION_SPECS[res].label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5 pt-1">
          <span className="text-xs text-[#A1A1AA] block">Dot Contour Shape</span>
          <div className="grid grid-cols-2 gap-1 bg-[#0E0E10] p-1 border border-[#262626]">
            {DOT_SHAPES.map((s) => {
              const active = params.dotShape === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onChangeParams({ dotShape: s.id })}
                  className={`flex items-center justify-center gap-2 py-1.5 px-2 text-xs whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-[#26262A] text-[#F5F5F5] font-medium border border-[#3F3F46]'
                      : 'text-[#A1A1AA] hover:text-[#F5F5F5] border border-transparent'
                  }`}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                    {s.id === 'circle' && <circle cx="5" cy="5" r="4" fill="currentColor" />}
                    {s.id === 'rounded' && <rect x="1" y="1" width="8" height="8" rx="2.2" fill="currentColor" />}
                    {s.id === 'square' && <rect x="1" y="1" width="8" height="8" fill="currentColor" />}
                    {s.id === 'diamond' && <polygon points="5,0.5 9.5,5 5,9.5 0.5,5" fill="currentColor" />}
                  </svg>
                  <span>{s.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </InspectorSection>

      {/* 2. Nuqta (Persian Diacritic) Distinction */}
      <InspectorSection title="Nuqta Distinction" defaultOpen={true}>
        <div className="grid grid-cols-2 gap-1 bg-[#0E0E10] p-1 border border-[#262626]">
          {NUQTA_MODES.map((m) => {
            const active = params.nuqtaMode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onChangeParams({ nuqtaMode: m.id })}
                className={`py-1.5 px-2 text-xs whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-[#26262A] text-[#F5F5F5] font-medium border border-[#3F3F46]'
                    : 'text-[#A1A1AA] hover:text-[#F5F5F5] border border-transparent'
                }`}
              >
                {m.label}
              </button>
            );
          })}
        </div>

        {params.nuqtaMode !== 'uniform' && (
          <>
            <SliderRow
              label="Nuqta Scale"
              valueLabel={`${params.nuqtaScale.toFixed(2)}×`}
              min={0.8}
              max={1.6}
              step={0.02}
              value={params.nuqtaScale}
              defaultValue={DEFAULT_FONT_PARAMS.nuqtaScale}
              onChange={(v) => onChangeParams({ nuqtaScale: v })}
            />
            <SliderRow
              label="Vertical Clearance"
              valueLabel={`${params.nuqtaOffsetY >= 0 ? '+' : ''}${params.nuqtaOffsetY.toFixed(2)} cells`}
              min={-0.5}
              max={1.2}
              step={0.05}
              value={params.nuqtaOffsetY}
              defaultValue={DEFAULT_FONT_PARAMS.nuqtaOffsetY}
              onChange={(v) => onChangeParams({ nuqtaOffsetY: v })}
            />
          </>
        )}
      </InspectorSection>

      {/* 2B. Bulk Joining-Glyph Nuqta Operations */}
      <InspectorSection title="Bulk Joining Nuqtas" defaultOpen={true}>
        <div className="flex items-center justify-between text-[11px] font-mono-tech text-[#8E8E93]">
          <span>Target Scope</span>
          <span className="text-[#F5F5F5]">{dottedJoiningCount} dotted glyphs</span>
        </div>

        <div className="grid grid-cols-4 gap-1 bg-[#0E0E10] p-1 border border-[#262626]">
          {JOINING_SCOPES.map((s) => {
            const active = (params.joiningNuqtaScope ?? 'all') === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onChangeParams({ joiningNuqtaScope: s.id })}
                className={`py-1 text-[11px] font-mono-tech whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-[#D71921] text-white font-medium'
                    : 'text-[#A1A1AA] hover:text-[#F5F5F5] hover:bg-[#1B1B1F]'
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>

        <SliderRow
          label="Joining Nuqta Scale"
          valueLabel={`${(params.joiningNuqtaScale ?? 1).toFixed(2)}×`}
          min={0.7}
          max={1.5}
          step={0.02}
          value={params.joiningNuqtaScale ?? 1}
          defaultValue={DEFAULT_FONT_PARAMS.joiningNuqtaScale}
          onChange={(v) => onChangeParams({ joiningNuqtaScale: v })}
        />
        <SliderRow
          label="Extra Vertical Offset"
          valueLabel={`${(params.joiningNuqtaOffsetY ?? 0) >= 0 ? '+' : ''}${(params.joiningNuqtaOffsetY ?? 0).toFixed(2)} cells`}
          min={-1.0}
          max={1.5}
          step={0.05}
          value={params.joiningNuqtaOffsetY ?? 0}
          defaultValue={DEFAULT_FONT_PARAMS.joiningNuqtaOffsetY}
          onChange={(v) => onChangeParams({ joiningNuqtaOffsetY: v })}
        />
        <SliderRow
          label="Horizontal Offset"
          valueLabel={`${(params.joiningNuqtaOffsetX ?? 0) >= 0 ? '+' : ''}${(params.joiningNuqtaOffsetX ?? 0).toFixed(2)} cells`}
          min={-1.0}
          max={1.0}
          step={0.05}
          value={params.joiningNuqtaOffsetX ?? 0}
          defaultValue={DEFAULT_FONT_PARAMS.joiningNuqtaOffsetX}
          onChange={(v) => onChangeParams({ joiningNuqtaOffsetX: v })}
        />

        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#A1A1AA]">Batch Cell Reposition</span>
            <span className="font-mono-tech text-[10px] text-[#71717A]">1-cell step</span>
          </div>
          <div className="grid grid-cols-4 gap-1">
            <button
              type="button"
              onClick={() => onBulkNudgeJoiningNuqtas(0, -1)}
              title="Shift nuqtas left by 1 cell on joining glyphs"
              className="flex items-center justify-center py-1.5 bg-[#1B1B1F] hover:bg-[#26262A] text-[#F5F5F5] border border-[#2E2E33] transition-colors"
              aria-label="Shift joining nuqtas left"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onBulkNudgeJoiningNuqtas(-1, 0)}
              title="Shift nuqtas up by 1 cell on joining glyphs"
              className="flex items-center justify-center py-1.5 bg-[#1B1B1F] hover:bg-[#26262A] text-[#F5F5F5] border border-[#2E2E33] transition-colors"
              aria-label="Shift joining nuqtas up"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onBulkNudgeJoiningNuqtas(1, 0)}
              title="Shift nuqtas down by 1 cell on joining glyphs"
              className="flex items-center justify-center py-1.5 bg-[#1B1B1F] hover:bg-[#26262A] text-[#F5F5F5] border border-[#2E2E33] transition-colors"
              aria-label="Shift joining nuqtas down"
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onBulkNudgeJoiningNuqtas(0, 1)}
              title="Shift nuqtas right by 1 cell on joining glyphs"
              className="flex items-center justify-center py-1.5 bg-[#1B1B1F] hover:bg-[#26262A] text-[#F5F5F5] border border-[#2E2E33] transition-colors"
              aria-label="Shift joining nuqtas right"
            >
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5 pt-0.5">
          <button
            type="button"
            onClick={onBulkSeparateJoiningNuqtas}
            className="flex items-center justify-center gap-1.5 py-1.5 px-2 text-xs font-medium bg-[#1B1B1F] hover:bg-[#26262A] text-[#F5F5F5] border border-[#2E2E33] whitespace-nowrap transition-colors"
          >
            <MoveVertical className="w-3 h-3 text-[#D71921]" />
            <span>Auto-Clearance</span>
          </button>
          <button
            type="button"
            onClick={onResetJoiningNuqtas}
            className="flex items-center justify-center gap-1.5 py-1.5 px-2 text-xs text-[#A1A1AA] hover:text-[#F5F5F5] border border-[#262626] hover:border-[#3F3F46] whitespace-nowrap transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset Joining</span>
          </button>
        </div>
      </InspectorSection>

      {/* 3. Stroke, Baseline & Spacing */}
      <InspectorSection title="Baseline & Metrics" defaultOpen={true}>
        <SliderRow
          label="Baseline Height"
          valueLabel={`${params.baselineOffset >= 0 ? '+' : ''}${params.baselineOffset.toFixed(1)} rows`}
          min={-2}
          max={2}
          step={0.5}
          value={params.baselineOffset}
          defaultValue={DEFAULT_FONT_PARAMS.baselineOffset}
          onChange={(v) => onChangeParams({ baselineOffset: v })}
        />
        <SliderRow
          label="Cursive Join Row"
          valueLabel={`Row ${RESOLUTION_SPECS[params.gridResolution].joinRow + params.joinRowOffset}`}
          min={-1}
          max={1}
          step={1}
          value={params.joinRowOffset}
          defaultValue={DEFAULT_FONT_PARAMS.joinRowOffset}
          onChange={(v) => onChangeParams({ joinRowOffset: v })}
        />
        <SliderRow
          label="Tracking (Non-Joining)"
          valueLabel={`${params.tracking.toFixed(2)} cols`}
          min={-0.4}
          max={2.0}
          step={0.1}
          value={params.tracking}
          defaultValue={DEFAULT_FONT_PARAMS.tracking}
          onChange={(v) => onChangeParams({ tracking: v })}
        />
        <SliderRow
          label="Word Spacing"
          valueLabel={`${params.wordSpacing.toFixed(1)} cols`}
          min={2}
          max={7}
          step={0.5}
          value={params.wordSpacing}
          defaultValue={DEFAULT_FONT_PARAMS.wordSpacing}
          onChange={(v) => onChangeParams({ wordSpacing: v })}
        />

        <label className="flex items-center justify-between pt-1 cursor-pointer select-none">
          <span className="text-xs text-[#D4D4D8]">Include Latin (A–Z, a–z, 0–9)</span>
          <button
            type="button"
            role="switch"
            aria-checked={params.includeLatin}
            onClick={() => onChangeParams({ includeLatin: !params.includeLatin })}
            className={`relative w-9 h-5 transition-colors border ${
              params.includeLatin
                ? 'bg-[#D71921] border-[#D71921]'
                : 'bg-[#0E0E10] border-[#3F3F46]'
            }`}
          >
            <span
              className={`block w-3.5 h-3.5 bg-[#F5F5F5] transition-transform ${
                params.includeLatin ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </button>
        </label>
      </InspectorSection>

      {/* 4. Automated Skeletonizer (Approach A) */}
      <InspectorSection title="Centerline Skeletonizer" defaultOpen={false}>
        <div className="text-xs text-[#8E8E93] leading-relaxed">
          Source font:{' '}
          <span className="text-[#F5F5F5] font-mono-tech">{skeletonFontName}</span>
        </div>

        <input
          ref={fontInputRef}
          type="file"
          accept=".ttf,.otf,.woff,.woff2"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUploadBaseFont(f);
            e.target.value = '';
          }}
        />

        <button
          type="button"
          onClick={() => fontInputRef.current?.click()}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-medium bg-[#1B1B1F] hover:bg-[#26262A] text-[#F5F5F5] border border-[#2E2E33] transition-colors whitespace-nowrap"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>Upload Base Font (.TTF / .OTF)</span>
        </button>

        <SliderRow
          label="Raster Threshold"
          valueLabel={`${skeletonThreshold}`}
          min={40}
          max={180}
          step={4}
          value={skeletonThreshold}
          defaultValue={96}
          onChange={onChangeThreshold}
        />

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={isSkeletonizing}
            onClick={onSkeletonizeCurrent}
            className="py-2 px-2.5 text-xs font-medium bg-[#1B1B1F] hover:bg-[#26262A] disabled:opacity-50 text-[#F5F5F5] border border-[#2E2E33] transition-colors whitespace-nowrap"
          >
            Thin Selected
          </button>
          <button
            type="button"
            disabled={isSkeletonizing}
            onClick={onSkeletonizeAll}
            className="flex items-center justify-center gap-1.5 py-2 px-2.5 text-xs font-medium bg-[#26262A] hover:bg-[#323238] disabled:opacity-50 text-[#F5F5F5] border border-[#3F3F46] transition-colors whitespace-nowrap"
          >
            <Sparkles className="w-3 h-3 text-[#D71921]" />
            <span>{isSkeletonizing ? 'Thinning…' : 'Thin All'}</span>
          </button>
        </div>

        <button
          type="button"
          onClick={onRestoreMasters}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs text-[#A1A1AA] hover:text-[#F5F5F5] border border-transparent hover:border-[#262626] transition-colors whitespace-nowrap"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Restore Hand-Tuned Masters</span>
        </button>
      </InspectorSection>

      {/* 5. Font Metadata */}
      <InspectorSection title="Font Metadata" defaultOpen={false}>
        <div className="space-y-2.5">
          <label className="block space-y-1">
            <span className="text-[11px] text-[#8E8E93]">Family Name</span>
            <input
              type="text"
              value={metadata.familyName}
              onChange={(e) => onChangeMetadata({ familyName: e.target.value })}
              className="w-full bg-[#0E0E10] border border-[#262626] focus:border-[#D71921] focus:outline-none px-2.5 py-1.5 text-xs text-[#F5F5F5]"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1">
              <span className="text-[11px] text-[#8E8E93]">Style</span>
              <input
                type="text"
                value={metadata.styleName}
                onChange={(e) => onChangeMetadata({ styleName: e.target.value })}
                className="w-full bg-[#0E0E10] border border-[#262626] focus:border-[#D71921] focus:outline-none px-2.5 py-1.5 text-xs text-[#F5F5F5]"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] text-[#8E8E93]">Version</span>
              <input
                type="text"
                value={metadata.version}
                onChange={(e) => onChangeMetadata({ version: e.target.value })}
                className="w-full bg-[#0E0E10] border border-[#262626] focus:border-[#D71921] focus:outline-none px-2.5 py-1.5 text-xs font-mono-tech text-[#F5F5F5]"
              />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-[11px] text-[#8E8E93]">Designer</span>
            <input
              type="text"
              value={metadata.designer}
              onChange={(e) => onChangeMetadata({ designer: e.target.value })}
              className="w-full bg-[#0E0E10] border border-[#262626] focus:border-[#D71921] focus:outline-none px-2.5 py-1.5 text-xs text-[#F5F5F5]"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] text-[#8E8E93]">Copyright</span>
            <input
              type="text"
              value={metadata.copyright}
              onChange={(e) => onChangeMetadata({ copyright: e.target.value })}
              className="w-full bg-[#0E0E10] border border-[#262626] focus:border-[#D71921] focus:outline-none px-2.5 py-1.5 text-xs text-[#F5F5F5]"
            />
          </label>
        </div>
      </InspectorSection>

      {/* 6. Project JSON Save/Load */}
      <div className="p-4 mt-auto border-t border-[#262626] bg-[#111114] space-y-2">
        <div className="text-[11px] text-[#8E8E93]">Project Snapshot</div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onSaveProject}
            className="flex items-center justify-center gap-1.5 py-2 px-2.5 text-xs font-medium bg-[#1B1B1F] hover:bg-[#26262A] text-[#F5F5F5] border border-[#2E2E33] transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Save .JSON</span>
          </button>
          <button
            type="button"
            onClick={() => projectInputRef.current?.click()}
            className="flex items-center justify-center gap-1.5 py-2 px-2.5 text-xs font-medium bg-[#1B1B1F] hover:bg-[#26262A] text-[#F5F5F5] border border-[#2E2E33] transition-colors whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Load .JSON</span>
          </button>
        </div>
        <input
          ref={projectInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onLoadProject(f);
            e.target.value = '';
          }}
        />
      </div>
    </aside>
  );
};
