import { memo } from 'react';
import { compile, ballAt, positionAt } from '../core/animation/timeline.js';
import { viewBounds } from '../core/pitch/geometry.js';
import { getTheme } from '../core/pitch/themes.js';
import { AnalysisStatic } from './analysisMarks.jsx';
import { annotationEnds, AnnotationMark, EventLines, OverlayLayer, PitchLayer } from './layers.jsx';
import { BallMark, FONT_UI, ObjectMark } from './marks.jsx';

/**
 * The whole board as a pure function of (document, time). Thumbnails, PNG, SVG,
 * GIF, video and shared previews all render this, using the same marks as the
 * live board, so an export always matches what the timeline says.
 */
export const StaticBoard = memo(function StaticBoard({
  doc, t = 0, width, height, rot = 0, showLines = 'all', labelMode = 'number', caption = null, background = true, analysis = null, className, title, showBall = true,
}) {
  const compiled = compile(doc);
  const theme = getTheme(doc.pitch.theme);
  const b = viewBounds(doc.pitch);
  const quarter = Math.abs(rot % 180) === 90;
  const vbW = quarter ? b.h : b.w;
  const captionH = caption ? vbW * 0.085 : 0;
  const vbH = (quarter ? b.w : b.h) + captionH;
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const unit = vbW / 1200;
  const markerScale = Math.min(1, Math.max(0.55, vbW / 62));
  const k = Math.min(1, Math.max(0.35, vbW / 90));
  const tf = `translate(${vbW / 2} ${(quarter ? b.w : b.h) / 2}) rotate(${rot}) translate(${-cx} ${-cy})`;
  const lineFilter = showLines === 'none'
    ? () => false
    : showLines === 'active' ? (ev) => t >= ev.t - 0.1 && t <= ev.t + (ev.duration || 0) + 0.3 : undefined;
  const clipId = `clip-${doc.id}`.replace(/[^\w-]/g, '');
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${vbW} ${vbH}`} width={width} height={height} className={className}
      role="img" aria-label={title ?? `Tactical diagram: ${doc.title}`} style={{ display: 'block' }}
    >
      {background && <rect width={vbW} height={vbH} fill={theme.surround} />}
      <defs><clipPath id={clipId}><rect width={vbW} height={vbH - captionH} /></clipPath></defs>
      <g clipPath={`url(#${clipId})`}>
        <g transform={tf}>
          <PitchLayer pitch={doc.pitch} theme={theme} unit={unit} />
          <OverlayLayer pitch={doc.pitch} theme={theme} unit={unit} />
          {analysis && <AnalysisStatic doc={doc} t={t} analysis={analysis} theme={theme} rot={rot} />}
          <g>
            {doc.annotationOrder.map((id) => {
              const a = doc.annotations[id];
              if (!a || a.hidden) return null;
              if (a.showFrom != null && t < a.showFrom) return null;
              if (a.showUntil != null && t > a.showUntil) return null;
              const ends = annotationEnds(a, compiled, t);
              return <AnnotationMark key={id} a={a} theme={theme} p0={ends.p0} p3={ends.p3} rot={rot} k={k} />;
            })}
          </g>
          <EventLines compiled={compiled} theme={theme} filter={lineFilter} k={k} />
          <g>
            {doc.objectOrder.map((id) => {
              const o = doc.objects[id];
              if (!o || o.hidden) return null;
              const p = positionAt(compiled, id, t);
              return (
                <g key={id} transform={`translate(${p.x} ${p.y}) rotate(${-rot}) scale(${markerScale})`}>
                  <ObjectMark obj={o} teams={doc.teams} labelMode={labelMode} theme={theme} />
                </g>
              );
            })}
          </g>
          {showBall && <BallMark ball={ballAt(compiled, t)} rot={rot} theme={theme} />}
        </g>
      </g>
      {caption && (
        <g transform={`translate(0 ${vbH - captionH})`}>
          <rect width={vbW} height={captionH} fill="#f4f3ec" />
          <text x={vbW * 0.02} y={captionH * 0.62} fontFamily={FONT_UI} fontWeight={600} fontSize={captionH * 0.36} fill="#23261f">{caption.title}</text>
          <text x={vbW * 0.98} y={captionH * 0.62} textAnchor="end" fontFamily={FONT_UI} fontWeight={600} fontSize={captionH * 0.3} fill="#1f4433">pitchlab</text>
        </g>
      )}
    </svg>
  );
});
