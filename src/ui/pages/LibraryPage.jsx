import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Download, LayoutGrid, List, Pencil, Search, Trash2, Upload } from 'lucide-react';
import { StaticBoard } from '../../board/StaticBoard.jsx';
import { getTheme } from '../../core/pitch/themes.js';
import { CATEGORIES, duplicateDocument } from '../../core/document.js';
import { EXAMPLES, exampleDocs } from '../../core/data/examples.js';
import { LESSONS } from '../../core/data/learn.js';
import { PlaybackController } from '../../core/animation/playback.js';
import { compile } from '../../core/animation/timeline.js';
import { duplicateSavedDocument, listDocuments, saveDocument } from '../../core/storage/repository.js';
import { useEditor, getEditor } from '../../state/editorStore.js';
import { deleteSaved, exportJsonText, importDocumentFile, openExample, openLesson, openSaved, newFromScratch } from '../../state/actions.js';
import { IconButton, Segmented } from '../common.jsx';
import { SessionsTab } from '../panels/DrillsPanel.jsx';

const Thumb = memo(function Thumb({ doc }) {
  return (
    <span className="thumb-frame" style={{ background: getTheme(doc.pitch.theme).surround }}>
      <StaticBoard doc={doc} t={0} className="thumb" title={`Diagram of ${doc.title}`} />
    </span>
  );
});

