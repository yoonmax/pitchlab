import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import groteskUrl from '@fontsource-variable/schibsted-grotesk/files/schibsted-grotesk-latin-wght-normal.woff2?url';
import barlowUrl from '@fontsource/barlow-condensed/files/barlow-condensed-latin-600-normal.woff2?url';
import { StaticBoard } from '../board/StaticBoard.jsx';

let fontCss = null;

async function toDataUrl(url) {
  const res = await fetch(url);
  const buf = new Uint8Array(await res.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return `data:font/woff2;base64,${btoa(bin)}`;
}

/** Fonts are embedded so a diagram looks the same when opened anywhere. */
export async function embeddedFontCss() {
  if (fontCss !== null) return fontCss;
  try {
    const [g, b] = await Promise.all([toDataUrl(groteskUrl), toDataUrl(barlowUrl)]);
    fontCss = `@font-face{font-family:'Schibsted Grotesk Variable';font-weight:400 900;src:url(${g}) format('woff2')}@font-face{font-family:'Barlow Condensed';font-weight:600;src:url(${b}) format('woff2')}`;
  } catch {
    fontCss = '';
  }
  return fontCss;
}

export function boardMarkup(doc, options, css = '') {
  const markup = renderToStaticMarkup(createElement(StaticBoard, { doc, ...options }));
  if (!css) return markup;
  return markup.replace(/^<svg([^>]*)>/, `<svg$1><style>${css}</style>`);
}

export async function boardSvgFile(doc, options) {
  const css = await embeddedFontCss();
  return `<?xml version="1.0" encoding="UTF-8"?>\n${boardMarkup(doc, options, css)}`;
}

export function exportSize(doc, width, rot = 0, caption = false) {
  const markup = boardMarkup(doc, { rot, caption: caption ? { title: doc.title } : null });
  const m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(markup);
  const ratio = Number(m[2]) / Number(m[1]);
  // Video encoders need even dimensions.
  const w = Math.round(width / 2) * 2;
  return { width: w, height: Math.round((w * ratio) / 2) * 2 };
}

export async function drawSvgToCanvas(svg, canvas, width, height) {
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.width = width;
    img.height = height;
    img.src = url;
    await img.decode();
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function boardPng(doc, { width = 2400, rot = 0, t = 0, showLines = 'all', caption = false, labelMode = 'number', analysis = null }) {
  const size = exportSize(doc, width, rot, caption);
  const css = await embeddedFontCss();
  const svg = boardMarkup(doc, { t, rot, showLines, labelMode, analysis, width: size.width, height: size.height, caption: caption ? { title: doc.title } : null }, css);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  await drawSvgToCanvas(svg, canvas, size.width, size.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  return { blob, ...size };
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function safeFilename(title, ext) {
  const base = (title || 'pitchlab').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'pitchlab';
  return `${base}.${ext}`;
}
