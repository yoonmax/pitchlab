import { memo } from 'react';
import { heatmapFromData, heatmapFromTimeline, ballHeatmap, offsideAnalysis, passingLanes, passingNetwork, passingNetworkFromData, teamPositions, teamShape, zoneControl, distanceBetween } from '../core/tactics/analysis.js';
import { compile, positionAt } from '../core/animation/timeline.js';
import { FONT_NUM } from './marks.jsx';

const BANDS = [0.12, 0.25, 0.4, 0.55, 0.72, 0.88];

function HeatLayer({ grid, color }) {
  if (!grid || grid.max <= 0) return null;
  const paths = BANDS.map(() => '');
  for (let j = 0; j < grid.ny; j++) {
    for (let i = 0; i < grid.nx; i++) {
      const v = grid.values[j * grid.nx + i] / grid.max;
      let band = -1;
      for (let b = BANDS.length - 1; b >= 0; b--) if (v >= BANDS[b]) { band = b; break; }
      if (band >= 0) paths[band] += `M${i * grid.cell} ${j * grid.cell}h${grid.cell}v${grid.cell}h${-grid.cell}z`;
    }
  }
  return <g>{paths.map((d, b) => (d ? <path key={b} d={d} fill={color} opacity={0.1 + b * 0.09} /> : null))}</g>;
}

function ZonesLayer({ doc, t }) {
  const z = zoneControl(doc, t);
  let home = '';
  let away = '';
  for (let j = 0; j < z.ny; j++) {
    for (let i = 0; i < z.nx; i++) {
      const v = z.cells[j * z.nx + i];
      if (!v) continue;
      const seg = `M${i * z.cell} ${j * z.cell}h${z.cell}v${z.cell}h${-z.cell}z`;
      if (v > 0) home += seg; else away += seg;
    }
  }
  return (
    <g clipPath={undefined}>
      <path d={home} fill={doc.teams.home.color} opacity={0.26} />
      <path d={away} fill={doc.teams.away.color} opacity={0.26} />
    </g>
  );
}

function HullLayer({ doc, team, t, theme, showShape }) {
  const shape = teamShape(doc, team, t);
  if (!shape) return null;
  const color = doc.teams[team].color;
  const d = `M${shape.hull.map((p) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join('L')}Z`;
  const xs = shape.hull.map((p) => p.x);
  const ys = shape.hull.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  return (
    <g>
      <path d={d} fill={color} fillOpacity={0.18} stroke={color} strokeWidth={0.2} strokeLinejoin="round" />
      {showShape && (
        <g stroke={theme.overlay} strokeWidth={0.14}>
          {shape.lines.map((l, i) => <line key={i} x1={l.x} y1={l.minY - 1} x2={l.x} y2={l.maxY + 1} strokeDasharray="0.8 0.6" strokeOpacity={0.7} />)}
          <line x1={minX} y1={maxY + 3} x2={maxX} y2={maxY + 3} />
          <line x1={minX} y1={maxY + 2.4} x2={minX} y2={maxY + 3.6} />
          <line x1={maxX} y1={maxY + 2.4} x2={maxX} y2={maxY + 3.6} />
          <line x1={maxX + 3} y1={minY} x2={maxX + 3} y2={maxY} />
          <line x1={maxX + 2.4} y1={minY} x2={maxX + 3.6} y2={minY} />
          <line x1={maxX + 2.4} y1={maxY} x2={maxX + 3.6} y2={maxY} />
          <circle cx={shape.centroid.x} cy={shape.centroid.y} r={0.6} fill={theme.overlay} stroke={color} strokeWidth={0.2} />
        </g>
      )}
    </g>
  );
}

function NetworkLayer({ net, color, theme, rot }) {
  const max = Math.max(1, ...net.edges.map((e) => e.count));
  const involved = (n) => (n.sent ?? 0) + (n.received ?? 0);
  return (
    <g>
      {net.edges.map((e) => {
        const a = net.nodes[e.from];
        const b = net.nodes[e.to];
        if (!a || !b) return null;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const l = Math.hypot(dx, dy) || 1;
        const ox = (-dy / l) * 0.55;
        const oy = (dx / l) * 0.55;
        const w = 0.2 + (e.count / max) * 0.75;
        const ex = b.x - (dx / l) * 2.2 + ox;
        const ey = b.y - (dy / l) * 2.2 + oy;
        return (
          <g key={`${e.from}-${e.to}`}>
            <line x1={a.x + ox} y1={a.y + oy} x2={ex} y2={ey} stroke={theme.ballLine} strokeWidth={w} strokeOpacity={0.85} />
            <path d={`M${ex + (dx / l) * 1} ${ey + (dy / l) * 1}L${ex + ox * 1.1} ${ey + oy * 1.1}L${ex - ox * 1.1} ${ey - oy * 1.1}z`} fill={theme.ballLine} />
            <g transform={`translate(${(a.x + b.x) / 2 + ox * 2.4} ${(a.y + b.y) / 2 + oy * 2.4}) rotate(${-rot})`}>
              <text y={0.5} textAnchor="middle" fontFamily={FONT_NUM} fontWeight={600} fontSize={1.5} fill={theme.text} stroke={theme.ground} strokeWidth={0.3} style={{ paintOrder: 'stroke' }}>{e.count}</text>
            </g>
          </g>
        );
      })}
      {Object.values(net.nodes).map((n) => (
        <g key={n.id} transform={`translate(${n.x} ${n.y}) rotate(${-rot})`} opacity={involved(n) ? 1 : 0.45}>
          <circle r={1.25 + Math.min(1, involved(n) * 0.15)} fill={color} stroke="#fbfaf5" strokeWidth={0.14} />
          <text y={0.56} textAnchor="middle" fontFamily={FONT_NUM} fontWeight={600} fontSize={1.6} fill="#fff">{n.number}</text>
        </g>
      ))}
    </g>
  );
}

