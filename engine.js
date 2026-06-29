// engine.js — Stockfish UCI bridge.
//
// Spawns the bundled Stockfish WASM as a Web Worker, handles the UCI
// handshake, and exposes a simple async API:
//
//   await engine.bestMove({ fen, skill: 0..20, timeMs, blunderProb });
//
// Returns { from, to, promotion? } in algebraic format, matching the move
// shape the rest of the app already uses. Returns null if there are no legal
// moves (caller treats that as game over).

import { Chess } from './chess-rules.js';

const STOCKFISH_URL = 'stockfish/stockfish.js';

class Engine {
  constructor() {
    this.sf = null;
    this.ready = false;
    this.initPromise = null;
    this.pending = null;    // { predicate(line) → bool, resolve(line), reject(err) }
  }

  // Lazy, idempotent init — first caller spawns Stockfish and runs the UCI
  // handshake; subsequent callers await the same promise.
  init() {
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      this.sf = new Worker(STOCKFISH_URL);
      this.sf.onmessage = (e) => this._onMessageRaw(e.data);
      this.sf.onerror = (e) => console.error('[stockfish]', e.message || e);
      await this._send('uci', (l) => l === 'uciok');
      await this._send('isready', (l) => l === 'readyok');
      // Smaller hash than the default — keeps memory modest on the glasses.
      this.sf.postMessage('setoption name Hash value 16');
      this.ready = true;
    })();
    return this.initPromise;
  }

  // Tell Stockfish a brand-new game is starting (clears internal heuristics
  // tied to the previous position's hash table entries).
  async newGame() {
    await this.init();
    this.sf.postMessage('ucinewgame');
    await this._send('isready', (l) => l === 'readyok');
  }

  async bestMove({ fen, skill = 20, timeMs = 1000, blunderProb = 0 }) {
    // Blunder option (used by the Beginner / Casual tiers to model weaker
    // play believably). We pick a uniform-random legal move and skip the
    // Stockfish search entirely. chess.js handles legal-move enumeration.
    if (blunderProb > 0 && Math.random() < blunderProb) {
      const game = new Chess(fen);
      const moves = game.moves({ verbose: true });
      if (moves.length === 0) return null;
      const m = moves[Math.floor(Math.random() * moves.length)];
      return {
        from: m.from,
        to: m.to,
        promotion: m.promotion,
        blunder: true,
      };
    }

    await this.init();

    // Set difficulty, set position, search. setoption + position acks are
    // silent in UCI; only `go` produces a `bestmove` line we wait on.
    this.sf.postMessage('setoption name Skill Level value ' + Math.max(0, Math.min(20, skill | 0)));
    this.sf.postMessage('position fen ' + fen);
    const line = await this._send(
      'go movetime ' + Math.max(1, timeMs | 0),
      (l) => l.startsWith('bestmove '),
    );

    const match = line.match(/^bestmove\s+(\S+)/);
    if (!match || match[1] === '(none)') return null;
    const mv = match[1];
    return {
      from: mv.slice(0, 2),
      to: mv.slice(2, 4),
      promotion: mv.length === 5 ? mv[4] : undefined,
    };
  }

  // === internals ===

  // Post a command and resolve when a response line matching `predicate` arrives.
  _send(cmd, predicate) {
    return new Promise((resolve, reject) => {
      if (this.pending) {
        // The app is serialized (one move at a time), so this shouldn't
        // normally fire, but guard against accidental overlap.
        return reject(new Error('engine busy'));
      }
      this.pending = { predicate, resolve, reject };
      this.sf.postMessage(cmd);
    });
  }

  // Stockfish posts one or more lines per onmessage event; split and inspect each.
  _onMessageRaw(data) {
    const text = String(data);
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      if (this.pending && this.pending.predicate(line)) {
        const { resolve } = this.pending;
        this.pending = null;
        resolve(line);
      }
    }
  }
}

export const engine = new Engine();
