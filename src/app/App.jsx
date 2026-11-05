import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Copy, ListOrdered, Play, X } from 'lucide-react';
import { Board } from '../board/Board.jsx';
import { camera, prefersReducedMotion } from '../board/camera.js';
import { fx } from '../board/fx.js';
import { compile, positionAt } from '../core/animation/timeline.js';
import { placeObjectAt, duplicateDocument, translateAnnotation } from '../core/document.js';
import { getEditor, useEditor } from '../state/editorStore.js';
import { transport } from '../state/transport.js';
import { addKeyframeForSelection, newFromScratch, openExample, saveNow } from '../state/actions.js';
import { boot, startAutosave } from '../state/persistence.js';
import { isEditableTarget } from '../state/shortcuts.js';
import { Modals } from '../ui/Modals.jsx';
import { ContextMenu } from '../ui/ContextMenu.jsx';
import { Inspector } from '../ui/Inspector.jsx';
import { stepEvent, Timeline, togglePlay, TransportControls, useTransportState } from '../ui/Timeline.jsx';
import { ToolHint, ToolRail } from '../ui/ToolRail.jsx';
import { Topbar } from '../ui/Topbar.jsx';
import { ViewControls } from '../ui/ViewControls.jsx';
import { IconButton, Toasts, usePanelEntrance, Wordmark } from '../ui/common.jsx';
import { AnalysisPanel } from '../ui/panels/AnalysisPanel.jsx';
import { DrillsPanel } from '../ui/panels/DrillsPanel.jsx';
import { FormationsPanel } from '../ui/panels/FormationsPanel.jsx';
import { PlaysPanel } from '../ui/panels/PlaysPanel.jsx';
import { LibraryPage } from '../ui/pages/LibraryPage.jsx';
import { SettingsPage } from '../ui/pages/SettingsPage.jsx';

const PANELS = {
  plays: { title: 'Plays', Component: PlaysPanel },
  formations: { title: 'Formations', Component: FormationsPanel },
  drills: { title: 'Drills', Component: DrillsPanel },
  analysis: { title: 'Analysis', Component: AnalysisPanel },
};

function SectionPanel({ section }) {
  const ref = useRef(null);
  const setSection = useEditor((s) => s.setSection);
  usePanelEntrance(ref, { x: -10 }, [section]);
  const P = PANELS[section];
  return (
    <aside className="sidepanel" ref={ref} aria-label={P.title}>
      <div className="panel-head">
        <h2>{P.title}</h2>
        <IconButton icon={X} label={`Close ${P.title.toLowerCase()}`} onClick={() => setSection('board')} />
      </div>
      <div className="panel-body"><P.Component /></div>
    </aside>
  );
}

