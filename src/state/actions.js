import { addEvent, addPlayer, createDocument, duplicateDocument } from '../core/document.js';
import { compile, positionAt } from '../core/animation/timeline.js';
import { buildExample } from '../core/data/examples.js';
import { buildSetPiece } from '../core/data/setpieces.js';
import { DRILL_CATALOG } from '../core/data/drills.js';
import { getLesson } from '../core/data/learn.js';
import { getFormation } from '../core/formations/catalog.js';
import { animateToFormation, applyFormation, captureFormation } from '../core/formations/engine.js';
import { serializeDocument, parseDocumentText } from '../core/storage/validate.js';
import { deleteFormation, listDocuments, listFormations, loadDocument, restoreDocument, saveDocument, saveFormation, softDeleteDocument } from '../core/storage/repository.js';
import { getEditor, useEditor, createStarterDocument } from './editorStore.js';
import { transport } from './transport.js';
import { fx } from '../board/fx.js';
import { camera } from '../board/camera.js';
import { viewBounds } from '../core/pitch/geometry.js';

/* ---------- Formations ---------- */

export function applyFormationToTeam(team, formationId, { animate = true } = {}) {
  const ed = getEditor();
  const formation = getFormation(formationId, ed.customFormations);
  if (!formation) return;
  let previous = null;
  ed.commit((d) => { previous = applyFormation(d, team, formation); });
  if (animate) fx.animateFrom(previous);
  transport.seek(transport.t);
  ed.toast(`${ed.doc.teams[team].name}: ${formation.name}`);
}

export function animateShapeChange(team, formationId, duration = 1.8) {
  const ed = getEditor();
  const formation = getFormation(formationId, ed.customFormations);
  if (!formation) return;
  const t = transport.t;
  ed.commit((d) => { animateToFormation(d, compile(ed.doc), team, formation, t, duration, positionAt); });
  ed.toast(`Added a shape change to ${formation.name} at ${t.toFixed(1)}s`);
}

export async function saveCurrentAsFormation(team, name) {
  const ed = getEditor();
  const c = compile(ed.doc);
  const positions = {};
  for (const id of Object.keys(ed.doc.objects)) positions[id] = positionAt(c, id, transport.t);
  const f = captureFormation(ed.doc, team, name, positions);
  await saveFormation(f);
  await refreshFormations();
  ed.toast(`Saved formation "${name}"`);
  return f;
}

export async function refreshFormations() {
  try {
    useEditor.setState({ customFormations: await listFormations() });
  } catch { /* Storage unavailable: built-in formations still work. */ }
}

export async function removeFormation(f) {
  const ed = getEditor();
  await deleteFormation(f.id);
  await refreshFormations();
  ed.toast(`Deleted "${f.name}"`, {
    action: { label: 'Undo', run: async () => { await saveFormation(f); await refreshFormations(); } },
  });
}

/* ---------- Opening documents ---------- */

export function newFromScratch({ preset = '11v11', blank = false, kind = 'play' } = {}) {
  const doc = blank ? createDocument({ preset }) : createStarterDocument();
  if (kind) doc.kind = kind;
  getEditor().loadDoc(doc);
  camera.setBounds(viewBounds(doc.pitch), { animate: false });
}

export function openExample(id) {
  const doc = buildExample(id);
  if (!doc) return;
  getEditor().loadDoc(doc);
  transport.seek(0);
}

export function openSetPiece(id) {
  const doc = buildSetPiece(id);
  if (doc) getEditor().loadDoc(doc, { fresh: true, keepSection: true });
}

export function openDrillTemplate(id) {
  const entry = DRILL_CATALOG.find((d) => d.id === id);
  if (!entry) return;
  const doc = entry.build ? entry.build() : buildExample(entry.example);
  getEditor().loadDoc(doc, { fresh: true, keepSection: true });
}

export function openLesson(id) {
  const lesson = getLesson(id);
  if (lesson) getEditor().loadDoc(lesson.build());
}

export async function openSaved(id) {
  const doc = await loadDocument(id);
  if (doc) {
    const { deletedAt: _d, ...rest } = doc;
    getEditor().loadDoc(rest);
  } else {
    getEditor().toast('That play could not be opened.', { kind: 'warn' });
  }
}

/* ---------- Saving ---------- */

