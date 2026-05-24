// sounds.js — synthesized chess sound effects via Web Audio API.
//
// No bundled audio files — every sound is generated on the fly from
// oscillators + envelopes. Pros: zero asset weight, no copyright, works
// offline, microscopic code size. Cons: synthesized "wooden click" can't
// fully match a recorded sample, but it gets the job done.
//
// Usage:
//   import { sfx } from './sounds.js';
//   sfx.armOnFirstGesture();   // call once in init, before any sounds
//   sfx.play('move' | 'capture' | 'check' | 'win' | 'lose' | 'draw' | 'promotion' | 'castle');
//   sfx.setMuted(true);        // user toggled the mute button
//   sfx.isMuted();             // for the toggle UI

const STORAGE_KEY = 'mrbd_chess_sound_v1';

class SoundFx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    try {
      this.muted = localStorage.getItem(STORAGE_KEY) === 'muted';
    } catch (e) { /* ignore */ }
  }

  // The browser autoplay policy refuses to start an AudioContext until there
  // is a user gesture. Lazy-init on first click / keydown event so we never
  // hit a "user denied" warning in the console.
  armOnFirstGesture() {
    const handler = () => {
      this._ensureCtx();
      window.removeEventListener('pointerdown', handler, true);
      window.removeEventListener('keydown', handler, true);
    };
    window.addEventListener('pointerdown', handler, true);
    window.addEventListener('keydown', handler, true);
  }

  _ensureCtx() {
    if (this.ctx) return;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    try {
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
    } catch (e) {
      this.ctx = null;
    }
  }

  setMuted(muted) {
    this.muted = !!muted;
    try { localStorage.setItem(STORAGE_KEY, this.muted ? 'muted' : 'on'); } catch (e) {}
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
  }

  isMuted() { return this.muted; }

  play(kind) {
    if (this.muted) return;
    this._ensureCtx();
    if (!this.ctx) return;
    // Resume if the tab was backgrounded (mobile browsers suspend the ctx).
    if (this.ctx.state === 'suspended') this.ctx.resume();
    switch (kind) {
      case 'move':      this._click(220, 0.07, 'triangle', 0.4); break;
      case 'capture':   this._capture(); break;
      case 'castle':    this._castle(); break;
      case 'check':     this._sequence([880, 660], 0.10, 'sine', 0.4); break;
      case 'promotion': this._sequence([523, 659, 784, 1047, 1319], 0.07, 'sine', 0.35); break;
      case 'win':       this._sequence([523, 659, 784, 1047], 0.12, 'triangle', 0.4); break;
      case 'lose':      this._sequence([392, 330, 261, 196], 0.20, 'sine', 0.35); break;
      case 'draw':      this._sequence([440, 440], 0.18, 'sine', 0.3); break;
    }
  }

  // === Primitives ===

  // Single decaying tone — used for the "move" thunk.
  _click(freq, duration, type, peak) {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  // Capture: low thump + a touch of noise — punchier than a plain click.
  _capture() {
    const t = this.ctx.currentTime;
    // Low fundamental
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 130;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.35, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.16);
    // Short noise tick on top for the "thump" texture
    this._noiseBurst(0.04, 0.18);
  }

  _castle() {
    // Two quick low clicks — king + rook
    this._click(200, 0.06, 'triangle', 0.35);
    setTimeout(() => this._click(170, 0.06, 'triangle', 0.35), 80);
  }

  _noiseBurst(duration, peak) {
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * duration);
    const buf = this.ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const gain = this.ctx.createGain();
    gain.gain.value = peak;
    // Lowpass so the noise sounds like a thump, not a hiss
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
  }

  // Schedule a series of notes — used for check / win / lose / promotion.
  _sequence(freqs, noteDur, type, peak) {
    const start = this.ctx.currentTime;
    freqs.forEach((freq, i) => {
      const t = start + i * noteDur;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(peak, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + noteDur);
      osc.connect(gain).connect(this.master);
      osc.start(t);
      osc.stop(t + noteDur + 0.02);
    });
  }
}

export const sfx = new SoundFx();
