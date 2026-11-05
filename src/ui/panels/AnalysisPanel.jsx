import { useEffect, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { offsideAnalysis, passingLanes, passingNetwork, passingNetworkFromData, teamShape, zoneControl } from '../../core/tactics/analysis.js';
import { compile, ownerAt } from '../../core/animation/timeline.js';
import { importMatchData, SAMPLE_MATCH_CSV } from '../../core/storage/matchData.js';
import { objectLabel } from '../../core/tactics/events.js';
import { useEditor, getEditor } from '../../state/editorStore.js';
import { transport } from '../../state/transport.js';
import { Check, Field, NumberInput, SectionTitle, Segmented } from '../common.jsx';

function useSlowTime() {
  const [t, setT] = useState(transport.t);
  useEffect(() => {
    let last = 0;
    return transport.onFrame((now) => {
      const wall = performance.now();
      if (!transport.playing || wall - last > 250) { last = wall; setT(now); }
    });
  }, []);
  return t;
}

function Metric({ label, value, unit }) {
  return <div className="metric"><dt>{label}</dt><dd>{value}{unit ? <small> {unit}</small> : null}</dd></div>;
}

export function AnalysisPanel() {
  const doc = useEditor((s) => s.doc);
  const analysis = useEditor((s) => s.analysis);
  const setAnalysis = useEditor((s) => s.setAnalysis);
  const selection = useEditor((s) => s.selection);
  const t = useSlowTime();
  const fileRef = useRef(null);
  const team = analysis.team;
  const compiled = compile(doc);
  const shape = teamShape(doc, team, t);
  const data = analysis.useDataset ? analysis.dataset : null;
  const from = analysis.from ?? 0;
  const to = analysis.to ?? compiled.duration;
  const network = analysis.network ? (data ? passingNetworkFromData(data, data.teams.includes(analysis.dataTeam) ? analysis.dataTeam : data.teams[0]) : passingNetwork(doc, team, from, to)) : null;
  const offside = analysis.offside ? offsideAnalysis(doc, team, t) : null;
  const zones = analysis.zones ? zoneControl(doc, t) : null;
  const lanes = analysis.lanes ? passingLanes(doc, t) : null;
  const toggle = (k) => (v) => setAnalysis({ [k]: v });
  const owner = ownerAt(compiled, t);

  const loadText = (text, name, format) => {
    const res = importMatchData(text, format, doc.pitch, name);
    if (!res.ok) { getEditor().toast(res.errors[0], { kind: 'warn', duration: 8000 }); return; }
    setAnalysis({ dataset: res.dataset, useDataset: true, network: true, dataTeam: res.dataset.teams[0] });
    getEditor().toast(`Imported ${res.dataset.events.length} events from ${name}.`);
    for (const w of res.warnings) getEditor().toast(w, { kind: 'warn' });
  };
  const onFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    loadText(await f.text(), f.name, f.name.toLowerCase().endsWith('.json') ? 'json' : 'csv');
  };

  return (
    <>
      <p className="field-hint">Everything here is calculated from the positions and events in this play, or from a file you import. pitchlab has no match tracking data of its own.</p>
      <Field label="Team">
        <Segmented label="Team" value={team} onChange={(v) => setAnalysis({ team: v })} options={[{ value: 'home', label: doc.teams.home.name }, { value: 'away', label: doc.teams.away.name }]} />
      </Field>

      <SectionTitle>Shape at {t.toFixed(1)} s</SectionTitle>
      <div className="stack-sm">
        <Check checked={analysis.hull} onChange={toggle('hull')} id="a-hull">Convex hull</Check>
        <Check checked={analysis.shape} onChange={toggle('shape')} id="a-shape">Width, depth and lines</Check>
      </div>
      {shape && (
        <dl className="metrics" data-testid="metrics">
          <Metric label="Width" value={shape.width.toFixed(1)} unit="m" />
          <Metric label="Depth" value={shape.depth.toFixed(1)} unit="m" />
          <Metric label="Area covered" value={Math.round(shape.area)} unit="m²" />
          <Metric label="Nearest team-mate, on average" value={shape.meanNearest.toFixed(1)} unit="m" />
          {shape.lines.length === 3 && <Metric label="Back to middle line" value={(shape.lines[1].x - shape.lines[0].x).toFixed(1)} unit="m" />}
          {shape.lines.length === 3 && <Metric label="Middle to front line" value={(shape.lines[2].x - shape.lines[1].x).toFixed(1)} unit="m" />}
        </dl>
      )}
      <p className="field-hint">Measured across outfield players, leaving out the goalkeeper.</p>

      <SectionTitle>Passing</SectionTitle>
      <div className="stack-sm">
        <Check checked={analysis.network} onChange={toggle('network')} id="a-network">Passing network</Check>
        <Check checked={analysis.lanes} onChange={toggle('lanes')} id="a-lanes">Passing lanes from the ball carrier</Check>
      </div>
      {network && (
        <p className="field-hint" data-testid="network-count">
          {network.total === 0 ? 'No completed passes for this team yet. Add passes to the timeline, or import data.' : `${network.total} passes over ${network.edges.length} connections. Line weight shows how many.`}
        </p>
      )}
      {lanes && <p className="field-hint">{objectLabel(doc.objects[lanes.owner])} has {lanes.lanes.filter((l) => l.open).length} open lanes out of {lanes.lanes.length}. A lane counts as closed if an opponent is within 1.6 m of it.</p>}
      {analysis.lanes && !owner && <p className="field-hint">Nobody has the ball at this moment.</p>}

      <SectionTitle>Space</SectionTitle>
      <div className="stack-sm">
        <Check checked={analysis.heatmap} onChange={toggle('heatmap')} id="a-heat">Heatmap</Check>
        {analysis.heatmap && !data && (
          <Segmented small label="Heatmap of" value={analysis.heatTarget} onChange={(v) => setAnalysis({ heatTarget: v })} options={[{ value: 'team', label: 'Team' }, { value: 'selected', label: 'Selected' }, { value: 'ball', label: 'Ball' }]} />
        )}
        {analysis.heatmap && !data && compiled.duration === 0 && <p className="field-hint">With no animation, this shows starting positions only.</p>}
        <Check checked={analysis.zones} onChange={toggle('zones')} id="a-zones">Zone control estimate</Check>
      </div>
      {zones && (
        <dl className="metrics">
          <Metric label={doc.teams.home.name} value={Math.round(zones.homeShare * 100)} unit="%" />
          <Metric label={doc.teams.away.name} value={Math.round(zones.awayShare * 100)} unit="%" />
        </dl>
      )}
      {analysis.zones && <p className="field-hint">An approximation: each patch of pitch goes to the nearest player. It ignores speed, facing and the ball.</p>}
      <Check checked={analysis.distance} onChange={toggle('distance')} id="a-distance">Distance between two selected players</Check>
      {analysis.distance && selection.objects.length !== 2 && <p className="field-hint">Shift-click two players.</p>}
      {compiled.duration > 0 && (analysis.network || analysis.heatmap) && !data && (
        <div className="grid-2">
          <Field label="From"><NumberInput value={from} unit="s" step={0.5} min={0} onCommit={(v) => setAnalysis({ from: v })} /></Field>
          <Field label="To"><NumberInput value={to} unit="s" step={0.5} min={0} onCommit={(v) => setAnalysis({ to: v })} /></Field>
        </div>
      )}

      <SectionTitle>Offside position</SectionTitle>
      <Check checked={analysis.offside} onChange={toggle('offside')} id="a-offside">Show the offside line for {doc.teams[team].name}</Check>
      {offside && (
        <div className="callout" data-testid="offside-result">
          <p><strong>{offside.flagged.length === 0 ? 'No attacker is in an offside position.' : `In an offside position: ${offside.flagged.map((p) => `#${p.number}`).join(', ')}.`}</strong></p>
          <p>The line is set by {offside.limitedBy === 'second-last' ? 'the second-last opponent' : offside.limitedBy === 'ball' ? 'the ball' : 'the halfway line'}. {doc.teams[team].name} attacks the {offside.attack} goal.</p>
          {!offside.enoughDefenders && <p>There are fewer than two opponents on the board, so the line cannot be worked out properly.</p>}
        </div>
      )}
      <p className="field-hint">
        A learning aid, not a ruling. Under Law 11 (IFAB Laws of the Game 2026/27), a player is in an offside position if any part of the head, body or feet is in the opponents&apos; half and nearer the goal line than both the ball and the second-last opponent. Arms and hands do not count, and level is onside. Being in that position is not an offence: the player must also become involved in active play, and there is no offence from a goal kick, throw-in or corner. This tool uses player centres, so it cannot judge tight calls.
      </p>

      <SectionTitle>Match data</SectionTitle>
      <p className="field-hint">Import events as CSV or JSON, with team, player, type, x and y columns. Optional: receiver, end_x, end_y, minute. Coordinates are scaled to this pitch.</p>
      <div className="action-row wrap">
        <button type="button" className="btn btn-sm" data-testid="import-data" onClick={() => fileRef.current.click()}><Upload size={13} aria-hidden="true" /> Import a file</button>
        <button type="button" className="btn btn-sm" data-testid="sample-data" onClick={() => loadText(SAMPLE_MATCH_CSV, 'synthetic sample', 'csv')}>Try a synthetic sample</button>
      </div>
      <input ref={fileRef} type="file" accept=".csv,.json,text/csv,application/json" hidden onChange={onFile} />
      {analysis.dataset && (
        <div className="stack-sm">
          <Check checked={analysis.useDataset} onChange={toggle('useDataset')} id="a-data">Use {analysis.dataset.source} for the network and heatmap</Check>
          <p className="field-hint">{analysis.dataset.events.length} of {analysis.dataset.rowCount} rows loaded. Coordinates read as {analysis.dataset.scale}. {analysis.dataset.source === 'synthetic sample' ? 'This sample is invented for trying the importer and describes no real match.' : ''}</p>
          {analysis.dataset.teams.length > 1 && (
            <Segmented small label="Team in the data" value={analysis.dataTeam} onChange={(v) => setAnalysis({ dataTeam: v })} options={analysis.dataset.teams.slice(0, 4).map((name) => ({ value: name, label: name }))} />
          )}
        </div>
      )}
    </>
  );
}
