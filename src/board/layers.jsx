import { memo, useMemo } from 'react';
import { overlayGeometry, pitchPrimitives, primitivesToPath } from '../core/pitch/geometry.js';
import { cubicPathD, smoothPathD } from '../core/animation/bezier.js';
import { EVENT_TYPES, isMotion } from '../core/tactics/events.js';
import { eventEndPoint, eventStartPoint, positionAt } from '../core/animation/timeline.js';
import { endDirection, headPath, insetEnd, LINE_STYLES, scaleDash, startDirection, wavyPath } from './lines.js';
import { FONT_NUM, FONT_UI } from './marks.jsx';

/**
 * `stroke` converts the width of pitch markings. On the live board markings stay
 * at a fixed pixel width; in an export they are drawn in metres so they keep
 * their weight at any image size.
 */
export const PitchLayer = memo(function PitchLayer({ pitch, theme, unit = null }) {
  const blank = pitch.view === 'blank';
  const { length: L, width: W } = pitch;
  const d = useMemo(() => {
    const prims = pitchPrimitives(pitch);
    return { lines: primitivesToPath(prims.filter((p) => !p.goal && p.kind !== 'spot')), spots: prims.filter((p) => p.kind === 'spot'), goals: primitivesToPath(prims.filter((p) => p.goal)) };
  }, [pitch]);
  const stripes = useMemo(() => {
    if (!pitch.stripes || blank) return [];
    const n = Math.max(6, Math.round(L / 8.75));
    const w = L / n;
    return Array.from({ length: Math.floor(n / 2) + 1 }, (_, i) => ({ x: i * 2 * w, w }));
  }, [pitch.stripes, L, blank]);
  const sw = unit ? { strokeWidth: 1.25 * unit } : { strokeWidth: 1.25, vectorEffect: 'non-scaling-stroke' };
  const pad = Math.max(L, W) * 2;
  return (
    <g>
      <rect x={-pad} y={-pad} width={L + pad * 2} height={W + pad * 2} fill={theme.surround} />
      {!blank && <rect x={0} y={0} width={L} height={W} fill={theme.ground} />}
      {blank && <rect x={0} y={0} width={L} height={W} fill={theme.ground} opacity={0.6} />}
      {stripes.map((s) => (<rect key={s.x} x={s.x} y={0} width={Math.min(s.w, L - s.x)} height={W} fill={theme.stripe} />))}
      {!blank && (
        <g fill="none" stroke={theme.line} strokeOpacity={theme.lineOpacity}>
          <path d={d.lines} {...sw} />
          <path d={d.goals} strokeOpacity={theme.lineOpacity * 0.8} {...sw} />
        </g>
      )}
      {!blank && d.spots.map((s) => <circle key={s.id} cx={s.cx} cy={s.cy} r={0.28} fill={theme.line} fillOpacity={theme.lineOpacity} />)}
    </g>
  );
});

export const OverlayLayer = memo(function OverlayLayer({ pitch, theme, unit = null }) {
  const geo = useMemo(() => overlayGeometry(pitch), [pitch]);
  if (!geo.lines.length && !geo.bands.length && !geo.labels.length) return null;
  const sw = (w) => (unit ? { strokeWidth: w * unit } : { strokeWidth: w, vectorEffect: 'non-scaling-stroke' });
  return (
    <g>
      {geo.bands.map((b, i) => <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} fill={theme.overlay} opacity={0.08} />)}
      {geo.lines.map((l, i) => (
        <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={theme.overlay} strokeOpacity={l.fine ? 0.16 : 0.34} strokeDasharray={l.fine ? undefined : unit ? '0.9 0.7' : '6 5'} {...sw(1)} />
      ))}
      {geo.labels.map((l, i) => (
        <text key={i} x={l.x} y={l.y} textAnchor="middle" fontFamily={FONT_NUM} fontSize={1.5} fill={theme.overlay} opacity={0.72}>{l.text}</text>
      ))}
    </g>
  );
});

/* ---------- Tactical event lines ---------- */

export function eventColor(ev, theme) {
  return EVENT_TYPES[ev.type]?.group === 'ball' ? theme.ballLine : theme.arrow;
}

