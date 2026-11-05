import { create } from 'zustand';
import { produce, setAutoFreeze } from 'immer';
import { createDocument, duplicateAnnotations, duplicateEvents, duplicateObjects, deleteAnnotations, deleteEvents, deleteObjects, addAnnotation, addObject, translateAnnotation } from '../core/document.js';
import { getFormation } from '../core/formations/catalog.js';
import { applyFormation } from '../core/formations/engine.js';
import { compile } from '../core/animation/timeline.js';
import { transport } from './transport.js';

setAutoFreeze(false);

const HISTORY_LIMIT = 200;
const EMPTY_SELECTION = { objects: [], annotations: [], events: [] };

export function createStarterDocument() {
  const doc = createDocument();
  const out = produce(doc, (d) => {
    applyFormation(d, 'home', getFormation('4-3-3'));
    applyFormation(d, 'away', getFormation('4-2-3-1'));
    d.ball = { x: 52.5, y: 34, owner: null, dead: false };
  });
  return out;
}

const syncTransport = (doc) => {
  const c = compile(doc);
  const limit = Math.max(c.duration + 12, 24);
  transport.limit = limit;
  transport.setDuration(c.duration);
};

const initialDoc = createStarterDocument();
syncTransport(initialDoc);

export const useEditor = create((set, get) => ({
  doc: initialDoc,
  docVersion: 0,
  past: [],
  future: [],
  section: 'board',
  selection: EMPTY_SELECTION,
  tool: 'select',
  variants: { pass: 'pass', run: 'run', arrow: 'straight', shape: 'rect', place: 'player-home' },
  panels: { inspector: true, timeline: true, section: true, rail: true },
  presentation: false,
  readOnly: false,
  sharedView: false,
  saveStatus: 'clean',
  savedAt: null,
  modal: null,
  menu: null,
  toasts: [],
  clipboard: null,
  gestureBase: null,
  advanceAfterBall: true,
  showAnnotations: true,
  pathMode: 'all',
  labelMode: 'number',
  snapping: true,
  guides: [],
  hint: null,
  ghost: null,
  customFormations: [],
  analysis: {
    hull: false, shape: false, network: false, heatmap: false, lanes: false, zones: false, offside: false, distance: false,
    team: 'home', from: 0, to: null, heatTarget: 'team', dataset: null, useDataset: false,
  },
  followMode: 'none',
  dirty: false,

  /* ---------- Document editing ---------- */

  /** Apply a recipe as one undoable step. */
  commit(recipe, { select } = {}) {
    if (get().readOnly) return;
    const { doc, past } = get();
    // Braces matter: Immer treats a returned value as a replacement document.
    const next = produce(doc, (d) => { recipe(d); });
    if (next === doc) return;
    syncTransport(next);
    set({
      doc: next, past: [...past.slice(-HISTORY_LIMIT + 1), doc], future: [], dirty: true,
      saveStatus: 'unsaved', docVersion: get().docVersion + 1,
      ...(select ? { selection: { ...EMPTY_SELECTION, ...select } } : {}),
    });
  },

  /** Start a drag or similar. Each update reapplies to this base so nothing accumulates. */
  beginGesture() {
    if (get().readOnly) return;
    set({ gestureBase: get().doc });
  },

  updateGesture(recipe) {
    const base = get().gestureBase;
    if (!base) return;
    const next = produce(base, (d) => { recipe(d); });
    syncTransport(next);
    set({ doc: next, docVersion: get().docVersion + 1 });
  },

  endGesture() {
    const { gestureBase: base, doc, past } = get();
    if (!base) return;
    if (doc === base) { set({ gestureBase: null, guides: [] }); return; }
    set({ gestureBase: null, past: [...past.slice(-HISTORY_LIMIT + 1), base], future: [], dirty: true, saveStatus: 'unsaved', guides: [] });
  },

  cancelGesture() {
    const base = get().gestureBase;
    if (!base) return;
    syncTransport(base);
    set({ doc: base, gestureBase: null, guides: [], docVersion: get().docVersion + 1 });
  },

  undo() {
    const { past, doc, future } = get();
    if (!past.length || get().gestureBase) return;
    const prev = past[past.length - 1];
    syncTransport(prev);
    set({ doc: prev, past: past.slice(0, -1), future: [doc, ...future], selection: pruneSelection(get().selection, prev), dirty: true, saveStatus: 'unsaved', docVersion: get().docVersion + 1 });
  },

  redo() {
    const { past, doc, future } = get();
    if (!future.length || get().gestureBase) return;
    const next = future[0];
    syncTransport(next);
    set({ doc: next, past: [...past, doc], future: future.slice(1), selection: pruneSelection(get().selection, next), dirty: true, saveStatus: 'unsaved', docVersion: get().docVersion + 1 });
  },

  /** Replace the open document. History starts again for the new document. */
  loadDoc(doc, { readOnly = false, sharedView = false, keepSection = false, fresh = false } = {}) {
    transport.pause();
    syncTransport(doc);
    transport.seek(0);
    set({
      doc, past: [], future: [], selection: EMPTY_SELECTION, readOnly, sharedView, dirty: fresh,
      saveStatus: fresh ? 'unsaved' : 'clean', tool: 'select', docVersion: get().docVersion + 1,
      ghost: null, gestureBase: null, ...(keepSection ? {} : { section: 'board' }),
    });
  },

  /* ---------- Selection ---------- */

  select(selection) { set({ selection: { ...EMPTY_SELECTION, ...selection } }); },
  clearSelection() { set({ selection: EMPTY_SELECTION, menu: null }); },
  toggleObjectSelection(id) {
    const { selection } = get();
    const objects = selection.objects.includes(id) ? selection.objects.filter((x) => x !== id) : [...selection.objects, id];
    set({ selection: { ...EMPTY_SELECTION, objects } });
  },
  toggleEventSelection(id) {
    const { selection } = get();
    const events = selection.events.includes(id) ? selection.events.filter((x) => x !== id) : [...selection.events, id];
    set({ selection: { ...EMPTY_SELECTION, events } });
  },

  deleteSelection() {
    const { selection, commit, doc } = get();
    const objects = selection.objects.filter((id) => doc.objects[id] && !doc.objects[id].locked);
    const annotations = selection.annotations.filter((id) => doc.annotations[id] && !doc.annotations[id].locked);
    if (!objects.length && !annotations.length && !selection.events.length) return;
    commit((d) => {
      deleteObjects(d, objects);
      deleteAnnotations(d, annotations);
      deleteEvents(d, selection.events);
    }, { select: EMPTY_SELECTION });
  },

  duplicateSelection() {
    const { selection, commit } = get();
    const made = { objects: [], annotations: [], events: [] };
    commit((d) => {
      made.objects = duplicateObjects(d, selection.objects);
      made.annotations = duplicateAnnotations(d, selection.annotations);
      made.events = duplicateEvents(d, selection.events);
    });
    set({ selection: made });
  },

  copySelection() {
    const { selection, doc } = get();
    const objects = selection.objects.map((id) => doc.objects[id]).filter(Boolean);
    const annotations = selection.annotations.map((id) => doc.annotations[id]).filter(Boolean);
    if (!objects.length && !annotations.length) return false;
    set({ clipboard: JSON.parse(JSON.stringify({ objects, annotations })) });
    return true;
  },

  paste() {
    const { clipboard, commit } = get();
    if (!clipboard) return;
    const made = { objects: [], annotations: [], events: [] };
    commit((d) => {
      for (const o of clipboard.objects) {
        const { id: _id, ...rest } = o;
        made.objects.push(addObject(d, { ...rest, x: o.x + 3, y: o.y + 3 }));
      }
      for (const a of clipboard.annotations) {
        const { id: _id, ...rest } = JSON.parse(JSON.stringify(a));
        translateAnnotation(rest, 3, 3);
        made.annotations.push(addAnnotation(d, { ...rest, startAttach: null, endAttach: null }));
      }
    });
    set({ selection: made });
  },

  /* ---------- Interface ---------- */

  setTool(tool) { set({ tool, hint: null }); },
  setVariant(group, value) { set({ variants: { ...get().variants, [group]: value } }); },
  setSection(section) { set({ section, menu: null }); },
  togglePanel(name, value) {
    const panels = get().panels;
    set({ panels: { ...panels, [name]: value ?? !panels[name] } });
  },
  setPresentation(presentation) { set({ presentation, menu: null, selection: presentation ? EMPTY_SELECTION : get().selection }); },
  openModal(modal) { set({ modal, menu: null }); },
  closeModal() { set({ modal: null }); },
  openMenu(menu) { set({ menu }); },
  setAnalysis(patch) { set({ analysis: { ...get().analysis, ...patch } }); },
  setSaved(savedAt) { set({ saveStatus: 'saved', savedAt, dirty: false }); },
  setSaveStatus(saveStatus) { set({ saveStatus }); },
  setGhost(ghost) { set({ ghost }); },
  setGuides(guides) { set({ guides }); },
  setHint(hint) { set({ hint }); },

  toast(message, options = {}) {
    const id = Math.random().toString(36).slice(2);
    const entry = { id, message, ...options };
    set({ toasts: [...get().toasts.slice(-3), entry] });
    if (!options.sticky) {
      setTimeout(() => get().dismissToast(id), options.duration ?? (options.action ? 7000 : 3200));
    }
    return id;
  },
  dismissToast(id) { set({ toasts: get().toasts.filter((t) => t.id !== id) }); },
}));

function pruneSelection(selection, doc) {
  return {
    objects: selection.objects.filter((id) => doc.objects[id]),
    annotations: selection.annotations.filter((id) => doc.annotations[id]),
    events: selection.events.filter((id) => doc.events[id]),
  };
}

export const useCompiled = () => {
  const doc = useEditor((s) => s.doc);
  return compile(doc);
};

export const getEditor = () => useEditor.getState();
