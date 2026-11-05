import { Download, Maximize, Moon, MoreHorizontal, PanelRightOpen, Play, Redo2, Save, Share2, Sun, Undo2, Box } from 'lucide-react';
import { useEditor } from '../state/editorStore.js';
import { setThemeMode } from '../state/persistence.js';
import { saveNow } from '../state/actions.js';
import { IconButton, Wordmark } from './common.jsx';

export const SECTIONS = ['board', 'plays', 'formations', 'drills', 'analysis', 'library', 'settings'];

function SaveStatus() {
  const status = useEditor((s) => s.saveStatus);
  const text = { clean: 'No changes yet', unsaved: 'Unsaved changes', saving: 'Saving', saved: 'Saved in this browser', error: 'Not saved' }[status];
  return <span className={`savestate is-${status}`} data-testid="save-status" role="status">{text}</span>;
}

export function Topbar() {
  const section = useEditor((s) => s.section);
  const setSection = useEditor((s) => s.setSection);
  const title = useEditor((s) => s.doc.title);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const openModal = useEditor((s) => s.openModal);
  const setPresentation = useEditor((s) => s.setPresentation);
  const inspector = useEditor((s) => s.panels.inspector);
  const togglePanel = useEditor((s) => s.togglePanel);
  const themeMode = useEditor((s) => s.themeMode);
  const readOnly = useEditor((s) => s.readOnly);
  const isDark = themeMode === 'dark' || (themeMode !== 'light' && document.documentElement.dataset.theme === 'dark');
  return (
    <header className="topbar">
      <button type="button" className="brand" onClick={() => setSection('board')} aria-label="pitchlab, go to the board"><Wordmark /></button>
      <nav className="sections" aria-label="Sections">
        {SECTIONS.map((s) => (
          <button key={s} type="button" data-testid={`nav-${s}`} className={section === s ? 'is-on' : ''} aria-current={section === s ? 'page' : undefined} onClick={() => setSection(s)}>{s}</button>
        ))}
      </nav>
      <div className="topbar-doc">
        <span className="doc-title" title={title}>{title}</span>
        {!readOnly && <SaveStatus />}
      </div>
      <div className="topbar-actions">
        {!readOnly && <IconButton icon={Undo2} label="Undo" shortcut={'⌘Z'} onClick={undo} disabled={!canUndo} data-testid="undo" />}
        {!readOnly && <IconButton icon={Redo2} label="Redo" shortcut={'⇧⌘Z'} onClick={redo} disabled={!canRedo} data-testid="redo" />}
        {!readOnly && <IconButton icon={Save} label="Save" shortcut={'⌘S'} onClick={() => saveNow()} data-testid="save" />}
        <i className="bar-sep" />
        <IconButton icon={Share2} label="Share" onClick={() => openModal('share')} data-testid="share" />
        <IconButton icon={Download} label="Export" onClick={() => openModal('export')} data-testid="export" />
        <IconButton icon={Box} label="3D replay" onClick={() => openModal('replay')} data-testid="replay3d" />
        <IconButton icon={Play} label="Presentation mode" shortcut={'⇧P'} onClick={() => setPresentation(true)} data-testid="present" />
        <IconButton icon={Maximize} label="Fullscreen" shortcut={'⇧F'} onClick={() => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); }} />
        <IconButton icon={isDark ? Sun : Moon} label={isDark ? 'Switch to light mode' : 'Switch to dark mode'} onClick={() => setThemeMode(isDark ? 'light' : 'dark')} data-testid="theme" />
        <IconButton icon={MoreHorizontal} label="Keyboard shortcuts" shortcut="?" onClick={() => openModal('shortcuts')} />
        {!inspector && <IconButton icon={PanelRightOpen} label="Show inspector" onClick={() => togglePanel('inspector', true)} data-testid="show-inspector" />}
      </div>
    </header>
  );
}