export async function saveNow({ silent = false } = {}) {
  const ed = getEditor();
  if (ed.readOnly) return false;
  const saving = ed.doc;
  ed.setSaveStatus('saving');
  try {
    const at = await saveDocument(saving);
    const now = getEditor();
    if (now.doc === saving) now.setSaved(at);
    else if (now.dirty) now.setSaveStatus('unsaved');
    if (!silent) now.toast('Saved in this browser');
    return true;
  } catch (e) {
    getEditor().setSaveStatus('error');
    getEditor().toast(`Could not save: ${e.message}`, { kind: 'warn' });
    return false;
  }
}

export async function saveAsCopy(title) {
  const ed = getEditor();
  const copy = duplicateDocument(ed.doc, { title: title ?? `${ed.doc.title} copy` });
  ed.loadDoc(copy, { keepSection: true });
  await saveNow({ silent: true });
  getEditor().toast(`Saved as "${copy.title}"`);
}

export async function deleteSaved(doc, onChange) {
  const ed = getEditor();
  await softDeleteDocument(doc.id);
  onChange?.();
  ed.toast(`Deleted "${doc.title}"`, {
    action: { label: 'Undo', run: async () => { await restoreDocument(doc.id); onChange?.(); } },
  });
}

/* ---------- Import and export ---------- */

export function exportJsonText(doc) {
  return serializeDocument(doc);
}

export async function importDocumentFile(file) {
  const ed = getEditor();
  const text = await file.text();
  const res = parseDocumentText(text);
  if (!res.ok) {
    ed.toast(`Could not import ${file.name}: ${res.errors[0]}`, { kind: 'warn', duration: 8000 });
    return null;
  }
  const doc = duplicateDocument(res.doc, { title: res.doc.title });
  ed.loadDoc(doc, { fresh: true });
  await saveNow({ silent: true });
  const note = res.warnings.length ? ` ${res.warnings.length} items were skipped.` : '';
  getEditor().toast(`Imported "${doc.title}".${note}`);
  return doc;
}

export async function backupAll() {
  const docs = await listDocuments();
  const formations = await listFormations();
  return JSON.stringify({ format: 'pitchlab-backup', exportedAt: new Date().toISOString(), documents: docs, formations }, null, 2);
}

export async function restoreBackup(text) {
  let raw;
  try { raw = JSON.parse(text); } catch { throw new Error('The file is not valid JSON.'); }
  if (raw?.format !== 'pitchlab-backup') throw new Error('The file is not a pitchlab backup.');
  let count = 0;
  for (const d of raw.documents ?? []) {
    const res = parseDocumentText(JSON.stringify(d));
    if (res.ok) { await saveDocument(res.doc); count += 1; }
  }
  return count;
}

/* ---------- Editing helpers ---------- */

/** Everything in the play gets a keyframe at the playhead, so positions can be set by hand from here. */
export function addKeyframeForSelection() {
  const ed = getEditor();
  const ids = ed.selection.objects;
  if (!ids.length) { ed.toast('Select a player first.'); return; }
  const c = compile(ed.doc);
  const t = Math.max(0.1, transport.t);
  ed.commit((d) => {
    for (const id of ids) {
      const p = positionAt(c, id, t);
      const exists = Object.values(d.events).some((e) => e.type === 'key' && e.actor === id && Math.abs(e.t - t) < 0.02);
      if (!exists) addEvent(d, { type: 'key', actor: id, t: +t.toFixed(3), duration: 0, to: { x: p.x, y: p.y }, ease: 'smooth' });
    }
  });
  if (transport.t < 0.1) transport.seek(t);
}

export function addDefensiveWall(count) {
  const ed = getEditor();
  const { doc } = ed;
  const ball = doc.ball;
  const attack = doc.teams.home.attack;
  const goal = { x: attack === 'right' ? doc.pitch.length : 0, y: doc.pitch.width / 2 };
  const dx = goal.x - ball.x;
  const dy = goal.y - ball.y;
  const l = Math.hypot(dx, dy) || 1;
  const cx = ball.x + (dx / l) * 9.15;
  const cy = ball.y + (dy / l) * 9.15;
  const ids = [];
  ed.commit((d) => {
    for (let i = 0; i < count; i++) {
      const off = (i - (count - 1) / 2) * 0.9;
      ids.push(addPlayer(d, { team: 'away', position: 'W', x: +(cx + (-dy / l) * off).toFixed(2), y: +(cy + (dx / l) * off).toFixed(2) }));
    }
  });
  ed.select({ objects: ids });
  ed.toast(`Added a wall of ${count}, 9.15 m from the ball`);
}

export function placeBallForSetPiece(x, y, owner = null) {
  getEditor().commit((d) => { d.ball = { x, y, owner, dead: true }; });
  transport.seek(0);
}

