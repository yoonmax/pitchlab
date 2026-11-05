import gsap from 'gsap';
import { prefersReducedMotion } from './camera.js';

/**
 * Display-only transition between two layouts, such as a change of formation. The
 * document is already updated; this only blends what is drawn, so nothing about
 * it can leak into the timeline.
 */
export const fx = {
  from: null,
  p: 1,
  tween: null,
  onUpdate: null,
  animateFrom(previous, duration = 0.75) {
    if (prefersReducedMotion() || !previous) { fx.from = null; fx.onUpdate?.(); return; }
    fx.tween?.kill();
    fx.from = previous;
    fx.p = 0;
    fx.tween = gsap.to(fx, {
      p: 1, duration, ease: 'power3.inOut',
      onUpdate: () => fx.onUpdate?.(),
      onComplete: () => { fx.from = null; fx.onUpdate?.(); },
    });
  },
  blend(id, x, y) {
    const a = fx.from?.[id];
    if (!a) return null;
    return { x: a.x + (x - a.x) * fx.p, y: a.y + (y - a.y) * fx.p };
  },
};
