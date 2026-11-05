import { memo } from 'react';
import { readableOn, BALL_COLOR } from '../core/pitch/themes.js';

/**
 * Pure drawing of board objects, in metres, with no knowledge of the camera.
 * The live board, library thumbnails and every export use these same components.
 * Colours are explicit attributes so a serialized SVG needs no stylesheet.
 */
export const FONT_NUM = "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif";
export const FONT_UI = "'Schibsted Grotesk Variable', 'Schibsted Grotesk', Helvetica, Arial, sans-serif";

export function objectColor(obj, teams) {
  if (obj.color) return obj.color;
  const team = teams?.[obj.team];
  if (!team) return '#8a8d82';
  return obj.gk ? team.gk : team.color;
}

function labelFor(obj, labelMode) {
  if (labelMode === 'name') return obj.name;
  if (labelMode === 'position') return obj.position;
  if (labelMode === 'both') return obj.name || obj.position;
  return '';
}

const LABEL_STROKE = { paintOrder: 'stroke', strokeLinejoin: 'round' };

export const PlayerMark = memo(function PlayerMark({ obj, teams, selected, labelMode, theme, accent }) {
  const color = objectColor(obj, teams);
  const r = 1.55;
  const label = labelFor(obj, labelMode);
  const number = obj.number === '' || obj.number == null ? '' : String(obj.number);
  const isAway = obj.team === 'away';
  const isNeutral = obj.team === 'neutral';
  const size = number.length > 2 ? 1.45 : 1.95;
  const fill = isAway ? '#fbfaf5' : color;
  const ink = isAway ? '#1b1e18' : readableOn(color);
  const shape = isNeutral
    ? <rect x={-r * 0.92} y={-r * 0.92} width={r * 1.84} height={r * 1.84} rx={0.42} fill={fill} stroke="#fbfaf5" strokeWidth={0.13} />
    : isAway
      ? <circle r={r - 0.17} fill={fill} stroke={color} strokeWidth={0.42} />
      : <circle r={r} fill={fill} stroke="#fbfaf5" strokeWidth={0.13} />;
  return (
    <g opacity={obj.sub ? 0.62 : 1}>
      {selected && <circle r={r + 0.55} fill="none" stroke={accent ?? theme.overlay} strokeWidth={0.26} />}
      {shape}
      {obj.gk && <circle r={r - (isAway ? 0.62 : 0.34)} fill="none" stroke={ink} strokeOpacity={0.55} strokeWidth={0.09} />}
      <path data-heading="" d={`M${r + 0.28} -0.42L${r + 0.86} 0L${r + 0.28} 0.42z`} fill={theme.text} opacity={0} />
      <text
        y={size * 0.355} textAnchor="middle" fontFamily={FONT_NUM} fontWeight={600} fontSize={size}
        fill={ink} style={{ userSelect: 'none' }}
      >{number}</text>
      {label ? (
        <text
          y={r + 1.55} textAnchor="middle" fontFamily={FONT_UI} fontWeight={500} fontSize={1.2}
          fill={theme.text} stroke={theme.ground} strokeWidth={0.34} strokeOpacity={0.9} style={LABEL_STROKE}
        >{label}</text>
      ) : null}
      {obj.locked && <circle cx={r * 0.78} cy={-r * 0.78} r={0.36} fill={theme.ground} stroke={theme.text} strokeWidth={0.12} />}
    </g>
  );
});

function PropBody({ obj, theme, selected, accent }) {
  const c = obj.color;
  const ring = selected ? <circle r={2} fill="none" stroke={accent ?? theme.overlay} strokeWidth={0.2} /> : null;
  switch (obj.type) {
    case 'cone':
      return <g>{ring}<path d="M0 -0.75L0.72 0.5H-0.72z" fill={c ?? '#e39a2d'} stroke="#3a2a10" strokeOpacity={0.35} strokeWidth={0.06} strokeLinejoin="round" /></g>;
    case 'pole':
      return <g>{ring}<circle r={0.42} fill={c ?? '#d9b12a'} stroke="#23261f" strokeWidth={0.1} /><circle r={0.14} fill="#23261f" /></g>;
    case 'mannequin':
      return (
        <g>{ring}
          <circle cy={-0.75} r={0.42} fill={c ?? '#6e7166'} />
          <path d="M-0.72 -0.25h1.44l-0.3 1.35h-0.84z" fill={c ?? '#6e7166'} />
        </g>
      );
    case 'coach':
      return (
        <g>{ring}
          <circle r={1.3} fill={c ?? '#23261f'} stroke="#fbfaf5" strokeWidth={0.12} />
          <text y={0.56} textAnchor="middle" fontFamily={FONT_NUM} fontWeight={600} fontSize={1.6} fill="#fbfaf5">C</text>
        </g>
      );
    case 'smallgoal':
      return (
        <g transform={`rotate(${obj.rotation ?? 0})`}>{selected && <circle r={2.2} fill="none" stroke={accent ?? theme.overlay} strokeWidth={0.2} />}
          <path d="M-0.55 -1.5H0.55V1.5H-0.55" fill={`${c ?? theme.overlay}22`} stroke={c ?? theme.overlay} strokeWidth={0.2} />
        </g>
      );
    case 'fullgoal':
      return (
        <g transform={`rotate(${obj.rotation ?? 0})`}>{selected && <circle r={4.2} fill="none" stroke={accent ?? theme.overlay} strokeWidth={0.2} />}
          <path d="M-1 -3.66H1V3.66H-1" fill={`${c ?? theme.overlay}22`} stroke={c ?? theme.overlay} strokeWidth={0.22} />
        </g>
      );
    case 'ballprop':
      return <g>{ring}<circle r={0.5} fill={BALL_COLOR} stroke="#3a2a10" strokeWidth={0.08} /></g>;
    default:
      return <circle r={1} fill={c ?? '#8a8d82'} />;
  }
}

export const ObjectMark = memo(function ObjectMark({ obj, teams, selected, labelMode, theme, accent }) {
  if (obj.type === 'player') return <PlayerMark obj={obj} teams={teams} selected={selected} labelMode={labelMode} theme={theme} accent={accent} />;
  return <PropBody obj={obj} theme={theme} selected={selected} accent={accent} />;
});

/** Radius of the invisible hit target around an object, in metres. */
export function hitRadius(obj) {
  if (obj.type === 'fullgoal') return 4;
  if (obj.type === 'smallgoal') return 2.2;
  return obj.type === 'player' ? 2.2 : 1.5;
}

export function BallMark({ ball, rot = 0, theme }) {
  const lift = ball.h ?? 0;
  const s = 1 + lift * 0.035;
  return (
    <g transform={`translate(${ball.x} ${ball.y})`}>
      <ellipse rx={0.55} ry={0.4} fill="#000" opacity={lift > 0.05 ? 0.28 : 0.2} />
      <g transform={`rotate(${-rot}) translate(0 ${-lift * 0.34}) scale(${s})`}>
        <circle r={0.62} fill={BALL_COLOR} stroke={theme?.ground ?? '#1b1e18'} strokeWidth={0.13} />
      </g>
    </g>
  );
}