function useKeyboard() {
  useEffect(() => {
    const onKey = (e) => {
      const ed = getEditor();
      const meta = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (isEditableTarget(e.target)) {
        if (meta && key === 's') { e.preventDefault(); saveNow(); }
        return;
      }
      if (ed.presentation && e.key === 'Escape') { ed.setPresentation(false); return; }
      if (ed.modal) {
        // Focus can leave a dialog when the button holding it becomes disabled.
        if (e.key === 'Escape') ed.closeModal();
        return;
      }

      if (meta) {
        if (key === 'z') { e.preventDefault(); if (e.shiftKey) ed.redo(); else ed.undo(); }
        else if (key === 'y') { e.preventDefault(); ed.redo(); }
        else if (key === 's') {
          e.preventDefault();
          if (e.shiftKey) ed.openModal('saveas');
          else saveNow();
        } else if (key === 'd') { e.preventDefault(); ed.duplicateSelection(); }
        else if (key === 'c') { if (ed.copySelection()) ed.toast('Copied'); }
        else if (key === 'v') { ed.paste(); }
        else if (key === 'a') {
          e.preventDefault();
          ed.select({ objects: Object.values(ed.doc.objects).filter((o) => !o.locked && !o.hidden).map((o) => o.id) });
        }
        return;
      }

      if (e.key === ' ') {
        if (e.target.tagName === 'BUTTON') return;
        e.preventDefault();
        togglePlay();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); ed.deleteSelection(); return; }
      if (e.key === 'Escape') {
        if (ed.menu) { ed.openMenu(null); return; }
        if (ed.tool !== 'select') ed.setTool('select');
        else ed.clearSelection();
        return;
      }
      if (e.key === '?') { ed.openModal('shortcuts'); return; }
      if (e.key === '[') { stepEvent(-1); return; }
      if (e.key === ']') { stepEvent(1); return; }
      if (e.key === ',') { transport.pause(); transport.seek(transport.t - 1 / 30); return; }
      if (e.key === '.') { transport.pause(); transport.seek(transport.t + 1 / 30); return; }
      if (e.key === '+' || e.key === '=') { camera.zoomStep(1.25); return; }
      if (e.key === '-') { camera.zoomStep(0.8); return; }
      if (e.key === '0') { useEditor.setState({ followMode: 'none' }); camera.fit(); return; }

      if (e.shiftKey && key === 'p') { ed.setPresentation(!ed.presentation); return; }
      if (e.shiftKey && key === 'f') {
        if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.();
        return;
      }
      if (key.startsWith('arrow')) {
        const { objects, annotations } = ed.selection;
        if (!objects.length && !annotations.length) return;
        e.preventDefault();
        const step = e.shiftKey ? 5 : 0.5;
        const dx = key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0;
        const dy = key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0;
        const c = compile(ed.doc);
        ed.commit((d) => {
          for (const id of objects) {
            if (d.objects[id]?.locked) continue;
            const p = positionAt(c, id, transport.t);
            placeObjectAt(d, c, id, transport.t, p.x + dx, p.y + dy);
          }
          for (const id of annotations) if (d.annotations[id] && !d.annotations[id].locked) translateAnnotation(d.annotations[id], dx, dy);
        });
        return;
      }
      if (e.shiftKey || e.altKey) return;
      if (key === 'k') { addKeyframeForSelection(); return; }
      const tool = Object.entries(ed.toolKeys ?? {}).find(([, v]) => v === key);
      if (tool && !ed.readOnly) ed.setTool(tool[0]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function PresentationOverlay() {
  const title = useEditor((s) => s.doc.title);
  const setPresentation = useEditor((s) => s.setPresentation);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    let timer = setTimeout(() => setVisible(false), 2400);
    const wake = () => {
      setVisible(true);
      clearTimeout(timer);
      timer = setTimeout(() => setVisible(false), 2400);
    };
    window.addEventListener('pointermove', wake);
    window.addEventListener('pointerdown', wake);
    return () => { clearTimeout(timer); window.removeEventListener('pointermove', wake); window.removeEventListener('pointerdown', wake); };
  }, []);
  return (
    <div className={`present-overlay ${visible ? '' : 'is-quiet'}`} data-testid="presentation">
      <div className="present-title"><Wordmark size={15} /><h2>{title}</h2></div>
      <div className="present-bar">
        <TransportControls compact />
        <IconButton icon={X} label="Leave presentation mode" shortcut="Esc" onClick={() => setPresentation(false)} data-testid="present-exit" />
      </div>
    </div>
  );
}

function SharedBanner() {
  const doc = useEditor((s) => s.doc);
  return (
    <div className="shared-banner" role="status">
      <span>You are watching a shared play. Changes are off.</span>
      <button type="button" className="btn btn-sm" data-testid="shared-copy" onClick={() => {
        const copy = duplicateDocument(doc, { title: doc.title });
        window.history.replaceState(null, '', window.location.pathname);
        getEditor().loadDoc(copy, { fresh: true });
        saveNow({ silent: true });
      }}><Copy size={13} aria-hidden="true" /> Make my own copy</button>
    </div>
  );
}

function Welcome() {
  return (
    <div className="welcome" data-testid="welcome" role="dialog" aria-label="Welcome to pitchlab">
      <h2>Build a play, then watch it run</h2>
      <p>Drag any player. Press <kbd>P</kbd> and drag between two players to add a pass, or <kbd>R</kbd> to add a run. Press <kbd>Space</kbd> to play it.</p>
      <div className="action-row wrap">
        <button type="button" className="btn btn-primary" data-testid="welcome-example" onClick={() => { useEditor.setState({ showWelcome: false }); openExample('winger-overlap'); requestAnimationFrame(() => transport.restart()); }}><Play size={13} fill="currentColor" strokeWidth={0} aria-hidden="true" /> Watch an example</button>
        <button type="button" className="btn" data-testid="welcome-scratch" onClick={() => { useEditor.setState({ showWelcome: false }); newFromScratch({ blank: true }); }}>Start from scratch</button>
        <button type="button" className="btn" data-testid="welcome-dismiss" onClick={() => useEditor.setState({ showWelcome: false })}>Use this board</button>
      </div>
    </div>
  );
}

function PresentationTransition({ presentation }) {
  useLayoutEffect(() => {
    camera.fit(undefined, { animate: !prefersReducedMotion() });
  }, [presentation]);
  return null;
}

function SummaryToggle() {
  const open = useEditor((s) => s.openModal);
  const tp = useTransportState();
  return (
    <button type="button" className="floating-summary" aria-label="Show the play summary" title="Play summary" onClick={() => open('summary')} data-playing={tp.playing}>
      <ListOrdered size={15} aria-hidden="true" />
    </button>
  );
}

export function App() {
  const section = useEditor((s) => s.section);
  const presentation = useEditor((s) => s.presentation);
  const inspector = useEditor((s) => s.panels.inspector);
  const showWelcome = useEditor((s) => s.showWelcome);
  const sharedView = useEditor((s) => s.sharedView);
  const readOnly = useEditor((s) => s.readOnly);
  const timelineOpen = useEditor((s) => s.panels.timeline);
  const hasSelection = useEditor((s) => s.selection.objects.length + s.selection.annotations.length + s.selection.events.length > 0);
  useKeyboard();

  useEffect(() => {
    boot();
    const stop = startAutosave();
    if (matchMedia('(max-width: 820px)').matches) {
      useEditor.setState((s) => ({ panels: { ...s.panels, inspector: false, timeline: false } }));
    }
    if (new URLSearchParams(window.location.search).has('debug')) {
      window.__pitchlab = { editor: useEditor, transport, camera, compile, fx };
    }
    return stop;
  }, []);

  const isPage = section === 'library' || section === 'settings';
  const showPanel = !!PANELS[section];
  // With a section panel open, the inspector gives the pitch its room until there is a selection to inspect.
  const showInspector = inspector && !isPage && (!showPanel || hasSelection);

  useEffect(() => {
    // Panels change the board's size; the ResizeObserver refits. A small delay catches the transition.
    const id = requestAnimationFrame(() => { if (camera.autoFit) camera.fit(undefined, { animate: false }); });
    return () => cancelAnimationFrame(id);
  }, [section, showInspector, timelineOpen, presentation]);

  return (
    <div className={`app ${presentation ? 'is-presenting' : ''} ${isPage ? 'is-page' : ''} ${readOnly ? 'is-readonly' : ''}`}>
      {!presentation && <Topbar />}
      {sharedView && !presentation && <SharedBanner />}
      <div className="workspace">
        {!presentation && !readOnly && !isPage && <ToolRail />}
        {!presentation && showPanel && <SectionPanel key={section} section={section} />}
        <div className="stage" style={isPage ? { visibility: 'hidden', position: 'absolute', inset: 0, pointerEvents: 'none' } : undefined}>
          <Board />
          {!presentation && !readOnly && <ToolHint />}
          {!presentation && <ViewControls />}
          {!presentation && <SummaryToggle />}
          {showWelcome && !presentation && !isPage && <Welcome />}
          {presentation && <PresentationOverlay />}
          <PresentationTransition presentation={presentation} />
        </div>
        {!presentation && showInspector && <Inspector />}
        {section === 'library' && <LibraryPage />}
        {section === 'settings' && <SettingsPage />}
      </div>
      {!presentation && !isPage && <Timeline />}
      <Modals />
      <ContextMenu />
      <Toasts />
    </div>
  );
}
