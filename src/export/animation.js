import { GIFEncoder, applyPalette, quantize } from 'gifenc';
import { compile } from '../core/animation/timeline.js';
import { boardMarkup, drawSvgToCanvas, embeddedFontCss, exportSize } from './render.js';

/**
 * Animated exports step through the timeline at fixed times and render each frame
 * from the same pure function as a still export. They do not record the screen,
 * so the output is frame-exact and takes as long as it takes, not as long as the play.
 */
export function frameTimes(duration, fps) {
  const count = Math.max(1, Math.ceil(duration * fps));
  return Array.from({ length: count + 1 }, (_, i) => Math.min(duration, i / fps));
}

async function* renderFrames(doc, { width, fps, rot = 0, showLines = 'active', caption = false, labelMode = 'number', signal }) {
  const size = exportSize(doc, width, rot, caption);
  const css = await embeddedFontCss();
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const times = frameTimes(compile(doc).duration, fps);
  for (let i = 0; i < times.length; i++) {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    const svg = boardMarkup(doc, { t: times[i], rot, showLines, labelMode, width: size.width, height: size.height, caption: caption ? { title: doc.title } : null }, css);
    await drawSvgToCanvas(svg, canvas, size.width, size.height);
    yield { canvas, index: i, total: times.length, t: times[i], size };
  }
}

export async function exportGif(doc, { width = 720, fps = 15, rot, showLines, caption, labelMode, onProgress, signal }) {
  const gif = GIFEncoder();
  let palette = null;
  const delay = Math.round(1000 / fps);
  for await (const f of renderFrames(doc, { width, fps, rot, showLines, caption, labelMode, signal })) {
    const ctx = f.canvas.getContext('2d', { willReadFrequently: true });
    const { data } = ctx.getImageData(0, 0, f.size.width, f.size.height);
    if (!palette) palette = quantize(data, 200);
    const index = applyPalette(data, palette);
    gif.writeFrame(index, f.size.width, f.size.height, f.index === 0 ? { palette, delay } : { delay });
    onProgress?.((f.index + 1) / f.total);
    if (f.index % 4 === 0) await new Promise((r) => setTimeout(r));
  }
  gif.finish();
  return new Blob([gif.bytes()], { type: 'image/gif' });
}

export async function videoSupport() {
  if (typeof VideoEncoder === 'undefined') return null;
  const { canEncodeVideo } = await import('mediabunny');
  if (await canEncodeVideo('avc', { width: 1280, height: 720 })) return { codec: 'avc', ext: 'mp4', type: 'video/mp4' };
  if (await canEncodeVideo('vp9', { width: 1280, height: 720 })) return { codec: 'vp9', ext: 'webm', type: 'video/webm' };
  return null;
}

export async function exportVideo(doc, { width = 1280, fps = 30, rot, showLines, caption, labelMode, onProgress, signal, support }) {
  const { Output, Mp4OutputFormat, WebMOutputFormat, BufferTarget, CanvasSource, QUALITY_HIGH } = await import('mediabunny');
  const output = new Output({
    format: support.ext === 'mp4' ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(),
    target: new BufferTarget(),
  });
  let source = null;
  let started = false;
  for await (const f of renderFrames(doc, { width, fps, rot, showLines, caption, labelMode, signal })) {
    if (!source) {
      source = new CanvasSource(f.canvas, { codec: support.codec, bitrate: QUALITY_HIGH });
      output.addVideoTrack(source, { frameRate: fps });
      await output.start();
      started = true;
    }
    await source.add(f.index / fps, 1 / fps);
    onProgress?.((f.index + 1) / f.total);
  }
  if (started) await output.finalize();
  return new Blob([output.target.buffer], { type: support.type });
}
