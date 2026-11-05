import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Check as CheckIcon, Copy, Printer } from 'lucide-react';
import { StaticBoard } from '../board/StaticBoard.jsx';
import { compile } from '../core/animation/timeline.js';
import { summarize } from '../core/tactics/summary.js';
import { buildShareLink, SHARE_SOFT_LIMIT } from '../core/storage/share.js';
import { useEditor, getEditor } from '../state/editorStore.js';
import { transport } from '../state/transport.js';
import { camera } from '../board/camera.js';
import { saveAsCopy, exportJsonText } from '../state/actions.js';
import { Check, Field, Modal, Segmented } from './common.jsx';
import { ShortcutTable } from './pages/SettingsPage.jsx';

const Replay3D = lazy(() => import('../replay/Replay3D.jsx'));

function ExportModal({ onClose }) {
  const doc = useEditor((s) => s.doc);
  const labelMode = useEditor((s) => s.labelMode);
  const analysis = useEditor((s) => s.analysis);
  const compiled = compile(doc);
  const [moment, setMoment] = useState('now');
  const [lines, setLines] = useState('all');
  const [caption, setCaption] = useState(true);
  const [useAnalysis, setUseAnalysis] = useState(false);
  const [busy, setBusy] = useState(null);
  const [progress, setProgress] = useState(0);
  const [videoInfo, setVideoInfo] = useState(undefined);
  const abortRef = useRef(null);
  const t = moment === 'now' ? transport.t : 0;
  const rot = Math.round(camera.target.rot) % 360;
  const hasAnalysis = analysis.hull || analysis.shape || analysis.network || analysis.heatmap || analysis.lanes || analysis.zones || analysis.offside;

  useEffect(() => {
    let alive = true;
    import('../export/animation.js').then((m) => m.videoSupport()).then((s) => { if (alive) setVideoInfo(s); }).catch(() => { if (alive) setVideoInfo(null); });
    return () => { alive = false; abortRef.current?.abort(); };
  }, []);

  const opts = { t, rot, showLines: lines, labelMode, analysis: useAnalysis ? analysis : null };

  const run = async (label, fn) => {
    const focused = document.activeElement;
    setBusy(label);
    setProgress(0);
    try {
      await fn();
    } catch (e) {
      if (e.name !== 'AbortError') getEditor().toast(`Export failed: ${e.message}`, { kind: 'warn', duration: 8000 });
    }
    setBusy(null);
    // The button was disabled while busy, which drops keyboard focus. Put it back.
    setTimeout(() => focused?.focus?.(), 0);
  };

  const render = () => import('../export/render.js');

  const png = (width) => run('Image', async () => {
    const r = await render();
    const { blob, width: w, height: h } = await r.boardPng(doc, { ...opts, width, caption });
    r.downloadBlob(blob, r.safeFilename(doc.title, 'png'));
    getEditor().toast(`Saved a ${w} by ${h} PNG`);
  });
  const svg = () => run('SVG', async () => {
    const r = await render();
    const text = await r.boardSvgFile(doc, { ...opts, caption: caption ? { title: doc.title } : null });
    r.downloadBlob(new Blob([text], { type: 'image/svg+xml' }), r.safeFilename(doc.title, 'svg'));
  });
  const json = () => run('JSON', async () => {
    const r = await render();
    r.downloadBlob(new Blob([exportJsonText(doc)], { type: 'application/json' }), r.safeFilename(doc.title, 'pitchlab.json'));
  });
  const copy = () => run('Copy', async () => {
    const r = await render();
    const { blob } = await r.boardPng(doc, { ...opts, width: 1600, caption });
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    getEditor().toast('Copied the diagram');
  });
  const gif = () => run('GIF', async () => {
    abortRef.current = new AbortController();
    const [r, a] = await Promise.all([render(), import('../export/animation.js')]);
    const blob = await a.exportGif(doc, { rot, showLines: 'active', labelMode, caption, onProgress: setProgress, signal: abortRef.current.signal });
    r.downloadBlob(blob, r.safeFilename(doc.title, 'gif'));
  });
  const video = () => run('Video', async () => {
    abortRef.current = new AbortController();
    const [r, a] = await Promise.all([render(), import('../export/animation.js')]);
    const blob = await a.exportVideo(doc, { rot, showLines: 'active', labelMode, caption, onProgress: setProgress, signal: abortRef.current.signal, support: videoInfo });
    r.downloadBlob(blob, r.safeFilename(doc.title, videoInfo.ext));
  });

  const hasAnimation = compiled.duration > 0;
  return (
    <Modal title="Export" onClose={onClose} width={720}>
      <div className="export-grid">
        <div className="export-preview">
          <StaticBoard doc={doc} t={t} rot={rot} showLines={lines} labelMode={labelMode} caption={caption ? { title: doc.title } : null} analysis={useAnalysis ? analysis : null} title="Preview of the export" />
        </div>
        <div className="stack">
          <Field label="Moment">
            <Segmented small label="Moment" value={moment} onChange={setMoment} options={[{ value: 'start', label: 'Start of the play' }, { value: 'now', label: `Playhead (${transport.t.toFixed(1)} s)` }]} />
          </Field>
          <Field label="Lines">
            <Segmented small label="Lines" value={lines} onChange={setLines} options={[{ value: 'all', label: 'All' }, { value: 'active', label: 'Current' }, { value: 'none', label: 'None' }]} />
          </Field>
          <Check checked={caption} onChange={setCaption} id="ex-caption">Add a title strip</Check>
          {hasAnalysis && <Check checked={useAnalysis} onChange={setUseAnalysis} id="ex-analysis">Include analysis overlays</Check>}
          <div className="export-buttons">
            <button type="button" className="btn" data-testid="export-png" disabled={!!busy} onClick={() => png(2400)}>PNG, 2400 px</button>
            <button type="button" className="btn" disabled={!!busy} onClick={() => png(4800)}>PNG, 4800 px</button>
            <button type="button" className="btn" data-testid="export-svg" disabled={!!busy} onClick={svg}>SVG</button>
            <button type="button" className="btn" data-testid="export-json" disabled={!!busy} onClick={json}>JSON</button>
            <button type="button" className="btn" data-testid="export-copy" disabled={!!busy} onClick={copy}>Copy image</button>
          </div>
          <h4 className="minor">Animation</h4>
          {hasAnimation ? (
            <div className="export-buttons">
              <button type="button" className="btn" data-testid="export-gif" disabled={!!busy} onClick={gif}>GIF, 720 px</button>
              {videoInfo && <button type="button" className="btn" data-testid="export-video" disabled={!!busy} onClick={video}>{videoInfo.ext.toUpperCase()} video, 1280 px</button>}
            </div>
          ) : <p className="field-hint">Add events to the timeline to export an animation.</p>}
          {videoInfo === null && hasAnimation && <p className="field-hint">This browser cannot encode video, so GIF is the animated option here.</p>}
          {busy && (
            <div className="progress" role="status">
              <span>Exporting {busy}</span>
              {progress > 0 && <progress max={1} value={progress} />}
              {abortRef.current && progress > 0 && <button type="button" className="linkbtn" onClick={() => abortRef.current.abort()}>Cancel</button>}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function ShareModal({ onClose }) {
  const doc = useEditor((s) => s.doc);
  const [link, setLink] = useState(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let alive = true;
    buildShareLink(doc, window.location.origin).then((l) => { if (alive) setLink(l); });
    return () => { alive = false; };
  }, [doc]);
  const copy = async () => {
    await navigator.clipboard.writeText(link.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <Modal title="Share a read-only link" onClose={onClose}>
      <p className="prose">The play is stored inside the link itself, so nothing is uploaded and no account is needed. Anyone with the link can watch it and make their own copy. Later edits do not change a link you have already shared.</p>
      {link && !link.tooLong && (
        <div className="inline-form">
          <input className="input" readOnly value={link.url} aria-label="Share link" data-testid="share-url" onFocus={(e) => e.target.select()} />
          <button type="button" className="btn btn-primary" data-testid="share-copy" onClick={copy}>{copied ? <><CheckIcon size={14} aria-hidden="true" /> Copied</> : <><Copy size={14} aria-hidden="true" /> Copy</>}</button>
        </div>
      )}
      {link && <p className="field-hint" data-testid="share-length">This link is {link.length.toLocaleString()} characters long.</p>}
      {link?.risky && !link.tooLong && <p className="issue">Links over {SHARE_SOFT_LIMIT.toLocaleString()} characters can be cut off by some chat and email apps. If that happens, export JSON and send the file.</p>}
      {link?.tooLong && <p className="issue is-error">This play is too large for a link. Export it as JSON and send the file instead.</p>}
    </Modal>
  );
}

function SaveAsModal({ onClose }) {
  const title = useEditor((s) => s.doc.title);
  const [name, setName] = useState(`${title} copy`);
  return (
    <Modal title="Save a copy" onClose={onClose} width={420} footer={<button type="button" className="btn btn-primary" data-testid="saveas-confirm" onClick={async () => { await saveAsCopy(name.trim() || 'Untitled play'); onClose(); }}>Save copy</button>}>
      <Field label="Name" htmlFor="saveas-name"><input id="saveas-name" className="input" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.stopPropagation()} /></Field>
    </Modal>
  );
}

function PrintModal({ session, drills, onClose }) {
  useEffect(() => {
    document.body.classList.add('printing');
    return () => document.body.classList.remove('printing');
  }, []);
  const total = drills.reduce((s, d) => s + (d.drill?.durationMin ?? 0), 0);
  return (
    <Modal title="Session plan" onClose={onClose} width={860} footer={<button type="button" className="btn btn-primary" onClick={() => window.print()}><Printer size={14} aria-hidden="true" /> Print</button>}>
      <div className="print-sheet" data-testid="print-sheet">
        <header>
          <h1>{session.title}</h1>
          <p>{drills.length} drills, {total} minutes</p>
          {session.notes && <p>{session.notes}</p>}
        </header>
        {drills.map((d, i) => {
          const m = d.drill ?? {};
          const rows = [['Objective', m.objective], ['Players', m.players], ['Equipment', m.equipment], ['Field size', m.fieldSize], ['Instructions', m.instructions], ['Coaching points', m.coachingPoints], ['Progressions', m.progressions], ['Variations', m.variations]].filter(([, v]) => v);
          return (
            <article key={`${d.id}-${i}`} className="print-drill">
              <h2>{i + 1}. {d.title} <small>{m.durationMin ?? 0} min</small></h2>
              <div className="print-cols">
                <StaticBoard doc={d} t={0} title={`Diagram of ${d.title}`} />
                <dl>{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
              </div>
            </article>
          );
        })}
        <footer>pitchlab</footer>
      </div>
    </Modal>
  );
}

function SummaryModal({ onClose }) {
  const doc = useEditor((s) => s.doc);
  const text = useMemo(() => summarize(doc).map((l) => l.line).join('\n'), [doc]);
  return (
    <Modal title="Play summary" onClose={onClose}>
      <pre className="summary-text">{text || 'This play has no events yet.'}</pre>
    </Modal>
  );
}

export function Modals() {
  const modal = useEditor((s) => s.modal);
  const close = useEditor((s) => s.closeModal);
  if (!modal) return null;
  const type = typeof modal === 'string' ? modal : modal.type;
  switch (type) {
    case 'export': return <ExportModal onClose={close} />;
    case 'share': return <ShareModal onClose={close} />;
    case 'saveas': return <SaveAsModal onClose={close} />;
    case 'summary': return <SummaryModal onClose={close} />;
    case 'print': return <PrintModal session={modal.session} drills={modal.drills} onClose={close} />;
    case 'shortcuts': return <Modal title="Keyboard shortcuts" onClose={close} width={720}><ShortcutTable /></Modal>;
    case 'replay': return <Suspense fallback={<Modal title="3D replay" onClose={close}><p className="prose">Loading the 3D view.</p></Modal>}><Replay3D onClose={close} /></Suspense>;
    default: return null;
  }
}
