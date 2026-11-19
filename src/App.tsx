import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import {
  BUILT_IN_PRESETS,
  CellType,
  DEFAULT_FONT_METADATA,
  DEFAULT_FONT_PARAMS,
  FontMetadata,
  FontParams,
  FontPreset,
  GlyphData,
  GridResolution,
  ProjectFileV1,
  RESOLUTION_SPECS,
  WorkspaceTab,
} from './types/font';
import { createDefaultGlyphLibrary } from './data/persianMasters';
import {
  loadCustomBaseFont,
  resampleGlyphToResolution,
  skeletonizeGlyphFromFont,
} from './engine/skeletonizer';
import {
  bulkNudgeJoiningNuqtas,
  bulkSeparateJoiningNuqtas,
  countDottedJoiningGlyphs,
  matchesJoiningNuqtaScope,
} from './engine/shaper';
import {
  buildCloneShapeToFamilyPatch,
  buildSyncedFamilyPatch,
  buildSyncedNudgePatch,
  getLetterFamilyGlyphs,
} from './engine/formSync';
import { compileNdotTtf } from './engine/ttfCompiler';
import { LeftInspector } from './components/LeftInspector';
import { PlaygroundView } from './components/PlaygroundView';
import { GlyphEditorView } from './components/GlyphEditorView';
import { SpecimenView } from './components/SpecimenView';
import { RightNavigator } from './components/RightNavigator';

interface ToastState {
  message: string;
  isError?: boolean;
}

