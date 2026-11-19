import React from 'react';
import { DotShape, FontParams, GlyphData, RESOLUTION_SPECS } from '../types/font';
import { computeGlyphDots, RenderedDot, shapeTextToVisualGlyphs } from '../engine/shaper';

interface DotElementProps {
  cx: number;
  cy: number;
  r: number;
  shape: DotShape;
  fill: string;
}

export const SvgDotShape: React.FC<DotElementProps> = ({ cx, cy, r, shape, fill }) => {
  if (shape === 'square') {
    return <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} fill={fill} />;
  }
  if (shape === 'rounded') {
    return (
      <rect
        x={cx - r}
        y={cy - r}
        width={r * 2}
        height={r * 2}
        rx={r * 0.45}
        ry={r * 0.45}
        fill={fill}
      />
    );
  }
  if (shape === 'diamond') {
    const pts = `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`;
    return <polygon points={pts} fill={fill} />;
  }
  return <circle cx={cx} cy={cy} r={r} fill={fill} />;
};

interface GlyphMiniSvgProps {
  glyph: GlyphData;
  params: FontParams;
  size?: number;
  dotColor?: string;
  nuqtaColor?: string;
}

export const GlyphMiniSvg: React.FC<GlyphMiniSvgProps> = ({
  glyph,
  params,
  size = 36,
  dotColor = '#F5F5F5',
  nuqtaColor,
}) => {
  const { dots, totalAdvanceCols } = computeGlyphDots(glyph, params);
  const pxX = 10 * params.dotSpacingX;
  const pxY = 10 * params.dotSpacingY;
  const minP = Math.min(pxX, pxY);
  const w = Math.max(totalAdvanceCols, 3) * pxX;
  const h = glyph.rows * pxY;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${w} ${h}`}
      className="block shrink-0 overflow-visible"
      aria-hidden="true"
    >
      {dots.map((d, i) => (
        <SvgDotShape
          key={i}
          cx={d.cx * pxX}
          cy={d.cy * pxY}
          r={d.radius * minP}
          shape={d.shape}
          fill={d.isNuqta && nuqtaColor ? nuqtaColor : dotColor}
        />
      ))}
    </svg>
  );
};

interface VectorLineSvgProps {
  text: string;
  library: Record<string, GlyphData>;
  params: FontParams;
  fontSizePx: number;
  dotColor: string;
  showGuides?: boolean;
  highlightNuqta?: boolean;
}

export const VectorLineSvg: React.FC<VectorLineSvgProps> = ({
  text,
  library,
  params,
  fontSizePx,
  dotColor,
  showGuides = false,
  highlightNuqta = false,
}) => {
  const spec = RESOLUTION_SPECS[params.gridResolution];
  const lines = text.split('\n');
  const cellBase = fontSizePx / spec.rows;
  const pitchX = cellBase * params.dotSpacingX;
  const pitchY = cellBase * params.dotSpacingY;
  const minP = Math.min(pitchX, pitchY);
  const lineHeight = spec.rows * pitchY + Math.max(12, pitchY * 2.2);

  const renderedLines = lines.map((lineText) => {
    const items = shapeTextToVisualGlyphs(lineText, library, params.includeLatin);
    const allDots: Array<RenderedDot & { px: number; py: number }> = [];
    let cursorX = 0;

    for (const item of items) {
      if (item.isSpace || !item.glyph) {
        cursorX += params.wordSpacing * pitchX;
        continue;
      }
      const { dots, totalAdvanceCols } = computeGlyphDots(item.glyph, params);
      for (const d of dots) {
        allDots.push({
          ...d,
          px: cursorX + d.cx * pitchX,
          py: d.cy * pitchY,
        });
      }
      cursorX += totalAdvanceCols * pitchX;
    }

    return { dots: allDots, width: Math.max(cursorX, pitchX * 4) };
  });

  const maxWidth = Math.max(240, ...renderedLines.map((l) => l.width));
  const totalHeight = Math.max(lineHeight, renderedLines.length * lineHeight);
  const joinY = (spec.joinRow + 0.5 + params.baselineOffset) * pitchY;

  return (
    <div className="w-full overflow-x-auto ndot-scroll" dir="rtl">
      <svg
        width={maxWidth + 24}
        height={totalHeight + 16}
        viewBox={`-12 -8 ${maxWidth + 24} ${totalHeight + 16}`}
        className="block ml-auto"
      >
        {renderedLines.map((line, li) => {
          const yOff = li * lineHeight;
          const xOffsetRightAligned = maxWidth - line.width;
          return (
            <g key={li} transform={`translate(${xOffsetRightAligned}, ${yOff})`}>
              {showGuides && (
                <>
                  <line
                    x1={-8}
                    x2={line.width + 8}
                    y1={joinY}
                    y2={joinY}
                    stroke="#D71921"
                    strokeOpacity={0.45}
                    strokeWidth={1}
                    strokeDasharray="3 3"
                  />
                  <line
                    x1={-8}
                    x2={line.width + 8}
                    y1={(spec.baselineRow + 1 + params.baselineOffset) * pitchY}
                    y2={(spec.baselineRow + 1 + params.baselineOffset) * pitchY}
                    stroke="#52525B"
                    strokeOpacity={0.35}
                    strokeWidth={1}
                  />
                </>
              )}
              {line.dots.map((d, di) => (
                <SvgDotShape
                  key={di}
                  cx={d.px}
                  cy={d.py}
                  r={d.radius * minP}
                  shape={d.shape}
                  fill={highlightNuqta && d.isNuqta ? '#D71921' : dotColor}
                />
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
