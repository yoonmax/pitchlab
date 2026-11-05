import { createDocument, CATEGORIES, OBJECT_TYPES, createDrillMeta } from '../document.js';
import { createPitch, DEFAULT_OVERLAYS, PITCH_VIEWS } from '../pitch/geometry.js';
import { PITCH_THEMES } from '../pitch/themes.js';
import { EVENT_TYPES } from '../tactics/events.js';
import { migrate } from './migrations.js';

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_OBJECTS = 300;
const MAX_EVENTS = 3000;
const MAX_ANNOTATIONS = 1000;
const MAX_TIME = 3600;

const num = (v, fallback = 0, min = -1e4, max = 1e4) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const str = (v, max = 200, fallback = '') => (typeof v === 'string' ? v.slice(0, max) : v == null ? fallback : String(v).slice(0, max));
const point = (p) => (p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)) ? { x: num(p.x), y: num(p.y) } : null);
const color = (c) => (typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : null);

/**
 * Turn untrusted JSON into a document. Only known fields are copied, values are
 * coerced and range-checked, and dangling references are dropped, so a bad file
 * cannot reach the editor. Files are data only: nothing in them is ever executed.
 */
export function validateDocument(raw) {
  const errors = [];
  const warnings = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['The file is not a pitchlab document.'], warnings };
  }
  if (!raw.objects || typeof raw.objects !== 'object') {
    return { ok: false, errors: ['The file has no objects, so it is not a pitchlab document.'], warnings };
  }
  let src;
  try {
    src = migrate(raw);
  } catch (e) {
    return { ok: false, errors: [e.message], warnings };
  }

  const base = createDocument();
  const doc = {
    ...base,
    id: typeof src.id === 'string' && /^[\w-]{1,80}$/.test(src.id) ? src.id : base.id,
    kind: ['play', 'drill', 'setpiece', 'formation'].includes(src.kind) ? src.kind : 'play',
    title: str(src.title, 120, 'Imported play') || 'Imported play',
    description: str(src.description, 2000),
    notes: str(src.notes, 8000),
    category: CATEGORIES.includes(src.category) ? src.category : 'Attacking',
    tags: Array.isArray(src.tags) ? src.tags.map((t) => str(t, 40)).filter(Boolean).slice(0, 30) : [],
    createdAt: num(src.createdAt, base.createdAt, 0, 1e14),
    updatedAt: num(src.updatedAt, base.updatedAt, 0, 1e14),
  };

  const p = src.pitch ?? {};
  const defaults = createPitch(typeof p.preset === 'string' && p.preset !== 'custom' ? p.preset : '11v11');
  doc.pitch = {
    ...defaults,
    preset: str(p.preset, 12, defaults.preset),
    length: num(p.length, defaults.length, 15, 130),
    width: num(p.width, defaults.width, 10, 100),
    goalWidth: num(p.goalWidth, defaults.goalWidth, 0, 20),
    goalDepth: num(p.goalDepth, defaults.goalDepth, 0, 6),
    penaltyDepth: num(p.penaltyDepth, defaults.penaltyDepth, 0, 40),
    penaltyWidth: num(p.penaltyWidth, defaults.penaltyWidth, 0, 90),
    goalAreaDepth: num(p.goalAreaDepth, defaults.goalAreaDepth, 0, 20),
    goalAreaWidth: num(p.goalAreaWidth, defaults.goalAreaWidth, 0, 60),
    penaltyMark: num(p.penaltyMark, defaults.penaltyMark, 0, 30),
    centerRadius: num(p.centerRadius, defaults.centerRadius, 0, 30),
    arcRadius: num(p.arcRadius, defaults.arcRadius, 0, 30),
    cornerRadius: num(p.cornerRadius, defaults.cornerRadius, 0, 5),
    view: PITCH_VIEWS.some((v) => v.id === p.view) ? p.view : 'full',
    theme: PITCH_THEMES[p.theme] ? p.theme : 'forest',
    stripes: p.stripes !== false,
    overlays: { ...DEFAULT_OVERLAYS },
  };
  const fr = p.frame;
  if (fr && [fr.x, fr.y, fr.w, fr.h].every((v) => Number.isFinite(Number(v))) && fr.w > 1 && fr.h > 1) {
    doc.pitch.frame = { x: num(fr.x), y: num(fr.y), w: num(fr.w, 40, 2, 400), h: num(fr.h, 30, 2, 400) };
  }
  for (const k of Object.keys(DEFAULT_OVERLAYS)) doc.pitch.overlays[k] = Boolean(p.overlays?.[k]);

  for (const team of ['home', 'away']) {
    const t = src.teams?.[team] ?? {};
    doc.teams[team] = {
      ...base.teams[team],
      name: str(t.name, 40, base.teams[team].name) || base.teams[team].name,
      color: color(t.color) ?? base.teams[team].color,
      gk: color(t.gk) ?? base.teams[team].gk,
      attack: t.attack === 'left' || t.attack === 'right' ? t.attack : base.teams[team].attack,
      formation: typeof t.formation === 'string' ? t.formation.slice(0, 60) : undefined,
    };
  }

  const ids = Object.keys(src.objects);
  if (ids.length > MAX_OBJECTS) errors.push(`The file has ${ids.length} objects; the limit is ${MAX_OBJECTS}.`);
  const safeId = (id) => typeof id === 'string' && /^[\w-]{1,80}$/.test(id);
  doc.objects = {};
  doc.objectOrder = [];
  for (const id of ids.slice(0, MAX_OBJECTS)) {
    const o = src.objects[id];
    if (!safeId(id) || !o || typeof o !== 'object') { warnings.push('Skipped an object with an invalid id.'); continue; }
    const type = OBJECT_TYPES[o.type] ? o.type : 'player';
    doc.objects[id] = {
      id, type,
      team: ['home', 'away', 'neutral'].includes(o.team) ? o.team : 'neutral',
      x: num(o.x), y: num(o.y),
      number: o.number === '' || o.number == null ? '' : Number.isFinite(o.number) ? o.number : str(o.number, 3),
      name: str(o.name, 40), position: str(o.position, 8),
      color: color(o.color), gk: Boolean(o.gk), sub: Boolean(o.sub),
      locked: Boolean(o.locked), hidden: Boolean(o.hidden),
      notes: str(o.notes, 2000), rotation: num(o.rotation, 0, -360, 360),
    };
  }
  const order = Array.isArray(src.objectOrder) ? src.objectOrder.filter((id) => doc.objects[id]) : [];
  doc.objectOrder = [...new Set([...order, ...Object.keys(doc.objects)])];

  const events = src.events && typeof src.events === 'object' ? Object.entries(src.events) : [];
  if (events.length > MAX_EVENTS) errors.push(`The file has ${events.length} events; the limit is ${MAX_EVENTS}.`);
  doc.events = {};
  for (const [id, e] of events.slice(0, MAX_EVENTS)) {
    if (!safeId(id) || !e || !EVENT_TYPES[e.type]) { warnings.push(`Skipped an event of unknown type "${str(e?.type, 20)}".`); continue; }
    if (!doc.objects[e.actor]) { warnings.push('Skipped an event whose player is missing.'); continue; }
    const meta = EVENT_TYPES[e.type];
    const ev = {
      id, type: e.type, actor: e.actor,
      t: num(e.t, 0, 0, MAX_TIME), duration: num(e.duration, 1, 0, 600),
      comment: str(e.comment, 1000), order: num(e.order, 0, 0, 1e6),
      group: typeof e.group === 'string' ? e.group.slice(0, 80) : null,
      ease: typeof e.ease === 'string' ? e.ease.slice(0, 12) : undefined,
      shape: Boolean(e.shape),
    };
    if (meta.group === 'motion') {
      ev.to = point(e.to);
      if (!ev.to) { warnings.push('Skipped a movement with no destination.'); continue; }
      ev.c1 = point(e.c1);
      ev.c2 = point(e.c2);
    } else if (meta.group === 'ball') {
      ev.receiver = doc.objects[e.receiver] ? e.receiver : null;
      ev.to = point(e.to);
      if (!ev.to && !ev.receiver) { warnings.push('Skipped a pass with no target.'); continue; }
      ev.c = point(e.c);
      ev.loft = num(e.loft, meta.loft ?? 0, 0, 40);
    }
    doc.events[id] = ev;
  }

  const annotations = src.annotations && typeof src.annotations === 'object' ? Object.entries(src.annotations) : [];
  if (annotations.length > MAX_ANNOTATIONS) errors.push(`The file has ${annotations.length} annotations; the limit is ${MAX_ANNOTATIONS}.`);
  doc.annotations = {};
  for (const [id, a] of annotations.slice(0, MAX_ANNOTATIONS)) {
    if (!safeId(id) || !a || typeof a.kind !== 'string') continue;
    const clean = {
      id, kind: a.kind.slice(0, 16),
      color: color(a.color), width: num(a.width, 2, 0.5, 12), opacity: num(a.opacity, 1, 0.05, 1),
      dash: ['solid', 'dashed', 'dotted'].includes(a.dash) ? a.dash : 'solid',
      head: ['none', 'end', 'both'].includes(a.head) ? a.head : 'end',
      fill: num(a.fill, 0.16, 0, 1),
      locked: Boolean(a.locked), hidden: Boolean(a.hidden),
      startAttach: doc.objects[a.startAttach] ? a.startAttach : null,
      endAttach: doc.objects[a.endAttach] ? a.endAttach : null,
    };
    for (const k of ['p0', 'p3', 'c1', 'c2']) { const q = point(a[k]); if (q) clean[k] = q; else if (a[k] === null) clean[k] = null; }
    if (Array.isArray(a.points)) clean.points = a.points.slice(0, 2000).map(point).filter(Boolean);
    if (a.x != null) { clean.x = num(a.x); clean.y = num(a.y); }
    if (a.w != null) { clean.w = num(a.w); clean.h = num(a.h); }
    if (a.text != null) clean.text = str(a.text, 500);
    if (a.size != null) clean.size = num(a.size, 2.4, 0.5, 20);
    if (a.lineStyle != null) clean.lineStyle = str(a.lineStyle, 12);
    if (a.showFrom != null) clean.showFrom = num(a.showFrom, 0, 0, MAX_TIME);
    if (a.showUntil != null) clean.showUntil = num(a.showUntil, 0, 0, MAX_TIME);
    doc.annotations[id] = clean;
  }
  const aOrder = Array.isArray(src.annotationOrder) ? src.annotationOrder.filter((id) => doc.annotations[id]) : [];
  doc.annotationOrder = [...new Set([...aOrder, ...Object.keys(doc.annotations)])];

  const b = src.ball ?? {};
  doc.ball = {
    x: num(b.x, doc.pitch.length / 2), y: num(b.y, doc.pitch.width / 2),
    owner: doc.objects[b.owner] ? b.owner : null, dead: Boolean(b.dead),
  };

  if (src.drill && typeof src.drill === 'object') {
    const m = createDrillMeta();
    for (const k of Object.keys(m)) if (src.drill[k] != null) m[k] = k === 'durationMin' ? num(src.drill[k], 15, 0, 600) : str(src.drill[k], 4000);
    doc.drill = m;
  }
  if (typeof src.example === 'string') doc.example = src.example.slice(0, 60);

  if (errors.length) return { ok: false, errors, warnings };
  return { ok: true, doc, errors, warnings };
}

/** Parse text into a document, turning every failure into a readable message. */
export function parseDocumentText(text) {
  if (typeof text !== 'string' || text.trim() === '') return { ok: false, errors: ['The file is empty.'], warnings: [] };
  if (text.length > MAX_BYTES) return { ok: false, errors: ['The file is larger than 8 MB.'], warnings: [] };
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['The file is not valid JSON, so it may be damaged.'], warnings: [] };
  }
  if (raw && raw.format === 'pitchlab') raw = raw.document;
  return validateDocument(raw);
}

export function serializeDocument(doc) {
  return JSON.stringify({ format: 'pitchlab', exportedAt: new Date().toISOString(), document: doc }, null, 2);
}
