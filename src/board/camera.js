import { camerasClose, dampCamera, fitCamera, panBy as panCam, screenToWorld, worldToScreen, zoomAt } from '../core/pitch/coordinates.js';

export const prefersReducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Holds the camera outside React. Moves ease towards a target using elapsed
 * time; wheel and pinch write straight to the camera so they feel immediate.
 */
export class CameraController {
  constructor() {
    this.cam = { cx: 52.5, cy: 34, zoom: 8, rot: 0 };
    this.target = { ...this.cam };
    this.vw = 0;
    this.vh = 0;
    this.bounds = { x: -5, y: -3, w: 115, h: 74 };
    this.autoFit = true;
    this.fitZoom = 8;
    this.subs = new Set();
    this.raf = 0;
    this.last = 0;
    this.step = this.step.bind(this);
  }

  subscribe(fn) { this.subs.add(fn); return () => this.subs.delete(fn); }
  emit() { for (const fn of this.subs) fn(this.cam); }

  setViewport(w, h) {
    const first = this.vw === 0;
    this.vw = w;
    this.vh = h;
    if (w === 0 || h === 0) return;
    if (first || this.autoFit) this.fit(undefined, { animate: false });
    else this.emit();
  }

  setBounds(bounds, { animate = true } = {}) {
    this.bounds = bounds;
    this.fit(bounds, { animate });
  }

  fit(bounds = this.bounds, { animate = true, rot = this.target.rot } = {}) {
    if (!this.vw) return;
    const t = fitCamera(bounds, this.vw, this.vh, rot, 20);
    this.fitZoom = t.zoom;
    this.autoFit = true;
    this.moveTo(t, animate);
  }

  moveTo(t, animate = true) {
    this.target = t;
    if (!animate || prefersReducedMotion()) {
      this.cam = { ...t };
      this.emit();
      return;
    }
    if (!this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.step);
    }
  }

  step() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.cam = dampCamera(this.cam, this.target, dt);
    if (camerasClose(this.cam, this.target)) {
      this.cam = { ...this.target };
      this.raf = 0;
      this.emit();
      return;
    }
    this.emit();
    this.raf = requestAnimationFrame(this.step);
  }

  get minZoom() { return this.fitZoom * 0.55; }
  get maxZoom() { return this.fitZoom * 10; }

  zoomAtPoint(sx, sy, factor) {
    this.autoFit = false;
    const next = zoomAt(this.cam, this.vw, this.vh, sx, sy, factor, this.minZoom, this.maxZoom);
    this.cam = next;
    this.target = { ...next, rot: this.target.rot };
    this.emit();
  }

  zoomStep(factor) {
    this.autoFit = false;
    const t = zoomAt(this.target, this.vw, this.vh, this.vw / 2, this.vh / 2, factor, this.minZoom, this.maxZoom);
    this.moveTo(t);
  }

  pan(dx, dy) {
    this.autoFit = false;
    const next = panCam(this.cam, dx, dy);
    this.cam = next;
    this.target = { ...next, rot: this.target.rot };
    this.emit();
  }

  /** Rotate by a quarter or half turn, keeping the pitch framed. */
  rotateTo(rot) {
    this.fit(this.bounds, { rot });
  }

  follow(x, y, zoomFactor = 1.9) {
    this.autoFit = false;
    this.target = { ...this.target, cx: x, cy: y, zoom: this.fitZoom * zoomFactor };
    if (prefersReducedMotion()) {
      this.cam = { ...this.target };
      this.emit();
      return;
    }
    if (!this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.step);
    }
  }

  toWorld(sx, sy) { return screenToWorld(this.cam, this.vw, this.vh, sx, sy); }
  toScreen(x, y) { return worldToScreen(this.cam, this.vw, this.vh, x, y); }
}

export const camera = new CameraController();
