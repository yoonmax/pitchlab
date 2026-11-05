/**
 * PlaybackController owns the playhead. Position only ever changes through
 * advance(dt), so the same real-time steps give the same result at any speed.
 * Subscribers run outside React: the board and timeline write to the DOM
 * directly, so playback never re-renders the application.
 */
export const PLAYBACK_SPEEDS = [0.25, 0.5, 1, 1.5, 2, 4];

export class PlaybackController {
  constructor({ raf = (fn) => requestAnimationFrame(fn), caf = (id) => cancelAnimationFrame(id), now = () => performance.now() } = {}) {
    this.t = 0;
    this.duration = 0;
    // The playhead may be parked past the end of the content, to place new keyframes.
    this.limit = 0;
    this.playing = false;
    this.speed = 1;
    this.loop = false;
    this._raf = raf;
    this._caf = caf;
    this._now = now;
    this._frame = 0;
    this._last = 0;
    this._frameSubs = new Set();
    this._stateSubs = new Set();
    this._tick = this._tick.bind(this);
  }

  /** Called every time the playhead moves. */
  onFrame(fn) { this._frameSubs.add(fn); return () => this._frameSubs.delete(fn); }
  /** Called when play state, speed, loop or duration change. */
  onState(fn) { this._stateSubs.add(fn); return () => this._stateSubs.delete(fn); }

  _emitFrame() { for (const fn of this._frameSubs) fn(this.t); }
  _emitState() { for (const fn of this._stateSubs) fn(this); }

  setDuration(d) {
    if (d === this.duration) return;
    this.duration = d;
    if (this.t > Math.max(d, this.limit)) this.seek(d);
    this._emitState();
  }

  setLimit(limit) {
    this.limit = limit;
    this._emitState();
  }

  setSpeed(s) { this.speed = s; this._emitState(); }
  setLoop(v) { this.loop = v; this._emitState(); }

  seek(t) {
    this.t = Math.min(Math.max(this.duration, this.limit), Math.max(0, t));
    this._emitFrame();
  }

  /** Advance by real seconds. Pure arithmetic: no clock is read here. */
  advance(dt) {
    if (this.duration <= 0) return this.t;
    let next = this.t + dt * this.speed;
    if (next >= this.duration) {
      if (this.loop) next = next % this.duration;
      else {
        next = this.duration;
        this.t = next;
        this.pause();
        this._emitFrame();
        return next;
      }
    }
    this.t = next;
    this._emitFrame();
    return next;
  }

  play() {
    if (this.duration <= 0) return;
    if (this.t >= this.duration - 1e-3) { this.t = 0; this._emitFrame(); }
    if (this.playing) return;
    this.playing = true;
    this._last = this._now();
    this._frame = this._raf(this._tick);
    this._emitState();
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    this._caf(this._frame);
    this._emitState();
  }

  toggle() { if (this.playing) this.pause(); else this.play(); }

  stop() { this.pause(); this.seek(0); }

  restart() { this.seek(0); this.play(); }

  _tick() {
    if (!this.playing) return;
    const now = this._now();
    // A long stall (hidden tab) must not make the play jump ahead.
    const dt = Math.min(0.1, (now - this._last) / 1000);
    this._last = now;
    this.advance(dt);
    if (this.playing) this._frame = this._raf(this._tick);
  }
}