export const EventLine = memo(function EventLine({ ev, p0, p3, theme, selected, invalid, accent, k = 1 }) {
  const meta = EVENT_TYPES[ev.type];
  const style = LINE_STYLES[meta?.line] ?? LINE_STYLES.arrow;
  if (!p0 || !p3 || meta?.line === 'none') return null;
  const motion = isMotion(ev.type);
  const c1 = motion ? ev.c1 : ev.c ? { x: p0.x + (ev.c.x - p0.x) * (2 / 3), y: p0.y + (ev.c.y - p0.y) * (2 / 3) } : null;
  const c2 = motion ? ev.c2 : ev.c ? { x: p3.x + (ev.c.x - p3.x) * (2 / 3), y: p3.y + (ev.c.y - p3.y) * (2 / 3) } : null;
  const inset = !motion && ev.receiver ? 1.9 : 0;
  const tip = insetEnd(p0, c1, c2, p3, inset);
  const dir = endDirection(p0, c1, c2, tip);
  const head = headPath(tip, dir, style.head, k);
  // Stop the stroke at the base of the arrowhead so the point stays sharp.
  const stemBack = (style.head === 'double' ? 1.6 : 0.8) * k;
  const stem = style.head === 'solid' || style.head === 'double'
    ? { x: tip.x - dir.x * stemBack, y: tip.y - dir.y * stemBack }
    : tip;
  const d = style.wavy ? wavyPath(p0, c1, c2, stem, k) : cubicPathD(p0, c1, c2, stem);
  const color = invalid ? '#d9543f' : eventColor(ev, theme);
  return (
    <g>
      <path d={d} fill="none" stroke="transparent" strokeWidth={Math.max(2.2 * k, 1)} data-hit="event" data-id={ev.id} style={{ cursor: 'pointer' }} />
      {selected && <path d={d} fill="none" stroke={accent ?? theme.overlay} strokeOpacity={0.3} strokeWidth={(style.width + 0.7) * k} strokeLinecap="round" />}
      <path
        d={d} fill="none" stroke={color} strokeWidth={style.width * k}
        strokeDasharray={invalid ? scaleDash('0.5 0.5', k) : scaleDash(style.dash, k)}
        strokeLinecap={style.round ? 'round' : 'butt'} strokeLinejoin="round" pointerEvents="none"
      />
      {head && <path d={head} fill={color} pointerEvents="none" />}
    </g>
  );
});

export function EventLines({ compiled, theme, selected = [], accent, eventRef, filter, k = 1 }) {
  return (
    <g>
      {compiled.events.map((ev) => {
        if (filter && !filter(ev)) return null;
        if (ev.shape) return null;
        const isSel = selected.includes(ev.id);
        return (
          <g key={ev.id} ref={eventRef ? (el) => eventRef(ev.id, el) : undefined}>
            <EventLine
              ev={ev} theme={theme} selected={isSel} accent={accent} k={k}
              invalid={compiled.invalid.has(ev.id)}
              p0={eventStartPoint(compiled, ev)} p3={eventEndPoint(compiled, ev)}
            />
          </g>
        );
      })}
    </g>
  );
}

/* ---------- Annotations ---------- */

export function annotationEnds(a, compiled, t) {
  const at = (id, fallback) => {
    if (!id) return fallback;
    const p = positionAt(compiled, id, t);
    return p ?? fallback;
  };
  return { p0: a.p0 ? at(a.startAttach, a.p0) : null, p3: a.p3 ? at(a.endAttach, a.p3) : null };
}

const DASHES = { solid: undefined, dashed: '1.1 0.7', dotted: '0.25 0.55' };

