// chess-engine.js — Web Worker that picks the AI's move.
// Negamax with alpha-beta pruning + piece-square eval + quiescence search.
//
// Wire-up: postMessage({ fen, depth, timeMs, qs, blunderProb }) → posts back
//          { move, evalScore, nodes, depthReached }.

import { Chess } from './chess-rules.js';

// Material values in centipawns.
const PIECE_VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

// Piece-square tables (white perspective; mirrored for black).
// Encourages central pawns, knight outposts, king safety, etc.
const PST = {
  p: [
     0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
     5,  5, 10, 25, 25, 10,  5,  5,
     0,  0,  0, 20, 20,  0,  0,  0,
     5, -5,-10,  0,  0,-10, -5,  5,
     5, 10, 10,-20,-20, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0,
  ],
  n: [
   -50,-40,-30,-30,-30,-30,-40,-50,
   -40,-20,  0,  0,  0,  0,-20,-40,
   -30,  0, 10, 15, 15, 10,  0,-30,
   -30,  5, 15, 20, 20, 15,  5,-30,
   -30,  0, 15, 20, 20, 15,  0,-30,
   -30,  5, 10, 15, 15, 10,  5,-30,
   -40,-20,  0,  5,  5,  0,-20,-40,
   -50,-40,-30,-30,-30,-30,-40,-50,
  ],
  b: [
   -20,-10,-10,-10,-10,-10,-10,-20,
   -10,  0,  0,  0,  0,  0,  0,-10,
   -10,  0,  5, 10, 10,  5,  0,-10,
   -10,  5,  5, 10, 10,  5,  5,-10,
   -10,  0, 10, 10, 10, 10,  0,-10,
   -10, 10, 10, 10, 10, 10, 10,-10,
   -10,  5,  0,  0,  0,  0,  5,-10,
   -20,-10,-10,-10,-10,-10,-10,-20,
  ],
  r: [
     0,  0,  0,  0,  0,  0,  0,  0,
     5, 10, 10, 10, 10, 10, 10,  5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
     0,  0,  0,  5,  5,  0,  0,  0,
  ],
  q: [
   -20,-10,-10, -5, -5,-10,-10,-20,
   -10,  0,  0,  0,  0,  0,  0,-10,
   -10,  0,  5,  5,  5,  5,  0,-10,
    -5,  0,  5,  5,  5,  5,  0, -5,
     0,  0,  5,  5,  5,  5,  0, -5,
   -10,  5,  5,  5,  5,  5,  0,-10,
   -10,  0,  5,  0,  0,  0,  0,-10,
   -20,-10,-10, -5, -5,-10,-10,-20,
  ],
  k: [
   -30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -20,-30,-30,-40,-40,-30,-30,-20,
   -10,-20,-20,-20,-20,-20,-20,-10,
    20, 20,  0,  0,  0,  0, 20, 20,
    20, 30, 10,  0,  0, 10, 30, 20,
  ],
};

// Convert algebraic square ('a1'..'h8') to 0-63 index, white-perspective top-left.
function squareIndex(sq) {
  const file = sq.charCodeAt(0) - 97;          // a=0
  const rank = 8 - parseInt(sq[1], 10);        // rank 8 → row 0
  return rank * 8 + file;
}

let nodes = 0;

// Material + piece-square eval, side-to-move perspective. Terminal-position
// detection is intentionally NOT done here — callers handle it once they've
// already generated moves (chess.js's isCheckmate/isDraw internally generate
// moves, which would double our cost in the hot loop).
function evaluate(game) {
  let score = 0;
  const board = game.board(); // 8x8 array, board[0] = rank 8
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const cell = board[r][f];
      if (!cell) continue;
      const idx = r * 8 + f;
      const sign = cell.color === 'w' ? 1 : -1;
      const pst = PST[cell.type];
      const psv = cell.color === 'w' ? pst[idx] : pst[(7 - r) * 8 + f];
      score += sign * (PIECE_VALUE[cell.type] + psv);
    }
  }
  return game.turn() === 'w' ? score : -score;
}

