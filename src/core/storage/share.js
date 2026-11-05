import { validateDocument } from './validate.js';

/**
 * Share links carry the whole play in the URL fragment, compressed. A fragment
 * is never sent to a server, so sharing needs no account and stores nothing.
 */
export const SHARE_PREFIX = '#/s/';
/** Above this, chat apps and browsers start to truncate links. */
export const SHARE_SOFT_LIMIT = 8000;
export const SHARE_HARD_LIMIT = 60000;

function toBase64Url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(bytes, transform) {
  const stream = new Response(bytes).body.pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Strip what a viewer does not need so more plays fit in a link. */
export function shareableCopy(doc) {
  const { deletedAt: _d, createdAt: _c, updatedAt: _u, example: _e, ...rest } = JSON.parse(JSON.stringify(doc));
  return rest;
}

export async function encodeShare(doc) {
  const json = JSON.stringify(shareableCopy(doc));
  const bytes = new TextEncoder().encode(json);
  const packed = await pipe(bytes, new CompressionStream('deflate-raw'));
  return toBase64Url(packed);
}

export async function decodeShare(payload) {
  let bytes;
  try {
    bytes = await pipe(fromBase64Url(payload), new DecompressionStream('deflate-raw'));
  } catch {
    return { ok: false, errors: ['This share link is incomplete or damaged.'], warnings: [] };
  }
  if (bytes.length > 4 * 1024 * 1024) return { ok: false, errors: ['This share link is too large to open.'], warnings: [] };
  let raw;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return { ok: false, errors: ['This share link is incomplete or damaged.'], warnings: [] };
  }
  return validateDocument(raw);
}

export async function buildShareLink(doc, origin) {
  const payload = await encodeShare(doc);
  const url = `${origin}/${SHARE_PREFIX}${payload}`;
  return {
    url,
    length: url.length,
    tooLong: url.length > SHARE_HARD_LIMIT,
    risky: url.length > SHARE_SOFT_LIMIT,
  };
}

export function readShareFromLocation(hash) {
  return hash && hash.startsWith(SHARE_PREFIX) ? hash.slice(SHARE_PREFIX.length) : null;
}