function LanesLayer({ doc, t, theme }) {
  const lanes = passingLanes(doc, t);
  if (!lanes) return null;
  return (
    <g>
      {lanes.lanes.map((l) => (
        <line
          key={l.to} x1={l.from.x} y1={l.from.y} x2={l.end.x} y2={l.end.y}
          stroke={l.open ? theme.ballLine : '#d9543f'} strokeWidth={l.open ? 0.22 : 0.14}
          strokeDasharray={l.open ? undefined : '0.5 0.6'} strokeOpacity={l.open ? 0.85 : 0.7}
        />
      ))}
    </g>
  );
}

function OffsideLayer({ doc, t, team, theme, rot }) {
  const o = offsideAnalysis(doc, team, t);
  const W = doc.pitch.width;
  const dir = o.attack === 'right' ? 1 : -1;
  const shadeX = dir > 0 ? o.lineX : 0;
  const shadeW = dir > 0 ? doc.pitch.length - o.lineX : o.lineX;
  return (
    <g>
      <rect x={shadeX} y={0} width={shadeW} height={W} fill="#d9543f" opacity={0.1} />
      <line x1={o.lineX} y1={-1.4} x2={o.lineX} y2={W + 1.4} stroke="#e8785f" strokeWidth={0.26} />
      {o.secondLast && <circle cx={o.secondLast.x} cy={o.secondLast.y} r={2.5} fill="none" stroke="#e8785f" strokeWidth={0.18} strokeDasharray="0.5 0.4" />}
      <g transform={`translate(${o.lineX + dir * 1.4 * 0} ${-2.4}) rotate(${-rot})`}>
        <path d={`M${-1.4 * dir} 0.6H${1.4 * dir}M${0.6 * dir} -0.2L${1.4 * dir} 0.6L${0.6 * dir} 1.4`} fill="none" stroke={theme.overlay} strokeWidth={0.18} />
      </g>
      {o.flagged.map((p) => (
        <g key={p.id}>
          <circle cx={p.x} cy={p.y} r={2.55} fill="#e8785f" fillOpacity={0.22} stroke="#e8785f" strokeWidth={0.2} />
        </g>
      ))}
    </g>
  );
}

function DistanceLayer({ doc, t, a, b, theme, rot }) {
  const compiled = compile(doc);
  const p = positionAt(compiled, a, t);
  const q = positionAt(compiled, b, t);
  if (!p || !q) return null;
  const d = distanceBetween(doc, a, b, t);
  return (
    <g>
      <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={theme.overlay} strokeWidth={0.18} strokeDasharray="0.6 0.4" />
      <g transform={`translate(${(p.x + q.x) / 2} ${(p.y + q.y) / 2}) rotate(${-rot})`}>
        <text y={-0.6} textAnchor="middle" fontFamily={FONT_NUM} fontWeight={600} fontSize={1.9} fill={theme.text} stroke={theme.ground} strokeWidth={0.36} style={{ paintOrder: 'stroke' }}>{d.toFixed(1)} m</text>
      </g>
    </g>
  );
}

/** Analysis overlays at time t. Everything drawn is computed from the document or an imported file. */
export const AnalysisStatic = memo(function AnalysisStatic({ doc, t, analysis, theme, rot = 0, pair }) {
  const team = analysis.team ?? 'home';
  const compiled = compile(doc);
  const from = analysis.from ?? 0;
  const to = analysis.to ?? compiled.duration;
  const data = analysis.useDataset ? analysis.dataset : null;
  const dataTeam = data ? (data.teams.includes(analysis.dataTeam) ? analysis.dataTeam : data.teams[0]) : null;
  const ids = teamPositions(doc, team, 0).map((p) => p.id);

  let heat = null;
  if (analysis.heatmap) {
    if (data) heat = heatmapFromData(doc.pitch, data.events.filter((e) => e.team === dataTeam));
    else if (analysis.heatTarget === 'ball') heat = ballHeatmap(doc, from, to);
    else if (analysis.heatTarget === 'selected' && pair?.length) heat = heatmapFromTimeline(doc, pair, from, to);
    else heat = heatmapFromTimeline(doc, ids, from, to);
  }
  let net = null;
  if (analysis.network) net = data ? passingNetworkFromData(data, dataTeam) : passingNetwork(doc, team, from, to);

  return (
    <g pointerEvents="none">
      {analysis.zones && <ZonesLayer doc={doc} t={t} />}
      {heat && <HeatLayer grid={heat} color={theme.ballLine} />}
      {analysis.hull && !data && <HullLayer doc={doc} team={team} t={t} theme={theme} showShape={false} />}
      {analysis.shape && !data && <HullLayer doc={doc} team={team} t={t} theme={theme} showShape />}
      {analysis.lanes && !data && <LanesLayer doc={doc} t={t} theme={theme} />}
      {analysis.offside && <OffsideLayer doc={doc} t={t} team={team} theme={theme} rot={rot} />}
      {net && <NetworkLayer net={net} color={data ? theme.overlay && doc.teams.home.color : doc.teams[team].color} theme={theme} rot={rot} />}
      {analysis.distance && pair?.length === 2 && <DistanceLayer doc={doc} t={t} a={pair[0]} b={pair[1]} theme={theme} rot={rot} />}
    </g>
  );
});