function when(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function PlaybookTab() {
  const [docs, setDocs] = useState(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [tag, setTag] = useState(null);
  const [view, setView] = useState('grid');
  const fileRef = useRef(null);
  const openDocId = useEditor((s) => s.doc.id);

  const refresh = useCallback(() => listDocuments().then(setDocs).catch(() => setDocs([])), []);
  useEffect(() => { refresh(); }, [refresh]);

  const tags = useMemo(() => [...new Set((docs ?? []).flatMap((d) => d.tags))].sort(), [docs]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (docs ?? []).filter((d) => {
      if (category !== 'All' && d.category !== category) return false;
      if (tag && !d.tags.includes(tag)) return false;
      if (!q) return true;
      return [d.title, d.description, d.category, ...d.tags].some((v) => v?.toLowerCase().includes(q));
    });
  }, [docs, query, category, tag]);

  const exportOne = async (d) => {
    const { downloadBlob, safeFilename } = await import('../../export/render.js');
    downloadBlob(new Blob([exportJsonText(d)], { type: 'application/json' }), safeFilename(d.title, 'pitchlab.json'));
  };

  return (
    <>
      <div className="lib-toolbar">
        <label className="search">
          <Search size={15} aria-hidden="true" />
          <span className="sr-only">Search plays</span>
          <input type="search" data-testid="library-search" placeholder="Search titles, descriptions and tags" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
        </label>
        <select className="input input-sm" aria-label="Filter by category" data-testid="library-category" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option>All</option>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        {tags.length > 0 && (
          <select className="input input-sm" aria-label="Filter by tag" value={tag ?? ''} onChange={(e) => setTag(e.target.value || null)}>
            <option value="">All tags</option>
            {tags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        <span className="grow" />
        <button type="button" className="btn btn-sm" data-testid="import-file" onClick={() => fileRef.current.click()}><Upload size={13} aria-hidden="true" /> Import a play</button>
        <IconButton icon={LayoutGrid} label="Grid view" active={view === 'grid'} onClick={() => setView('grid')} />
        <IconButton icon={List} label="List view" active={view === 'list'} onClick={() => setView('list')} />
        <input ref={fileRef} data-testid="import-input" type="file" accept=".json,application/json" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { await importDocumentFile(f); refresh(); } }} />
      </div>
      {docs && docs.length === 0 && (
        <div className="lib-empty">
          <h3>Nothing saved yet</h3>
          <p>Plays you edit are saved here automatically, in this browser. Open an example, or start with an empty board.</p>
          <button type="button" className="btn btn-primary" onClick={() => newFromScratch()}>Start a new play</button>
        </div>
      )}
      {docs && docs.length > 0 && shown.length === 0 && <p className="empty">No plays match this search.</p>}
      <ul className={view === 'grid' ? 'lib-grid' : 'lib-list'} data-testid="library-items">
        {shown.map((d) => (
          <li key={d.id} className={`card ${d.id === openDocId ? 'is-open' : ''}`}>
            <button type="button" className="card-open" data-testid="library-open" aria-label={`Open ${d.title}`} onClick={() => openSaved(d.id)}>
              <Thumb doc={d} />
            </button>
            <div className="card-text">
              <h4>{d.title}</h4>
              <p><span>{d.category}</span> <time>{when(d.updatedAt)}</time></p>
              {d.tags.length > 0 && <p className="card-tags">{d.tags.join(', ')}</p>}
            </div>
            <div className="card-actions">
              <IconButton icon={Pencil} size={14} label={`Edit ${d.title}`} onClick={() => openSaved(d.id)} />
              <IconButton icon={Copy} size={14} label={`Duplicate ${d.title}`} onClick={async () => { await duplicateSavedDocument(d.id); refresh(); }} />
              <IconButton icon={Download} size={14} label={`Export ${d.title}`} onClick={() => exportOne(d)} />
              <IconButton icon={Trash2} size={14} label={`Delete ${d.title}`} data-testid="library-delete" onClick={() => deleteSaved(d, refresh)} />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function ExamplesTab() {
  const docs = exampleDocs();
  const copyToPlaybook = async (i) => {
    const copy = duplicateDocument(EXAMPLES[i].build(), { title: docs[i].title });
    await saveDocument(copy);
    getEditor().toast(`Added "${copy.title}" to your playbook`);
  };
  return (
    <ul className="lib-grid">
      {docs.map((d, i) => (
        <li key={d.id} className="card">
          <button type="button" className="card-open" data-testid={`lib-example-${EXAMPLES[i].id}`} aria-label={`Open ${d.title}`} onClick={() => openExample(EXAMPLES[i].id)}>
            <Thumb doc={d} />
          </button>
          <div className="card-text">
            <h4>{d.title}</h4>
            <p className="card-desc">{d.description}</p>
          </div>
          <div className="card-actions">
            <button type="button" className="btn btn-sm" onClick={() => copyToPlaybook(i)}>Add to playbook</button>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Own small playhead, so a lesson never touches the document open on the board. */
function LessonPlayer({ doc }) {
  const [t, setT] = useState(0);
  const pc = useMemo(() => {
    const c = new PlaybackController();
    c.setDuration(compile(doc).duration);
    c.setLoop(true);
    return c;
  }, [doc]);
  useEffect(() => {
    const off = pc.onFrame(setT);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduced) pc.play();
    return () => { off(); pc.pause(); };
  }, [pc]);
  const [playing, setPlaying] = useState(!matchMedia('(prefers-reduced-motion: reduce)').matches);
  const duration = compile(doc).duration;
  return (
    <figure className="lesson-player">
      <StaticBoard doc={doc} t={t} showLines="all" title={`Animated example: ${doc.title}`} />
      <figcaption>
        <button type="button" className="btn btn-sm" onClick={() => { pc.toggle(); setPlaying(pc.playing); }}>{playing ? 'Pause' : 'Play'}</button>
        <input type="range" min={0} max={duration} step={0.01} value={t} aria-label="Scrub the example" onChange={(e) => { pc.pause(); setPlaying(false); pc.seek(Number(e.target.value)); }} />
      </figcaption>
    </figure>
  );
}

function LearnTab() {
  const [active, setActive] = useState(LESSONS[0].id);
  const lesson = LESSONS.find((l) => l.id === active);
  const doc = useMemo(() => lesson.build(), [lesson]);
  return (
    <div className="learn">
      <ul className="linklist learn-nav">
        {LESSONS.map((l) => (
          <li key={l.id}><button type="button" data-testid={`lesson-${l.id}`} className={l.id === active ? 'is-sel' : ''} aria-current={l.id === active} onClick={() => setActive(l.id)}><span>{l.title}</span></button></li>
        ))}
      </ul>
      <article className="learn-body">
        <h3>{lesson.title}</h3>
        <p className="lede">{lesson.explain}</p>
        <LessonPlayer key={doc.id} doc={doc} />
        <h4>Coaching points</h4>
        <ul className="points">{lesson.points.map((p) => <li key={p}>{p}</li>)}</ul>
        <p className="field-hint">One way to show the idea. What suits your team depends on your players and your opponent.</p>
        <button type="button" className="btn" data-testid="lesson-open" onClick={() => openLesson(lesson.id)}>Open on the board to edit</button>
      </article>
    </div>
  );
}

export function LibraryPage() {
  const [tab, setTab] = useState('playbook');
  return (
    <main className="page library" data-testid="library">
      <div className="page-head">
        <h1>Library</h1>
        <Segmented label="Library section" value={tab} onChange={setTab} options={[{ value: 'playbook', label: 'Playbook' }, { value: 'examples', label: 'Examples' }, { value: 'learn', label: 'Learn' }, { value: 'sessions', label: 'Sessions' }]} />
      </div>
      {tab === 'playbook' && <PlaybookTab />}
      {tab === 'examples' && <ExamplesTab />}
      {tab === 'learn' && <LearnTab />}
      {tab === 'sessions' && <SessionsTab />}
    </main>
  );
}
