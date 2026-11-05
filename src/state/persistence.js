import { getLastOpened, loadDocument, loadSetting, purgeDeleted, saveSetting } from '../core/storage/repository.js';
import { decodeShare, readShareFromLocation } from '../core/storage/share.js';
import { getEditor, useEditor } from './editorStore.js';
import { refreshFormations, saveNow } from './actions.js';
import { DEFAULT_TOOL_KEYS } from './shortcuts.js';

const AUTOSAVE_MS = 900;
const PREF_KEYS = ['labelMode', 'pathMode', 'snapping', 'advanceAfterBall'];

export function setThemeMode(mode) {
  const apply = mode === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : mode;
  document.documentElement.dataset.theme = apply;
  try {
    if (mode === 'system') localStorage.removeItem('pitchlab-theme');
    else localStorage.setItem('pitchlab-theme', mode);
  } catch { /* Private mode: the preference lasts until the tab closes. */ }
  useEditor.setState({ themeMode: mode });
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', apply === 'dark' ? '#151a16' : '#1f4433');
}

export async function boot() {
  let stored = 'system';
  try { stored = localStorage.getItem('pitchlab-theme') ?? 'system'; } catch { /* Ignored. */ }
  useEditor.setState({ themeMode: stored, toolKeys: { ...DEFAULT_TOOL_KEYS } });

  const shared = readShareFromLocation(window.location.hash);
  if (shared) {
    const res = await decodeShare(shared);
    if (res.ok) {
      getEditor().loadDoc(res.doc, { readOnly: true, sharedView: true });
      useEditor.setState({ bootDone: true });
      return;
    }
    getEditor().toast(res.errors[0], { kind: 'warn', duration: 8000 });
  }

  try {
    await purgeDeleted();
    await refreshFormations();
    for (const key of PREF_KEYS) {
      const v = await loadSetting(key);
      if (v !== null) useEditor.setState({ [key]: v });
    }
    const keys = await loadSetting('toolKeys');
    if (keys) useEditor.setState({ toolKeys: { ...DEFAULT_TOOL_KEYS, ...keys } });
    const last = await getLastOpened();
    if (last) {
      const doc = await loadDocument(last);
      if (doc && !doc.deletedAt) getEditor().loadDoc(doc);
    } else {
      useEditor.setState({ showWelcome: true });
    }
  } catch (e) {
    useEditor.setState({ storageError: e.message });
    getEditor().toast('This browser is blocking storage, so work will not be saved. You can still export files.', { kind: 'warn', duration: 8000 });
  }
  useEditor.setState({ bootDone: true });
}

/** Autosave once editing goes quiet. Never interrupts a drag, and also runs when the page is hidden. */
export function startAutosave() {
  let timer = null;
  const autosave = () => {
    const s = getEditor();
    if (s.dirty && !s.readOnly) saveNow({ silent: true });
  };
  const unsub = useEditor.subscribe((state, prev) => {
    if (state.doc !== prev.doc && state.dirty && !state.readOnly && !state.gestureBase) {
      clearTimeout(timer);
      timer = setTimeout(autosave, AUTOSAVE_MS);
    }
    if (state.gestureBase === null && prev.gestureBase !== null && state.dirty && !state.readOnly) {
      clearTimeout(timer);
      timer = setTimeout(autosave, AUTOSAVE_MS);
    }
    for (const key of PREF_KEYS) {
      if (state[key] !== prev[key]) saveSetting(key, state[key]).catch(() => {});
    }
    if (state.toolKeys !== prev.toolKeys && prev.toolKeys) saveSetting('toolKeys', state.toolKeys).catch(() => {});
  });
  const flush = () => {
    if (document.visibilityState === 'hidden' && getEditor().dirty && !getEditor().readOnly) saveNow({ silent: true });
  };
  document.addEventListener('visibilitychange', flush);
  const warn = (e) => {
    const s = getEditor();
    if (s.dirty && !s.readOnly && s.saveStatus !== 'saved') { saveNow({ silent: true }); e.preventDefault(); }
  };
  window.addEventListener('beforeunload', warn);
  return () => {
    unsub();
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', flush);
    window.removeEventListener('beforeunload', warn);
  };
}