// Score for a position where the side to move has no legal moves.
// Either checkmate (very bad for side to move) or stalemate (draw).
function noMovesScore(game, depthFromRoot) {
  return game.inCheck() ? -100000 + depthFromRoot : 0;
}

// Move ordering: captures first (MVV-LVA-ish), then promotions, then the rest.
function orderMoves(moves) {
  return moves.slice().sort((a, b) => moveScore(b) - moveScore(a));
}
function moveScore(m) {
  let s = 0;
  if (m.captured) s += 10 * PIECE_VALUE[m.captured] - PIECE_VALUE[m.piece];
  if (m.promotion) s += PIECE_VALUE[m.promotion];
  return s;
}

// Default soft time cap (used if the message doesn't supply one). Iterative
// deepening will not start a new depth iteration once this much time has
// elapsed; if mid-iteration, it aborts and uses the deepest completed result.
// Per-call timeMs from the message overrides this (set per difficulty).
const DEFAULT_TIME_CAP_MS = 2500;

let deadline = 0;
let timedOut = false;
// Per-call flag: enable quiescence at leaf nodes (set by pickMove from message).
let useQuiescence = false;
// Safety cap on quiescence recursion depth so a pathological position can't
// stall the search.
const QS_MAX_DEPTH = 8;

// Delta pruning margin (centipawns). At a QS node, if even capturing the
// largest possible material (queen) wouldn't bring the score within this
// margin of alpha, skip the search — the side can stand pat instead.
const DELTA_MARGIN = 200;

