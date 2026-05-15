// chess-engine.js — Web Worker that picks the AI's move.
// Negamax with alpha-beta pruning + simple piece-square eval.
//
// Wire-up: postMessage({ fen, depth }) → posts back { move, evalScore, nodes }.

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

function evaluate(game) {
  // Terminal positions get extreme scores.
  if (game.isCheckmate()) return -100000;       // side to move is mated
  if (game.isDraw() || game.isStalemate() || game.isThreefoldRepetition() || game.isInsufficientMaterial()) {
    return 0;
  }

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
  // Negamax wants the score from side-to-move's perspective.
  return game.turn() === 'w' ? score : -score;
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

function negamax(game, depth, alpha, beta) {
  nodes++;
  if (depth === 0 || game.isGameOver()) {
    return evaluate(game);
  }
  const moves = orderMoves(game.moves({ verbose: true }));
  let best = -Infinity;
  for (const m of moves) {
    // Cheap deadline check every ~2048 nodes — keep overhead negligible.
    if ((nodes & 2047) === 0 && performance.now() > deadline) {
      timedOut = true;
      return best === -Infinity ? evaluate(game) : best;
    }
    game.move(m);
    const score = -negamax(game, depth - 1, -beta, -alpha);
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
    const score = -negamax(game, depth - 1, -beta, -alpha);
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

function pickMove(fen, maxDepth, timeMs) {
  const game = new Chess(fen);
  const rootMoves = game.moves({ verbose: true });
  if (rootMoves.length === 0) return { move: null, evalScore: 0, nodes: 0, depthReached: 0 };

  nodes = 0;
  deadline = performance.now() + (timeMs || DEFAULT_TIME_CAP_MS);
  timedOut = false;

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
  const { fen, depth, timeMs, id } = e.data;
  try {
    const result = pickMove(fen, depth, timeMs);
    self.postMessage({ id, ...result });
  } catch (err) {
    self.postMessage({ id, error: err.message });
  }
};
