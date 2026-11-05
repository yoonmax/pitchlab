import { dbAll, dbDelete, dbGet, dbPut } from './db.js';
import { validateDocument } from './validate.js';
import { duplicateDocument } from '../document.js';

const PURGE_AFTER_MS = 7 * 24 * 3600 * 1000;

/** Saved documents pass through the validator on the way out, so old or damaged records cannot break the editor. */
export async function saveDocument(doc) {
  const record = JSON.parse(JSON.stringify(doc));
  record.updatedAt = Date.now();
  await dbPut('documents', record);
  await setLastOpened(doc.id);
  return record.updatedAt;
}

export async function loadDocument(id) {
  const raw = await dbGet('documents', id);
  if (!raw) return null;
  const res = validateDocument(raw);
  return res.ok ? { ...res.doc, deletedAt: raw.deletedAt } : null;
}

export async function listDocuments({ includeDeleted = false } = {}) {
  const all = await dbAll('documents');
  const out = [];
  for (const raw of all) {
    const res = validateDocument(raw);
    if (!res.ok) continue;
    if (raw.deletedAt && !includeDeleted) continue;
    out.push({ ...res.doc, deletedAt: raw.deletedAt });
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Deleting is soft, so a delete can be undone. Records are purged after a week. */
export async function softDeleteDocument(id) {
  const raw = await dbGet('documents', id);
  if (!raw) return;
  raw.deletedAt = Date.now();
  await dbPut('documents', raw);
}

export async function restoreDocument(id) {
  const raw = await dbGet('documents', id);
  if (!raw) return;
  delete raw.deletedAt;
  await dbPut('documents', raw);
}

export async function purgeDeleted(now = Date.now()) {
  const all = await dbAll('documents');
  await Promise.all(all.filter((d) => d.deletedAt && now - d.deletedAt > PURGE_AFTER_MS).map((d) => dbDelete('documents', d.id)));
}

export const permanentlyDelete = (id) => dbDelete('documents', id);

export async function duplicateSavedDocument(id) {
  const doc = await loadDocument(id);
  if (!doc) return null;
  const copy = duplicateDocument(doc);
  await dbPut('documents', copy);
  return copy;
}

export async function setLastOpened(id) {
  await dbPut('kv', { id: 'lastOpened', value: id });
}

export async function getLastOpened() {
  return (await dbGet('kv', 'lastOpened'))?.value ?? null;
}

export async function saveSetting(id, value) {
  await dbPut('kv', { id: `setting:${id}`, value });
}

export async function loadSetting(id, fallback = null) {
  return (await dbGet('kv', `setting:${id}`))?.value ?? fallback;
}

export const listFormations = () => dbAll('formations');
export const saveFormation = (f) => dbPut('formations', JSON.parse(JSON.stringify(f)));
export const deleteFormation = (id) => dbDelete('formations', id);

export const listSessions = () => dbAll('sessions');
export const saveSession = (s) => dbPut('sessions', JSON.parse(JSON.stringify({ ...s, updatedAt: Date.now() })));
export const deleteSession = (id) => dbDelete('sessions', id);