export default function App() {
  const [library, setLibrary] = useState<Record<string, GlyphData>>(() =>
    createDefaultGlyphLibrary()
  );
  const [params, setParams] = useState<FontParams>(DEFAULT_FONT_PARAMS);
  const [metadata, setMetadata] = useState<FontMetadata>(DEFAULT_FONT_METADATA);
  const [activePresetId, setActivePresetId] = useState<string | null>(BUILT_IN_PRESETS[0].id);
  const [customPresets, setCustomPresets] = useState<FontPreset[]>(() => {
    try {
      const raw = window.localStorage.getItem('ndot-farsi-presets-v1');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('playground');
  const [selectedGlyphId, setSelectedGlyphId] = useState<string>('beh.isol');
  const [previewTheme, setPreviewTheme] = useState<'dark' | 'light'>('dark');
  const [syncLetterForms, setSyncLetterForms] = useState<boolean>(false);
  const [showSkeletonGuide, setShowSkeletonGuide] = useState<boolean>(false);

  // Automated skeletonizer state
  const [skeletonFontFamily, setSkeletonFontFamily] = useState<string>('Vazirmatn');
  const [skeletonFontLabel, setSkeletonFontLabel] = useState<string>('Vazirmatn (Built-in)');
  const [skeletonThreshold, setSkeletonThreshold] = useState<number>(96);
  const [isSkeletonizing, setIsSkeletonizing] = useState<boolean>(false);

  // Live compiled TrueType FontFace state
  const [liveFontFamily, setLiveFontFamily] = useState<string | null>(null);
  const [compileError, setCompileError] = useState<string | null>(null);
  const activeFontFaceRef = useRef<FontFace | null>(null);
  const compileRevRef = useRef<number>(0);

  // Atomic multi-glyph undo/redo stacks (supports single-glyph and universal letter-form edits)
  const [undoStack, setUndoStack] = useState<Array<Record<string, GlyphData>>>([]);
  const [redoStack, setRedoStack] = useState<Array<Record<string, GlyphData>>>([]);

  // Toast feedback
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((message: string, isError = false) => {
    setToast({ message, isError });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3600);
  }, []);

  // Debounced live .ttf compilation + browser FontFace hot-swap
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const compiled = compileNdotTtf(library, params, metadata);
        const rev = ++compileRevRef.current;
        const familyName = `NdotFarsiLive_${rev}`;
        const face = new FontFace(familyName, compiled.buffer);
        const loaded = await face.load();

        if (cancelled) return;

        document.fonts.add(loaded);
        if (activeFontFaceRef.current) {
          document.fonts.delete(activeFontFaceRef.current);
        }
        activeFontFaceRef.current = loaded;
        setLiveFontFamily(familyName);
        setCompileError(null);
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          setCompileError(msg);
        }
      }
    }, 90);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [library, params, metadata]);

  // Cleanup active FontFace on unmount
  useEffect(() => {
    return () => {
      if (activeFontFaceRef.current) {
        document.fonts.delete(activeFontFaceRef.current);
      }
    };
  }, []);

  const commitLibraryPatch = useCallback(
    (patch: Record<string, GlyphData>) => {
      const ids = Object.keys(patch);
      if (ids.length === 0) return;

      const beforeSnapshot: Record<string, GlyphData> = {};
      for (const id of ids) {
        if (library[id]) beforeSnapshot[id] = library[id];
      }
      if (Object.keys(beforeSnapshot).length > 0) {
        setUndoStack((prev) => [...prev.slice(-49), beforeSnapshot]);
        setRedoStack([]);
      }
      setLibrary((prev) => ({ ...prev, ...patch }));
    },
    [library]
  );

  // Update glyph (and universally sync all sibling forms when syncLetterForms is enabled)
  const handleUpdateGlyph = useCallback(
    (updated: GlyphData) => {
      const existing = library[updated.id];
      if (!existing) return;

      if (syncLetterForms && existing.baseLetter) {
        const spec = RESOLUTION_SPECS[params.gridResolution];
        const joinRow = spec.joinRow + params.joinRowOffset;
        const patch = buildSyncedFamilyPatch(library, existing, updated, joinRow);
        commitLibraryPatch(patch);
      } else {
        commitLibraryPatch({ [updated.id]: updated });
      }
    },
    [library, syncLetterForms, params.gridResolution, params.joinRowOffset, commitLibraryPatch]
  );

  const handleNudgeGlyph = useCallback(
    (dr: number, dc: number) => {
      const current = library[selectedGlyphId];
      if (!current) return;

      if (syncLetterForms && current.baseLetter) {
        const patch = buildSyncedNudgePatch(library, current, dr, dc);
        commitLibraryPatch(patch);
      } else {
        const nextCells: CellType[][] = Array.from({ length: current.rows }, (_, r) =>
          Array.from({ length: current.cols }, (_, c) => {
            const sr = r - dr;
            const sc = c - dc;
            if (sr >= 0 && sr < current.rows && sc >= 0 && sc < current.cols) {
              return current.cells[sr][sc];
            }
            return 0;
          })
        );
        commitLibraryPatch({
          [current.id]: { ...current, cells: nextCells, isCustomized: true },
        });
      }
    },
    [library, selectedGlyphId, syncLetterForms, commitLibraryPatch]
  );

  const handleCloneShapeToAllForms = useCallback(() => {
    const current = library[selectedGlyphId];
    if (!current || !current.baseLetter) return;
    const spec = RESOLUTION_SPECS[params.gridResolution];
    const joinRow = spec.joinRow + params.joinRowOffset;
    const patch = buildCloneShapeToFamilyPatch(library, current, joinRow);
    const count = Object.keys(patch).length;
    if (count === 0) return;
    commitLibraryPatch(patch);
    showToast(`Copied "${current.name}" matrix to all ${count + 1} forms of «${current.baseLetter}»`);
  }, [library, selectedGlyphId, params.gridResolution, params.joinRowOffset, commitLibraryPatch, showToast]);

  const handleToggleSyncLetterForms = useCallback(() => {
    setSyncLetterForms((prev) => {
      const next = !prev;
      showToast(
        next
          ? 'Universal form sync enabled — edits apply to all contextual forms of the active letter'
          : 'Universal form sync disabled — edits apply only to the selected form'
      );
      return next;
    });
  }, [showToast]);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const previousPatch = undoStack[undoStack.length - 1];
    const currentSnapshot: Record<string, GlyphData> = {};
    for (const id of Object.keys(previousPatch)) {
      if (library[id]) currentSnapshot[id] = library[id];
    }

    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev.slice(-49), currentSnapshot]);
    setLibrary((prev) => ({ ...prev, ...previousPatch }));
  }, [undoStack, library]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const nextPatch = redoStack[redoStack.length - 1];
    const currentSnapshot: Record<string, GlyphData> = {};
    for (const id of Object.keys(nextPatch)) {
      if (library[id]) currentSnapshot[id] = library[id];
    }

    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev.slice(-49), currentSnapshot]);
    setLibrary((prev) => ({ ...prev, ...nextPatch }));
  }, [redoStack, library]);

  // Keyboard shortcuts for Undo / Redo inside Glyph Editor
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (activeTab !== 'editor') return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTab, handleUndo, handleRedo]);

  const allPresets = [...BUILT_IN_PRESETS, ...customPresets];

  const handleChangeParams = useCallback((patch: Partial<FontParams>) => {
    setParams((prev) => ({ ...prev, ...patch }));
    setActivePresetId(null);
  }, []);

  const applyResolutionToLibrary = useCallback((nextRes: GridResolution) => {
    const baseMasters = createDefaultGlyphLibrary();
    setLibrary((prev) => {
      const nextLib: Record<string, GlyphData> = {};
      for (const [id, g] of Object.entries(prev)) {
        if (nextRes === '9x11' && !g.isCustomized && baseMasters[id]) {
          nextLib[id] = baseMasters[id];
        } else {
          const source = !g.isCustomized && baseMasters[id] ? baseMasters[id] : g;
          nextLib[id] = resampleGlyphToResolution(source, nextRes);
        }
      }
      return nextLib;
    });
    setUndoStack([]);
    setRedoStack([]);
  }, []);

  const handleChangeResolution = useCallback(
    (nextRes: GridResolution) => {
      if (nextRes === params.gridResolution) return;
      setParams((prev) => ({ ...prev, gridResolution: nextRes }));
      setActivePresetId(null);
      applyResolutionToLibrary(nextRes);
      showToast(`Matrix grid updated to ${nextRes.replace('x', '×')}`);
    },
    [params.gridResolution, applyResolutionToLibrary, showToast]
  );

  const handleSelectPreset = useCallback(
    (preset: FontPreset) => {
      const resolutionChanged = preset.params.gridResolution !== params.gridResolution;
      setParams({ ...DEFAULT_FONT_PARAMS, ...preset.params });
      setActivePresetId(preset.id);
      if (resolutionChanged) {
        applyResolutionToLibrary(preset.params.gridResolution);
      }
      showToast(
        `Loaded preset "${preset.name}" · ${RESOLUTION_SPECS[preset.params.gridResolution].label}`
      );
    },
    [params.gridResolution, applyResolutionToLibrary, showToast]
  );

  const handleSavePreset = useCallback(
    (name: string) => {
      const shapeLabel =
        params.dotShape.charAt(0).toUpperCase() + params.dotShape.slice(1);
      const description = `${RESOLUTION_SPECS[params.gridResolution].label} · ${shapeLabel} · ${Math.round(params.dotDiameter * 100)}%`;

      setCustomPresets((prev) => {
        const existingIdx = prev.findIndex(
          (p) => p.name.toLowerCase() === name.toLowerCase()
        );
        let next: FontPreset[];
        let savedId: string;
        if (existingIdx >= 0) {
          savedId = prev[existingIdx].id;
          next = prev.map((p, i) =>
            i === existingIdx ? { ...p, name, description, params: { ...params } } : p
          );
        } else {
          savedId = `custom_${Date.now()}`;
          next = [
            ...prev,
            {
              id: savedId,
              name,
              description,
              builtIn: false,
              params: { ...params },
            },
          ];
        }
        try {
          window.localStorage.setItem('ndot-farsi-presets-v1', JSON.stringify(next));
        } catch {
          // Ignore storage quota errors
        }
        setActivePresetId(savedId);
        return next;
      });
      showToast(`Saved preset "${name}"`);
    },
    [params, showToast]
  );

  const handleDeletePreset = useCallback(
    (id: string) => {
      setCustomPresets((prev) => {
        const target = prev.find((p) => p.id === id);
        const next = prev.filter((p) => p.id !== id);
        try {
          window.localStorage.setItem('ndot-farsi-presets-v1', JSON.stringify(next));
        } catch {
          // Ignore storage errors
        }
        if (target) {
          showToast(`Deleted preset "${target.name}"`);
        }
        return next;
      });
      setActivePresetId((curr) => (curr === id ? null : curr));
    },
    [showToast]
  );

  const dottedJoiningCount = useMemo(
    () => countDottedJoiningGlyphs(library, params.joiningNuqtaScope ?? 'all'),
    [library, params.joiningNuqtaScope]
  );

  const handleBulkNudgeJoiningNuqtas = useCallback(
    (dr: number, dc: number) => {
      const scope = params.joiningNuqtaScope ?? 'all';
      const { nextLibrary, movedCount, skippedCount } = bulkNudgeJoiningNuqtas(
        library,
        scope,
        dr,
        dc
      );
      if (movedCount === 0) {
        showToast(
          'No joining nuqtas could move further without hitting bounds or base strokes',
          true
        );
        return;
      }
      setLibrary(nextLibrary);
      const dirLabel =
        dr < 0 ? 'up' : dr > 0 ? 'down' : dc < 0 ? 'left' : 'right';
      const suffix = skippedCount > 0 ? ` (${skippedCount} kept clear of strokes)` : '';
      showToast(`Shifted nuqtas ${dirLabel} across ${movedCount} joining glyphs${suffix}`);
    },
    [library, params.joiningNuqtaScope, showToast]
  );

  const handleBulkSeparateJoiningNuqtas = useCallback(() => {
    const scope = params.joiningNuqtaScope ?? 'all';
    const spec = RESOLUTION_SPECS[params.gridResolution];
    const joinRow = spec.joinRow + params.joinRowOffset;
    const { nextLibrary, adjustedCount } = bulkSeparateJoiningNuqtas(
      library,
      scope,
      joinRow
    );
    if (adjustedCount === 0) {
      showToast('All joining nuqtas already have clear separation from base strokes');
      return;
    }
    setLibrary(nextLibrary);
    showToast(`Increased stroke clearance on ${adjustedCount} joining glyphs`);
  }, [library, params.joiningNuqtaScope, params.gridResolution, params.joinRowOffset, showToast]);

  const handleResetJoiningNuqtas = useCallback(() => {
    const scope = params.joiningNuqtaScope ?? 'all';
    const masters = createDefaultGlyphLibrary();

    setParams((prev) => ({
      ...prev,
      joiningNuqtaScale: 1.0,
      joiningNuqtaOffsetX: 0,
      joiningNuqtaOffsetY: 0,
    }));
    setActivePresetId(null);

    setLibrary((prev) => {
      const nextLib: Record<string, GlyphData> = { ...prev };
      for (const [id, glyph] of Object.entries(prev)) {
        if (!matchesJoiningNuqtaScope(glyph, scope)) continue;
        const base = masters[id];
        if (!base) continue;
        const ref =
          params.gridResolution === '9x11'
            ? base
            : resampleGlyphToResolution(base, params.gridResolution);

        // Preserve user's base stroke dots (1) while restoring master nuqta positions (2)
        const restoredCells: CellType[][] = glyph.cells.map((row, r) =>
          row.map((cell, c) => {
            if (cell === 1) return 1;
            return ref.cells[r]?.[c] === 2 ? 2 : 0;
          })
        );
        nextLib[id] = {
          ...glyph,
          cells: restoredCells,
        };
      }
      return nextLib;
    });

    const scopeLabel = scope === 'all' ? 'all joining' : `${scope} joining`;
    showToast(`Reset nuqta scale and positions for ${scopeLabel} glyphs`);
  }, [params.joiningNuqtaScope, params.gridResolution, showToast]);

  const handleChangeMetadata = useCallback((patch: Partial<FontMetadata>) => {
    setMetadata((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleUploadBaseFont = useCallback(
    async (file: File) => {
      try {
        const family = await loadCustomBaseFont(file);
        setSkeletonFontFamily(family);
        setSkeletonFontLabel(file.name);
        showToast(`Loaded base font "${file.name}" for Zhang-Suen skeletonization`);
      } catch (err) {
        showToast(
          `Failed to load font: ${err instanceof Error ? err.message : 'Invalid font file'}`,
          true
        );
      }
    },
    [showToast]
  );

  const handleSkeletonizeCurrent = useCallback(() => {
    const current = library[selectedGlyphId];
    if (!current) return;
    const targets =
      syncLetterForms && current.baseLetter
        ? getLetterFamilyGlyphs(library, current)
        : [current];

    const patch: Record<string, GlyphData> = {};
    for (const g of targets) {
      const thinned = skeletonizeGlyphFromFont(
        g,
        skeletonFontFamily,
        params.gridResolution,
        skeletonThreshold
      );
      patch[g.id] = { ...thinned, isCustomized: true };
    }
    commitLibraryPatch(patch);
    showToast(
      targets.length > 1
        ? `Skeletonized all ${targets.length} forms of «${current.baseLetter}» using ${skeletonFontLabel}`
        : `Skeletonized "${current.name}" using ${skeletonFontLabel}`
    );
  }, [
    library,
    selectedGlyphId,
    syncLetterForms,
    skeletonFontFamily,
    skeletonFontLabel,
    params.gridResolution,
    skeletonThreshold,
    commitLibraryPatch,
    showToast,
  ]);

  const handleSkeletonizeAll = useCallback(async () => {
    if (isSkeletonizing) return;
    setIsSkeletonizing(true);
    try {
      await document.fonts.ready;
      const ids = Object.keys(library);
      const nextLib: Record<string, GlyphData> = { ...library };

      // Process in chunks to keep UI responsive
      const chunkSize = 20;
      for (let i = 0; i < ids.length; i += chunkSize) {
        const slice = ids.slice(i, i + chunkSize);
        for (const id of slice) {
          const g = nextLib[id];
          if (!params.includeLatin && g.category === 'latin') continue;
          nextLib[id] = skeletonizeGlyphFromFont(
            g,
            skeletonFontFamily,
            params.gridResolution,
            skeletonThreshold
          );
        }
        await new Promise((r) => window.setTimeout(r, 0));
      }

      setLibrary(nextLib);
      setUndoStack([]);
      setRedoStack([]);
      showToast(`Skeletonized all glyphs from ${skeletonFontLabel}`);
    } finally {
      setIsSkeletonizing(false);
    }
  }, [
    isSkeletonizing,
    library,
    params.includeLatin,
    params.gridResolution,
    skeletonFontFamily,
    skeletonFontLabel,
    skeletonThreshold,
    showToast,
  ]);

  const handleRestoreMasters = useCallback(() => {
    const fresh = createDefaultGlyphLibrary();
    if (params.gridResolution === '9x11') {
      setLibrary(fresh);
    } else {
      const resampled: Record<string, GlyphData> = {};
      for (const [id, g] of Object.entries(fresh)) {
        resampled[id] = resampleGlyphToResolution(g, params.gridResolution);
      }
      setLibrary(resampled);
    }
    setUndoStack([]);
    setRedoStack([]);
    showToast('Restored hand-tuned Persian & Latin dot masters');
  }, [params.gridResolution, showToast]);

  const handleResetSelectedGlyph = useCallback(() => {
    const current = library[selectedGlyphId];
    if (!current) return;
    const masters = createDefaultGlyphLibrary();
    const targets =
      syncLetterForms && current.baseLetter
        ? getLetterFamilyGlyphs(library, current)
        : [current];

    const patch: Record<string, GlyphData> = {};
    for (const g of targets) {
      const base = masters[g.id];
      if (!base) continue;
      const restored =
        params.gridResolution === '9x11'
          ? base
          : resampleGlyphToResolution(base, params.gridResolution);
      patch[g.id] = { ...restored, isCustomized: false };
    }
    commitLibraryPatch(patch);
    showToast(
      targets.length > 1
        ? `Reset all ${targets.length} forms of «${current.baseLetter}» to hand-tuned masters`
        : `Reset "${current.name}" to hand-tuned master`
    );
  }, [library, selectedGlyphId, syncLetterForms, params.gridResolution, commitLibraryPatch, showToast]);

  const handleExportTtf = useCallback(() => {
    try {
      const compiled = compileNdotTtf(library, params, metadata);
      const blob = new Blob([compiled.buffer], { type: 'font/ttf' });
      const url = URL.createObjectURL(blob);
      const safeFileName =
        (metadata.familyName || 'Ndot-Farsi')
          .trim()
          .replace(/[^A-Za-z0-9-_]+/g, '-')
          .replace(/^-+|-+$/g, '') || 'Ndot-Farsi';

      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeFileName}.ttf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);

      const kb = (compiled.byteSize / 1024).toFixed(1);
      showToast(`Exported ${safeFileName}.ttf · ${compiled.glyphCount} glyphs · ${kb} KB`);
    } catch (err) {
      showToast(
        `Export failed: ${err instanceof Error ? err.message : String(err)}`,
        true
      );
    }
  }, [library, params, metadata, showToast]);

  const handleSaveProject = useCallback(() => {
    const payload: ProjectFileV1 = {
      schema: 'ndot-farsi-project-v1',
      savedAt: new Date().toISOString(),
      metadata,
      params,
      glyphs: {},
    };
    for (const [id, g] of Object.entries(library)) {
      payload.glyphs[id] = {
        cols: g.cols,
        rows: g.rows,
        cells: g.cells,
        leftBearing: g.leftBearing,
        rightBearing: g.rightBearing,
        advanceCols: g.advanceCols,
        isCustomized: g.isCustomized,
      };
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const safeName =
      (metadata.familyName || 'ndot-farsi')
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-') || 'ndot-farsi';
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName}.ndot.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);

    showToast(`Saved project snapshot (${safeName}.ndot.json)`);
  }, [library, metadata, params, showToast]);

  const handleLoadProject = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as Partial<ProjectFileV1>;
        if (parsed.schema !== 'ndot-farsi-project-v1' || !parsed.params || !parsed.glyphs) {
          throw new Error('Unrecognized project schema');
        }

        const base = createDefaultGlyphLibrary();
        const merged: Record<string, GlyphData> = {};
        for (const [id, def] of Object.entries(base)) {
          const saved = parsed.glyphs[id];
          if (saved && Array.isArray(saved.cells)) {
            merged[id] = {
              ...def,
              cols: saved.cols,
              rows: saved.rows,
              cells: saved.cells,
              leftBearing: saved.leftBearing ?? def.leftBearing,
              rightBearing: saved.rightBearing ?? def.rightBearing,
              advanceCols: saved.advanceCols ?? def.advanceCols,
              isCustomized: saved.isCustomized ?? false,
            };
          } else {
            merged[id] = resampleGlyphToResolution(def, parsed.params.gridResolution);
          }
        }

        setParams({ ...DEFAULT_FONT_PARAMS, ...parsed.params });
        setActivePresetId(null);
        if (parsed.metadata) {
          setMetadata({ ...DEFAULT_FONT_METADATA, ...parsed.metadata });
        }
        setLibrary(merged);
        setUndoStack([]);
        setRedoStack([]);
        showToast(`Loaded project "${file.name}"`);
      } catch (err) {
        showToast(
          `Could not load project: ${err instanceof Error ? err.message : 'Invalid JSON'}`,
          true
        );
      }
    },
    [showToast]
  );

  const handleSelectGlyph = useCallback((id: string) => {
    setSelectedGlyphId(id);
    setActiveTab('editor');
  }, []);

  const selectedGlyph = library[selectedGlyphId] ?? Object.values(library)[0];

  const navItems: Array<{ id: WorkspaceTab; label: string }> = [
    { id: 'playground', label: 'Playground' },
    { id: 'editor', label: 'Glyph Editor' },
    { id: 'specimen', label: 'Specimen' },
  ];

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[#0E0E10] text-[#F5F5F5]">
      {/* Top Bar — Strict 3-Zone Contract */}
      <header className="h-13 shrink-0 flex items-center justify-between gap-8 px-5 bg-[#141417] border-b border-[#262626]">
        {/* Zone 1: Single-line Brand Wordmark */}
        <div className="text-base font-bold tracking-tight text-[#F5F5F5] whitespace-nowrap shrink-0">
          Ndot Farsi
        </div>

        {/* Zone 2: Clean Single-Line Workspace Tabs */}
        <nav className="flex items-center gap-7 h-full" aria-label="Workspace views">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`relative h-full flex items-center text-[13px] font-medium whitespace-nowrap shrink-0 transition-colors ${
                  active ? 'text-[#F5F5F5]' : 'text-[#8E8E93] hover:text-[#F5F5F5]'
                }`}
              >
                <span>{item.label}</span>
                {active && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#D71921]" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Single Primary Action CTA */}
        <div className="shrink-0">
          <button
            type="button"
            onClick={handleExportTtf}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-[#D71921] hover:bg-[#B8141B] text-white whitespace-nowrap shrink-0 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export .TTF</span>
          </button>
        </div>
      </header>

      {/* Main 3-Pane Industrial Studio Layout */}
      <main className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Pane: Parameters, Skeletonizer, Metadata & Project I/O */}
        <LeftInspector
          params={params}
          metadata={metadata}
          presets={allPresets}
          activePresetId={activePresetId}
          dottedJoiningCount={dottedJoiningCount}
          syncLetterForms={syncLetterForms}
          skeletonFontName={skeletonFontLabel}
          skeletonThreshold={skeletonThreshold}
          isSkeletonizing={isSkeletonizing}
          onSelectPreset={handleSelectPreset}
          onSavePreset={handleSavePreset}
          onDeletePreset={handleDeletePreset}
          onToggleSyncLetterForms={handleToggleSyncLetterForms}
          onBulkNudgeJoiningNuqtas={handleBulkNudgeJoiningNuqtas}
          onBulkSeparateJoiningNuqtas={handleBulkSeparateJoiningNuqtas}
          onResetJoiningNuqtas={handleResetJoiningNuqtas}
          onChangeParams={handleChangeParams}
          onChangeResolution={handleChangeResolution}
          onChangeMetadata={handleChangeMetadata}
          onChangeThreshold={setSkeletonThreshold}
          onUploadBaseFont={handleUploadBaseFont}
          onSkeletonizeCurrent={handleSkeletonizeCurrent}
          onSkeletonizeAll={handleSkeletonizeAll}
          onRestoreMasters={handleRestoreMasters}
          onSaveProject={handleSaveProject}
          onLoadProject={handleLoadProject}
        />

        {/* Center Pane: Active Workspace View */}
        <section className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
          {activeTab === 'playground' && (
            <PlaygroundView
              library={library}
              params={params}
              liveFontFamily={liveFontFamily}
              compileError={compileError}
              previewTheme={previewTheme}
              onChangePreviewTheme={setPreviewTheme}
            />
          )}

          {activeTab === 'editor' && selectedGlyph && (
            <GlyphEditorView
              glyph={selectedGlyph}
              library={library}
              params={params}
              liveFontFamily={liveFontFamily}
              syncLetterForms={syncLetterForms}
              showSkeletonGuide={showSkeletonGuide}
              skeletonFontFamily={skeletonFontFamily}
              skeletonFontLabel={skeletonFontLabel}
              skeletonThreshold={skeletonThreshold}
              canUndo={undoStack.length > 0}
              canRedo={redoStack.length > 0}
              onToggleSyncLetterForms={handleToggleSyncLetterForms}
              onToggleSkeletonGuide={setShowSkeletonGuide}
              onSelectGlyph={handleSelectGlyph}
              onUpdateGlyph={handleUpdateGlyph}
              onNudgeGlyph={handleNudgeGlyph}
              onCloneShapeToAllForms={handleCloneShapeToAllForms}
              onUndo={handleUndo}
              onRedo={handleRedo}
              onResetGlyph={handleResetSelectedGlyph}
              onSkeletonizeGlyph={handleSkeletonizeCurrent}
            />
          )}

          {activeTab === 'specimen' && (
            <SpecimenView
              library={library}
              params={params}
              selectedGlyphId={selectedGlyphId}
              previewTheme={previewTheme}
              onChangePreviewTheme={setPreviewTheme}
              onSelectGlyphForEdit={handleSelectGlyph}
            />
          )}
        </section>

        {/* Right Pane: Searchable Glyph Navigator */}
        <RightNavigator
          library={library}
          params={params}
          selectedGlyphId={selectedGlyphId}
          onSelectGlyph={handleSelectGlyph}
        />
      </main>

      {/* Non-intrusive Action Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 text-xs font-mono-tech border shadow-lg ${
            toast.isError
              ? 'bg-[#2A1215] border-[#D71921] text-[#FCA5A5]'
              : 'bg-[#18181C] border-[#3F3F46] text-[#F5F5F5]'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