export const AnnotationMark = memo(function AnnotationMark({ a, theme, selected, p0, p3, accent, rot = 0, k = 1 }) {
  const color = a.color ?? theme.arrow;
  const w = (a.width ?? 2) * 0.12 * k;
  const hitProps = { 'data-hit': 'annotation', 'data-id': a.id, style: { cursor: a.locked ? 'default' : 'move' } };
  const dash = scaleDash(DASHES[a.dash], k);
  const sel = selected ? <SelectionGlow a={a} p0={p0} p3={p3} accent={accent ?? theme.overlay} /> : null;
  switch (a.kind) {
    case 'arrow': {
      const style = LINE_STYLES[a.lineStyle] ?? null;
      const width = style ? style.width * ((a.width ?? 2) / 2) * k : w;
      const hs = Math.max(0.8, (a.width ?? 2) / 2) * k;
      const headKind = a.head === 'none' ? 'none' : style?.head ?? 'solid';
      const dir = endDirection(p0, a.c1, a.c2, p3);
      const back = (headKind === 'double' ? 1.6 : 0.8) * k;
      const stem = headKind === 'none' || headKind === 'bar' ? p3 : { x: p3.x - dir.x * back, y: p3.y - dir.y * back };
      const d = style?.wavy ? wavyPath(p0, a.c1, a.c2, stem, k) : cubicPathD(p0, a.c1, a.c2, stem);
      const strokeColor = a.color ?? (style?.ball ? theme.ballLine : theme.arrow);
      const lineDash = a.dash !== 'solid' ? dash : scaleDash(style?.dash, k);
      return (
        <g opacity={a.opacity}>
          <path d={d} fill="none" stroke="transparent" strokeWidth={Math.max(2.2 * k, 1)} {...hitProps} />
          {sel}
          <path d={d} fill="none" stroke={strokeColor} strokeWidth={width} strokeDasharray={lineDash} strokeLinejoin="round" pointerEvents="none" />
          {headKind !== 'none' && <path d={headPath(p3, dir, headKind, hs)} fill={strokeColor} pointerEvents="none" />}
          {a.head === 'both' && <path d={headPath(p0, { x: -startDirection(p0, a.c1, a.c2, p3).x, y: -startDirection(p0, a.c1, a.c2, p3).y }, 'solid', hs)} fill={strokeColor} pointerEvents="none" />}
        </g>
      );
    }
    case 'pen':
    case 'highlight': {
      const d = smoothPathD(a.points ?? []);
      const isHi = a.kind === 'highlight';
      return (
        <g opacity={a.opacity}>
          <path d={d} fill="none" stroke="transparent" strokeWidth={Math.max(2.2, isHi ? 2.6 : 1)} strokeLinecap="round" {...hitProps} />
          {sel}
          <path d={d} fill="none" stroke={color} strokeOpacity={isHi ? 0.34 : 1} strokeWidth={isHi ? (a.width ?? 2) * 0.9 : w} strokeDasharray={dash} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />
        </g>
      );
    }
    case 'zone': {
      const d = `${smoothPathD(a.points ?? [])}Z`;
      return (
        <g opacity={a.opacity}>
          {sel}
          <path d={d} fill={color} fillOpacity={a.fill} stroke={color} strokeOpacity={0.8} strokeWidth={w} strokeDasharray={a.dash === 'solid' ? undefined : dash} strokeLinejoin="round" {...hitProps} />
        </g>
      );
    }
    case 'rect':
      return (
        <g opacity={a.opacity}>
          {sel}
          <rect x={Math.min(a.x, a.x + a.w)} y={Math.min(a.y, a.y + a.h)} width={Math.abs(a.w)} height={Math.abs(a.h)} rx={0.5} fill={color} fillOpacity={a.fill} stroke={color} strokeWidth={w} strokeDasharray={dash} {...hitProps} />
        </g>
      );
    case 'circle':
      return (
        <g opacity={a.opacity}>
          {sel}
          <ellipse cx={a.x + a.w / 2} cy={a.y + a.h / 2} rx={Math.abs(a.w / 2)} ry={Math.abs(a.h / 2)} fill={color} fillOpacity={a.fill} stroke={color} strokeWidth={w} strokeDasharray={dash} {...hitProps} />
        </g>
      );
    case 'text': {
      const size = a.size ?? 2.4;
      return (
        <g transform={`translate(${a.x} ${a.y}) rotate(${-rot})`} opacity={a.opacity}>
          {selected && <rect x={-0.7} y={-size * 1.05} width={Math.max(4, (a.text?.length ?? 0) * size * 0.54) + 1.4} height={size * 1.5} rx={0.3} fill="none" stroke={accent ?? theme.overlay} strokeWidth={0.14} />}
          <text
            fontFamily={FONT_UI} fontWeight={500} fontSize={size} fill={color}
            stroke={theme.ground} strokeWidth={size * 0.16} strokeOpacity={0.75}
            style={{ paintOrder: 'stroke', strokeLinejoin: 'round', userSelect: 'none', cursor: 'move' }}
            data-hit="annotation" data-id={a.id}
          >{a.text}</text>
        </g>
      );
    }
    default:
      return null;
  }
});

function SelectionGlow({ a, p0, p3, accent }) {
  if (a.kind === 'arrow') return <path d={cubicPathD(p0, a.c1, a.c2, p3)} fill="none" stroke={accent} strokeOpacity={0.3} strokeWidth={0.9} strokeLinecap="round" pointerEvents="none" />;
  if (a.kind === 'pen' || a.kind === 'highlight') return <path d={smoothPathD(a.points ?? [])} fill="none" stroke={accent} strokeOpacity={0.3} strokeWidth={a.kind === 'highlight' ? (a.width ?? 2) + 0.8 : 0.9} strokeLinecap="round" pointerEvents="none" />;
  if (a.kind === 'zone') return <path d={`${smoothPathD(a.points ?? [])}Z`} fill="none" stroke={accent} strokeOpacity={0.5} strokeWidth={0.4} pointerEvents="none" />;
  if (a.kind === 'rect') return <rect x={Math.min(a.x, a.x + a.w)} y={Math.min(a.y, a.y + a.h)} width={Math.abs(a.w)} height={Math.abs(a.h)} rx={0.5} fill="none" stroke={accent} strokeOpacity={0.5} strokeWidth={0.4} pointerEvents="none" />;
  if (a.kind === 'circle') return <ellipse cx={a.x + a.w / 2} cy={a.y + a.h / 2} rx={Math.abs(a.w / 2)} ry={Math.abs(a.h / 2)} fill="none" stroke={accent} strokeOpacity={0.5} strokeWidth={0.4} pointerEvents="none" />;
  return null;
}