// Quiescence search — at the main-search leaf, keep extending with CAPTURES only
// until the position is "quiet". Eliminates the horizon effect (engine thinking
// a free queen capture is fine because it can't see the recapture beyond depth).
// Uses the standard "stand-pat" trick: the side to move can always choose NOT
// to capture, so the static eval gives a lower bound. Delta pruning skips
// captures that can't realistically raise alpha (huge speedup in lost positions).
function quiesce(game, alpha, beta, qsDepth) {
  nodes++;

  const standPat = evaluate(game);
  if (standPat >= beta) return beta;
  if (alpha < standPat) alpha = standPat;
  if (qsDepth >= QS_MAX_DEPTH) return alpha;

  if ((nodes & 1023) === 0 && performance.now() > deadline) { timedOut = true; return alpha; }

  // Generate moves once. If there are none, it's mate or stalemate — handle
  // here instead of calling isCheckmate() (which would regenerate them).
  const all = game.moves({ verbose: true });
  if (all.length === 0) return noMovesScore(game, qsDepth);

  const captures = orderMoves(all.filter(m => m.captured || m.promotion));
  for (const m of captures) {
    // Delta pruning: skip captures that can't materially raise alpha.
    if (m.captured) {
      const gain = PIECE_VALUE[m.captured] + (m.promotion ? PIECE_VALUE[m.promotion] - PIECE_VALUE.p : 0);
      if (standPat + gain + DELTA_MARGIN < alpha) continue;
    }
    game.move(m);
    const score = -quiesce(game, -beta, -alpha, qsDepth + 1);
    game.undo();
    if (timedOut) return alpha;
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function negamax(game, depth, alpha, beta, depthFromRoot) {
  nodes++;
  if (depth === 0) {
    return useQuiescence ? quiesce(game, alpha, beta, 0) : evaluate(game);
  }
  const rawMoves = game.moves({ verbose: true });
  if (rawMoves.length === 0) return noMovesScore(game, depthFromRoot);
  const moves = orderMoves(rawMoves);
  let best = -Infinity;
  for (const m of moves) {
    // Cheap deadline check every ~1024 nodes — overshoot stays in the ~100ms
    // range per recursion level, keeping wall-clock close to the budget.
    if ((nodes & 1023) === 0 && performance.now() > deadline) {
      timedOut = true;
      return best === -Infinity ? evaluate(game) : best;
    }
    game.move(m);
    const score = -negamax(game, depth - 1, -beta, -alpha, depthFromRoot + 1);
    game.undo();
    if (timedOut) return best === -Infinity ? score : best;
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

// Search all root moves at a fixed depth. Returns the best move and a list of
// equally-good candidates (for opening variation). Returns null `move` if the
// search was aborted before the first root move completed.
function searchAtDepth(game, depth) {
  const moves = orderMoves(game.moves({ verbose: true }));
  let best = null;
  let bestScore = -Infinity;
  let alpha = -Infinity;
  const beta = Infinity;
  const candidates = [];

  for (const m of moves) {
    game.move(m);
    const score = -negamax(game, depth - 1, -beta, -alpha, 1);
    game.undo();
    if (timedOut && best === null) return { move: null, score: 0, candidates: [], complete: false };
    if (timedOut) break;

    if (score > bestScore) {
      bestScore = score;
      best = m;
      candidates.length = 0;
      candidates.push(m);
      if (score > alpha) alpha = score;
    } else if (score === bestScore) {
      candidates.push(m);
    }
  }
  return { move: best, score: bestScore, candidates, complete: !timedOut };
}

function pickMove(fen, maxDepth, timeMs, opts) {
  opts = opts || {};
  const game = new Chess(fen);
  const rootMoves = game.moves({ verbose: true });
  if (rootMoves.length === 0) return { move: null, evalScore: 0, nodes: 0, depthReached: 0 };

  // Blunder probability — for low tiers, sometimes pick a random legal move
  // instead of searching. This drops the effective rating believably without
  // making the engine stop responding to captures entirely.
  const blunderProb = Math.max(0, Math.min(1, opts.blunderProb || 0));
  if (blunderProb > 0 && Math.random() < blunderProb) {
    // Pick any non-suicidal random move — avoid hanging the queen for free in
    // ONE common case: if a queen-trade-via-blunder is offered, don't take it.
    // Simpler: just pick uniformly at random from legal moves. Beginners do this.
    const m = rootMoves[Math.floor(Math.random() * rootMoves.length)];
    return { move: m, evalScore: 0, nodes: 0, depthReached: 0, blunder: true };
  }

  nodes = 0;
  deadline = performance.now() + (timeMs || DEFAULT_TIME_CAP_MS);
  timedOut = false;
  useQuiescence = !!opts.qs;

  // Iterative deepening: keep the best result from the deepest fully-completed
  // iteration. Lower-depth results are useful even at maxDepth=1, since that's
  // exactly what Easy mode wants.
  let bestResult = null;
  let depthReached = 0;

  for (let d = 1; d <= maxDepth; d++) {
    if (performance.now() > deadline && bestResult) break;
    const result = searchAtDepth(game, d);
    if (result.complete && result.move) {
      bestResult = result;
      depthReached = d;
    } else if (result.move && !bestResult) {
      // First iteration finished even though timer expired mid-way — keep it.
      bestResult = result;
      depthReached = d;
      break;
    } else {
      break; // timed out before completing this depth; keep prior bestResult
    }
  }

  if (!bestResult) {
    // Fallback — shouldn't happen, but pick any legal move.
    return { move: rootMoves[0], evalScore: 0, nodes, depthReached: 0 };
  }

  let chosen = bestResult.move;
  if (bestResult.candidates.length > 1) {
    chosen = bestResult.candidates[Math.floor(Math.random() * bestResult.candidates.length)];
  }
  return { move: chosen, evalScore: bestResult.score, nodes, depthReached };
}

self.onmessage = (e) => {
  const { fen, depth, timeMs, qs, blunderProb, id } = e.data;
  try {
    const result = pickMove(fen, depth, timeMs, { qs, blunderProb });
    self.postMessage({ id, ...result });
  } catch (err) {
    self.postMessage({ id, error: err.message });
  }
};
