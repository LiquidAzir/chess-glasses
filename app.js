// app.js — main controller for the MRBD chess app.
// ES module: loaded with <script type="module"> so we can import chess.js.

import { Chess } from './chess-rules.js';
import { pieceSvg, paintBoard, artReady, repaintArt } from './art.js';
import { sfx } from './sounds.js';
import { engine } from './engine.js';

// ==================== CONFIG ====================
const CONFIG = {
  storageKey: 'mrbd_chess_v1',
  // Per-difficulty engine settings + estimated ELO rating shown in the UI.
  //   depth        — main-search depth (iterative deepening up to here)
  //   timeMs       — soft time budget; deeper search aborts cleanly on overshoot
  //   qs           — quiescence search at leaves (extends captures-only; huge
  //                  tactical strength gain — enabled for the top tiers)
  //   blunderProb  — chance of picking a random legal move instead of the best.
  //                  Used to model lower-rated play believably.
  //   elo          — rough estimated rating shown to the user. Approximate;
  //                  real strength varies with position type and opponent.
  // Each tier maps to a Stockfish UCI configuration:
  //   skill        — "Skill Level" UCI option, 0 (weakest) … 20 (full)
  //   timeMs       — movetime budget per move; even 50ms produces strong play
  //                  at higher skills, but more time = stronger and more
  //                  realistic / human-like
  //   blunderProb  — chance of playing a uniform-random legal move instead
  //                  of asking Stockfish. Pulls the low tiers below SF's
  //                  natural floor (~1100 at Skill 0) so Beginner actually
  //                  feels like a beginner.
  difficulty: {
    beginner:     { skill: 0,  timeMs: 50,   blunderProb: 0.45, elo: 600  },
    casual:       { skill: 2,  timeMs: 100,  blunderProb: 0.12, elo: 1000 },
    intermediate: { skill: 6,  timeMs: 300,  blunderProb: 0,    elo: 1400 },
    advanced:     { skill: 12, timeMs: 1000, blunderProb: 0,    elo: 1800 },
    expert:       { skill: 20, timeMs: 3500, blunderProb: 0,    elo: 2200 },
  },
  // Map deprecated tier names from older saves → current tiers so anyone who
  // had a game saved on the old 3-tier system can keep playing it.
  difficultyAliases: {
    easy:   'beginner',
    medium: 'intermediate',
    hard:   'advanced',
  },
  // Small artificial floor on AI move time so the UI always reads
  // "thinking..." rather than instant-move at depth 1.
  minThinkMs: 350,
};

// Resolve a difficulty key (current or aliased) to a valid current key.
function resolveDifficulty(key) {
  if (CONFIG.difficulty[key]) return key;
  if (CONFIG.difficultyAliases[key]) return CONFIG.difficultyAliases[key];
  return 'intermediate'; // sane default
}

// ==================== STATE ====================
const state = {
  currentScreen: 'menu',
  history: [],
  game: null,           // chess.js instance (active game) or null
  human: 'w',           // 'w' = human plays white, 'b' = human plays black
  difficulty: 'intermediate',
  cursor: { f: 4, r: 6 }, // file 0..7, rank 0..7 (rank 0 = top of HTML grid = rank 8)
  selected: null,        // { f, r, square: 'e2', moves: [] }
  lastMove: null,        // { from, to }
  thinking: false,
  pendingPromotion: null,// { from, to } awaiting piece pick
  reqId: 0,
};

// ==================== DOM REFS ====================
const screens = {};
let boardEl, turnDotEl, turnTextEl, turnPillEl,
    lastMoveEl, statusEl, pauseEl, promoteEl, continueBtn,
    overResultEl, overDetailEl;

function collectDom() {
  document.querySelectorAll('.screen').forEach(s => { screens[s.id] = s; });
  boardEl       = document.getElementById('board');
  turnDotEl     = document.getElementById('turn-dot');
  turnTextEl    = document.getElementById('turn-text');
  turnPillEl    = document.getElementById('turn-pill');
  lastMoveEl    = document.getElementById('last-move');
  statusEl      = document.getElementById('status-text');
  pauseEl       = document.getElementById('pause');
  promoteEl     = document.getElementById('promote');
  continueBtn   = document.getElementById('continue-btn');
  overResultEl  = document.getElementById('over-result');
  overDetailEl  = document.getElementById('over-detail');
}

// ==================== NAVIGATION ====================
function navigateTo(id, { addToHistory = true } = {}) {
  if (id !== 'game') invalidateAi();
  pauseEl.classList.add('hidden');
  promoteEl.classList.add('hidden');
  state.pendingPromotion = null;
  document.getElementById('confirm-resign').classList.add('hidden');
  setBoardInert(false);
  if (addToHistory && state.currentScreen) state.history.push(state.currentScreen);
  Object.values(screens).forEach(s => s.classList.add('hidden'));
  screens[id].classList.remove('hidden');
  state.currentScreen = id;
  onEnter(id);
  focusFirst(screens[id]);
  armBackNavigation();
}
function navigateBack() {
  if (state.history.length === 0) return;
  navigateTo(state.history.pop(), { addToHistory: false });
}

function onEnter(id) {
  if (id === 'menu') {
    continueBtn.hidden = !state.game;
  }
  if (id === 'game') {
    renderBoard();
    updateStatus();
    // Focus the board so arrow keys go to cursor handler.
    setTimeout(() => boardEl.focus(), 0);
    // If it's the AI's turn (e.g. you picked Red and just started), kick it.
    maybeAiMove();
  }
}

// ==================== FOCUS ====================
function focusFirst(container) {
  const choices = Array.from(container.querySelectorAll('.focusable:not([hidden]):not([disabled])')).filter(el => el.getClientRects().length);
  const el = choices.find(el => el.dataset.action !== 'back') || choices[0];
  if (el) el.focus();
}

function moveFocusInList(direction) {
  // Used inside menus / option lists. Game screen handles its own keys.
  const container =
    !document.getElementById('confirm-resign').classList.contains('hidden') ? document.getElementById('confirm-resign') :
    state.currentScreen === 'game' && !pauseEl.classList.contains('hidden') ? pauseEl :
    state.currentScreen === 'game' && !promoteEl.classList.contains('hidden') ? promoteEl :
    screens[state.currentScreen];
  const list = Array.from(
    container.querySelectorAll('.focusable:not([hidden]):not([disabled])')
  ).filter(el => el.getClientRects().length);
  if (list.length === 0) return;
  const idx = list.indexOf(document.activeElement);
  let next;
  if (idx === -1) { list[0].focus(); return; }
  if (direction === 'up' || direction === 'left') {
    next = idx > 0 ? idx - 1 : list.length - 1;
  } else {
    next = idx < list.length - 1 ? idx + 1 : 0;
  }
  list[next].focus();
}

// ==================== ACTION HANDLER ====================
function handleAction(action, el) {
  switch (action) {
    case 'back':       navigateBack(); break;

    case 'play':       navigateTo('difficulty'); break;
    case 'continue':   if (state.game) { state.history = []; navigateTo('game', { addToHistory: false }); } break;
    case 'how':        navigateTo('how'); break;

    case 'diff-beginner':     state.difficulty = 'beginner';     navigateTo('side'); break;
    case 'diff-casual':       state.difficulty = 'casual';       navigateTo('side'); break;
    case 'diff-intermediate': state.difficulty = 'intermediate'; navigateTo('side'); break;
    case 'diff-advanced':     state.difficulty = 'advanced';     navigateTo('side'); break;
    case 'diff-expert':       state.difficulty = 'expert';       navigateTo('side'); break;

    case 'side-w': startNewGame('w'); break;
    case 'side-b': startNewGame('b'); break;
    case 'side-r': startNewGame(Math.random() < 0.5 ? 'w' : 'b'); break;

    case 'open-pause':   openPause(); break;
    case 'resume':       closePause(); break;
    case 'undo':         undoLastFullMove(); closePause(); break;
    case 'toggle-sound': sfx.setMuted(!sfx.isMuted()); refreshSoundToggle(); break;
    case 'new-game':     navigateTo('difficulty'); break;
    case 'resign':       { const dialog=document.getElementById('confirm-resign'); dialog.classList.remove('hidden'); focusFirst(dialog); break; }
    case 'cancel-resign': document.getElementById('confirm-resign').classList.add('hidden'); focusFirst(pauseEl); break;
    case 'confirm-resign': resign(); break;
    case 'to-menu':      state.history = []; navigateTo('menu', { addToHistory: false }); break;

    case 'rematch':    {
      const wasHuman = state.human;
      state.history = [];
      startNewGame(wasHuman);
      break;
    }
  }
}

// ==================== GAME CONTROL ====================
function startNewGame(humanColor) {
  invalidateAi();
  state.game = new Chess();
  state.human = humanColor;
  state.lastMove = null;
  state.selected = null;
  state.cursor = humanColor === 'w' ? { f: 4, r: 6 } : { f: 4, r: 1 };
  state.history = [];
  // Tell Stockfish a fresh game is starting so its internal tables don't
  // mix data from the previous position.
  // Cancelling the old worker gives this game an isolated engine lifecycle.
  saveData();
  navigateTo('game', { addToHistory: false });
}

function resign() {
  if (!state.game) return;
  // Treat as a loss for the human.
  sfx.play('lose');
  showGameOver({
    result: 'Resigned',
    detail: state.human === 'w' ? 'Black wins' : 'White wins',
  });
}

function showGameOver({ result, detail }) {
  invalidateAi();
  overResultEl.textContent = result;
  overDetailEl.textContent = detail;
  state.history = [];
  navigateTo('over', { addToHistory: false });
  // Clear saved game so "Continue" goes away next time.
  state.game = null;
  saveData();
}

// ==================== BOARD RENDERING ====================
// Internal coords: f=0..7 (a..h), r=0..7 where r=0 is rank 8 (top of the grid as drawn).
// We also support flipped view when the human plays Red so their pieces are at the bottom.

function isFlipped() { return state.human === 'b'; }

function squareName(f, r) {
  // r=0 → '8', r=7 → '1'
  return String.fromCharCode(97 + f) + (8 - r);
}
function parseSquare(sq) {
  const f = sq.charCodeAt(0) - 97;
  const r = 8 - parseInt(sq[1], 10);
  return { f, r };
}

function renderBoard() {
  if (!state.game) return;

  // Compute legal targets for the selected piece
  const targets = new Set();
  const captureTargets = new Set();
  if (state.selected) {
    state.selected.moves.forEach(m => {
      targets.add(m.to);
      if (m.captured || m.flags.includes('e')) captureTargets.add(m.to);
    });
  }

  // Find king-in-check square (if any)
  let checkSq = null;
  if (state.game.inCheck()) {
    const turn = state.game.turn();
    const board = state.game.board();
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const c = board[r][f];
        if (c && c.type === 'k' && c.color === turn) { checkSq = squareName(f, r); break; }
      }
    }
  }

  const board = state.game.board();
  const html = [];
  for (let dispR = 0; dispR < 8; dispR++) {
    for (let dispF = 0; dispF < 8; dispF++) {
      const r = isFlipped() ? 7 - dispR : dispR;
      const f = isFlipped() ? 7 - dispF : dispF;
      const sq = squareName(f, r);
      const cell = board[r][f];
      const light = (r + f) % 2 === 0;
      const classes = ['sq', light ? 'light' : 'dark'];
      if (state.lastMove && (state.lastMove.from === sq || state.lastMove.to === sq)) classes.push('last');
      if (state.selected && state.selected.square === sq) classes.push('selected');
      if (state.cursor.f === f && state.cursor.r === r) classes.push('cursor');
      if (checkSq === sq) classes.push('check');

      let inner = '';
      if (targets.has(sq)) {
        inner += captureTargets.has(sq) ? '<span class="dot capture"></span>' : '<span class="dot"></span>';
      }
      const label = cell ? `${cell.color === 'w' ? 'White' : 'Black'} ${PIECE_NAMES[cell.type]}, ${sq}` : `${sq}, empty`;
      html.push(`<div id="square-${sq}" role="gridcell" aria-label="${label}${targets.has(sq) ? ', legal move' : ''}${checkSq === sq ? ', in check' : ''}" aria-selected="${state.selected?.square === sq}" class="${classes.join(' ')}" data-sq="${sq}" data-f="${f}" data-r="${r}">${inner}</div>`);
    }
  }
  document.getElementById('board-squares').innerHTML = html.join('');
  boardEl.setAttribute('aria-activedescendant', 'square-' + squareName(state.cursor.f, state.cursor.r));
  paintBoard(document.getElementById('board-art'), state.game, isFlipped());

  renderCaptured();
}

// ==================== CAPTURED PIECES ====================
// Reconstructs from the move history each render so undo / load / new-game
// all stay in sync without separate bookkeeping. Cheap: history is short.
const PIECE_VALUE = { q: 5, r: 4, b: 3, n: 2, p: 1 };
const PIECE_NAMES = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };

function renderCaptured() {
  if (!state.game) return;
  const lostByWhite = []; // white pieces that have been captured
  const lostByBlack = []; // black pieces that have been captured
  const hist = state.game.history({ verbose: true });
  for (const m of hist) {
    if (!m.captured) continue;
    // The captured piece is the color OPPOSITE the moving side.
    (m.color === 'w' ? lostByBlack : lostByWhite).push(m.captured);
  }
  // Show most-valuable losses at the top of each column.
  const byValueDesc = (a, b) => PIECE_VALUE[b] - PIECE_VALUE[a];
  lostByWhite.sort(byValueDesc);
  lostByBlack.sort(byValueDesc);

  const whiteEl = document.getElementById('captured-white');
  const blackEl = document.getElementById('captured-black');
  // Tile color is the OPPOSITE of the piece color, mirroring how pieces sit
  // on contrasting squares on the board. White on dark tile, black on light.
  if (whiteEl) whiteEl.innerHTML = lostByWhite.map(t => `<span class="captured-piece tile-dark">${pieceSvg(t, 'w')}</span>`).join('');
  if (blackEl) blackEl.innerHTML = lostByBlack.map(t => `<span class="captured-piece tile-light">${pieceSvg(t, 'b')}</span>`).join('');
}

// ==================== STATUS LINE ====================
function updateStatus() {
  if (!state.game) return;
  const turn = state.game.turn();
  turnPillEl.classList.toggle('black', turn === 'b');
  turnPillEl.classList.toggle('thinking', state.thinking);

  if (state.thinking) {
    turnTextEl.textContent = 'Computer thinking…';
  } else if (turn === state.human) {
    turnTextEl.textContent = 'Your move';
  } else {
    turnTextEl.textContent = (turn === 'w' ? 'White' : 'Black') + ' to move';
  }

  lastMoveEl.textContent = state.lastMove
    ? `Last · ${state.lastMove.san}`
    : (state.human === 'w' ? 'You play ivory' : 'You play blue steel');
  document.getElementById('game-level').textContent = state.difficulty.toUpperCase();

  statusEl.classList.remove('alert', 'win');
  if (state.game.inCheck() && !state.game.isCheckmate()) {
    statusEl.textContent = turn === state.human ? 'Check — protect your king' : 'Computer is in check';
    statusEl.classList.add('alert');
  } else {
    const square = squareName(state.cursor.f, state.cursor.r), piece = state.game.get(square);
    statusEl.textContent = state.selected ? `${state.selected.square} selected · choose a marker` : piece ? `${square} · ${PIECE_NAMES[piece.type]}` : `${square} · empty`;
  }
}

// ==================== INPUT: cursor / selection ====================
function moveCursor(df, dr) {
  const menu = document.querySelector('[data-action="open-pause"]');
  if (document.activeElement === menu) { if (dr >= 0 || df) boardEl.focus(); return; }
  const displayRow = isFlipped() ? 7-state.cursor.r : state.cursor.r;
  if (displayRow === 0 && dr === -1) { menu.focus(); return; }
  // Cursor moves in display orientation, but we store world coords.
  let { f, r } = state.cursor;
  if (isFlipped()) { df = -df; dr = -dr; }
  f = Math.max(0, Math.min(7, f + df));
  r = Math.max(0, Math.min(7, r + dr));
  state.cursor = { f, r };
  renderBoard();
  updateStatus();
}

function activateCursor() {
  if (!state.game || state.thinking) return;
  if (state.game.turn() !== state.human) return;

  const sq = squareName(state.cursor.f, state.cursor.r);

  if (state.selected) {
    // Tapping the selected square again deselects.
    if (state.selected.square === sq) {
      state.selected = null;
      renderBoard();
      updateStatus();
      return;
    }
    // Try to play a move from selected → cursor.
    const moves = state.selected.moves.filter(m => m.to === sq);
    if (moves.length === 0) {
      // Picked another of our own pieces? Re-select it.
      const board = state.game.board();
      const piece = board[state.cursor.r][state.cursor.f];
      if (piece && piece.color === state.human) {
        selectAt(sq);
      } else {
        statusEl.textContent = 'Choose a marked square, or Back to cancel';
      }
      return;
    }
    if (moves.length > 1) {
      // Promotion — multiple moves with different `promotion` values.
      state.pendingPromotion = { from: state.selected.square, to: sq };
      openPromote();
      return;
    }
    playMove({ from: moves[0].from, to: moves[0].to, promotion: moves[0].promotion });
    return;
  }

  // No selection — try to select piece on the cursor square.
  const board = state.game.board();
  const piece = board[state.cursor.r][state.cursor.f];
  if (piece && piece.color === state.human) selectAt(sq);
}

function selectAt(sq) {
  const moves = state.game.moves({ square: sq, verbose: true });
  if (moves.length === 0) return;
  const { f, r } = parseSquare(sq);
  state.selected = { square: sq, f, r, moves };
  renderBoard();
  updateStatus();
}

function playMove({ from, to, promotion }) {
  const move = state.game.move({ from, to, promotion });
  if (!move) return;
  state.selected = null;
  state.lastMove = { from: move.from, to: move.to, san: move.san };
  // Snap cursor onto the destination — feels natural.
  const dest = parseSquare(move.to);
  state.cursor = dest;
  renderBoard();
  updateStatus();
  saveData();

  playMoveSound(move);
  if (checkGameOver()) return;
  // Hand off to AI.
  setTimeout(maybeAiMove, 50);
}

// Pick the right sound for a freshly-played move. Checkmate handled by the
// game-over sound, not here — caller checks isCheckmate() after the move.
function playMoveSound(move) {
  if (state.game.isCheckmate()) return; // win/lose sound covers it
  if (state.game.inCheck())       { sfx.play('check');     return; }
  if (move.flags.includes('p'))   { sfx.play('promotion'); return; }  // promotion flag
  if (move.flags.includes('k') ||
      move.flags.includes('q'))   { sfx.play('castle');    return; }  // king/queen-side castle
  if (move.captured ||
      move.flags.includes('e'))   { sfx.play('capture');   return; }  // capture or e.p.
  sfx.play('move');
}

// ==================== AI ====================
// Stockfish lives behind the `engine` module — see engine.js. We tag every
// request with an id so a late-arriving response from a previous game (e.g.
// after New Game) doesn't clobber the current board.
function maybeAiMove() {
  if (!state.game || state.currentScreen !== 'game' || state.thinking || !pauseEl.classList.contains('hidden') || !promoteEl.classList.contains('hidden')) return;
  if (state.game.isGameOver()) { checkGameOver(); return; }
  if (state.game.turn() === state.human) return;

  state.thinking = true;
  updateStatus();
  const id = ++state.reqId;
  state._pendingAi = { id, startedAt: Date.now() };

  const cfg = CONFIG.difficulty[resolveDifficulty(state.difficulty)];
  const fen = state.game.fen();
  const game = state.game;

  engine.bestMove({
    fen,
    skill: cfg.skill,
    timeMs: cfg.timeMs,
    blunderProb: cfg.blunderProb,
  }).then((m) => {
    // Stale response from a prior game / cancelled request — drop it.
    if (!state._pendingAi || state._pendingAi.id !== id) return;

    const elapsed = Date.now() - state._pendingAi.startedAt;
    const wait = Math.max(0, CONFIG.minThinkMs - elapsed);
    setTimeout(() => {
      if (!state._pendingAi || state._pendingAi.id !== id || state.game !== game || game.fen() !== fen) return;
      state._pendingAi = null;
      state.thinking = false;
      if (!m) {
        updateStatus();
        checkGameOver();
        return;
      }
      const move = state.game.move({ from: m.from, to: m.to, promotion: m.promotion });
      if (move) {
        state.lastMove = { from: move.from, to: move.to, san: move.san };
        playMoveSound(move);
      }
      renderBoard();
      updateStatus();
      saveData();
      checkGameOver();
    }, wait);
  }).catch((err) => {
    if (!state._pendingAi || state._pendingAi.id !== id || state.game !== game) return;
    state._pendingAi = null;
    state.thinking = false;
    // A Worker/WASM failure must not strand the player on the computer's turn.
    const fallback = game.moves({ verbose: true })[0];
    if (fallback) {
      const move = game.move(fallback);
      state.lastMove = { from: move.from, to: move.to, san: move.san };
      renderBoard(); saveData(); checkGameOver();
    }
    updateStatus();
  });
}

function invalidateAi() {
  state.reqId++;
  state._pendingAi = null;
  state.thinking = false;
  engine.cancel();
}

// ==================== GAME OVER CHECK ====================
function checkGameOver() {
  if (!state.game || !state.game.isGameOver()) return false;
  let result = 'Game Over';
  let detail = '';
  let sound = 'draw';
  if (state.game.isCheckmate()) {
    result = 'Checkmate';
    // If it's now <other side>'s turn, that side has been mated → opposite wins.
    const loser = state.game.turn();
    if (loser === state.human) { detail = 'You lose'; sound = 'lose'; }
    else                       { detail = 'You win!'; sound = 'win';  }
  } else if (state.game.isStalemate()) {
    result = 'Stalemate'; detail = 'Draw';
  } else if (state.game.isThreefoldRepetition()) {
    result = 'Draw'; detail = 'Threefold repetition';
  } else if (state.game.isInsufficientMaterial()) {
    result = 'Draw'; detail = 'Insufficient material';
  } else if (state.game.isDraw()) {
    result = 'Draw'; detail = '50-move rule';
  }
  // Play game-end sound shortly after so the move sound has space first.
  setTimeout(() => sfx.play(sound), 200);
  showGameOver({ result, detail });
  return true;
}

// ==================== PAUSE / PROMOTION MODALS ====================
function openPause() {
  if (!state.game || !promoteEl.classList.contains('hidden')) return;
  invalidateAi();
  refreshSoundToggle();
  const undo = pauseEl.querySelector('[data-action="undo"]');
  undo.disabled = !state.game.history({ verbose: true }).some(move => move.color === state.human);
  pauseEl.classList.remove('hidden');
  setBoardInert(true);
  setTimeout(() => focusFirst(pauseEl), 0);
}
function closePause() { pauseEl.classList.add('hidden'); setBoardInert(false); boardEl.focus(); maybeAiMove(); }

function setBoardInert(value) {
  if (!boardEl) return;
  document.querySelector('.board-wrap').inert = value;
  document.querySelector('.game-top').inert = value;
  document.querySelector('.game-bottom').inert = value;
}

function refreshSoundToggle() {
  const btn = document.getElementById('sound-toggle');
  if (btn) btn.textContent = 'Sound: ' + (sfx.isMuted() ? 'Off' : 'On');
}

function openPromote() {
  promoteEl.classList.remove('hidden');
  setBoardInert(true);
  setTimeout(() => {
    // Inject piece SVGs into the promotion buttons.
    promoteEl.querySelectorAll('[data-piece]').forEach(span => {
      span.innerHTML = pieceSvg(span.dataset.piece, state.human);
    });
    focusFirst(promoteEl);
  }, 0);
}
function closePromote() {
  promoteEl.classList.add('hidden');
  state.pendingPromotion = null;
  setBoardInert(false);
  boardEl.focus();
}
function pickPromotion(piece) {
  const p = state.pendingPromotion;
  closePromote();
  if (!p) return;
  playMove({ from: p.from, to: p.to, promotion: piece });
}

// ==================== UNDO ====================
function undoLastFullMove() {
  if (!state.game) return;
  invalidateAi();
  if (!state.game.history({ verbose: true }).some(move => move.color === state.human)) return;
  // Undo AI move (if last) and human move so it's the human's turn again.
  state.game.undo();
  if (state.game.turn() !== state.human) state.game.undo();
  // Refresh last-move highlight from new history tail
  const hist = state.game.history({ verbose: true });
  state.lastMove = hist.length
    ? { from: hist[hist.length-1].from, to: hist[hist.length-1].to, san: hist[hist.length-1].san }
    : null;
  state.selected = null;
  renderBoard();
  updateStatus();
  saveData();
}

// ==================== SAVE / RESTORE ====================
function saveData() {
  try {
    const payload = state.game ? {
      fen: state.game.fen(),
      pgn: state.game.pgn(),
      human: state.human,
      difficulty: state.difficulty,
      lastMove: state.lastMove,
    } : null;
    localStorage.setItem(CONFIG.storageKey, JSON.stringify(payload));
  } catch (e) { /* ignore */ }
}
function loadData() {
  try {
    const raw = localStorage.getItem(CONFIG.storageKey);
    if (!raw) return;
    const p = JSON.parse(raw);
    if (!p) return;
    if (typeof p !== 'object' || (!p.pgn && !p.fen)) return;
    const game = new Chess();
    if (p.pgn) game.loadPgn(p.pgn);
    else if (p.fen) game.load(p.fen);
    state.game = game;
    state.human = (p.human === 'w' || p.human === 'b') ? p.human : 'w';
    // Migrate old 3-tier saves AND validate against current config.
    state.difficulty = resolveDifficulty(p.difficulty);
    const moves = game.history({ verbose: true });
    const last = moves.at(-1);
    state.lastMove = last ? { from: last.from, to: last.to, san: last.san } : null;
    state.cursor = state.human === 'w' ? { f: 4, r: 6 } : { f: 4, r: 1 };
  } catch (e) {
    state.game = null;
  }
}

// ==================== EVENTS ====================
function setupEvents() {
  // Click → action
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-action]');
    if (a && !a.disabled) { handleAction(a.dataset.action, a); return; }
    const p = e.target.closest('[data-promote]');
    if (p) { pickPromotion(p.dataset.promote); return; }
    // Click on a board square also moves the cursor (helps desktop testing).
    const sq = e.target.closest('.sq');
    if (sq && state.currentScreen === 'game' && pauseEl.classList.contains('hidden') && promoteEl.classList.contains('hidden')) {
      boardEl.focus();
      state.cursor = { f: parseInt(sq.dataset.f, 10), r: parseInt(sq.dataset.r, 10) };
      renderBoard();
      activateCursor();
      updateStatus();
    } else if (e.target === boardEl && state.currentScreen === 'game' && pauseEl.classList.contains('hidden') && promoteEl.classList.contains('hidden')) {
      // Meta pinch can synthesize click on the focused board, without coordinates.
      activateCursor();
    }
  });

  // Keyboard / D-pad
  document.addEventListener('keydown', (e) => {
    const inGame = state.currentScreen === 'game';
    const inModal = inGame && (!pauseEl.classList.contains('hidden') || !promoteEl.classList.contains('hidden'));
    if (e.repeat && ['Enter', ' ', 'Escape', 'Backspace', 'GoBack', 'BrowserBack'].includes(e.key)) { e.preventDefault(); return; }
    if (e.key.toLowerCase() === 'f') {
      e.preventDefault();
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      else document.getElementById('app').requestFullscreen?.().catch(() => {});
      return;
    }
    if (e.key === 'Tab' && inModal) {
      moveFocusInList(e.shiftKey ? 'up' : 'down'); e.preventDefault(); return;
    }

    switch (e.key) {
      case 'ArrowUp':
        if (inGame && !inModal) moveCursor(0, -1);
        else moveFocusInList('up');
        e.preventDefault(); break;
      case 'ArrowDown':
        if (inGame && !inModal) moveCursor(0, 1);
        else moveFocusInList('down');
        e.preventDefault(); break;
      case 'ArrowLeft':
        if (inGame && !inModal) moveCursor(-1, 0);
        else moveFocusInList('left');
        e.preventDefault(); break;
      case 'ArrowRight':
        if (inGame && !inModal) moveCursor(1, 0);
        else moveFocusInList('right');
        e.preventDefault(); break;
      case 'Enter':
      case ' ':
        if (inGame && !inModal) {
          if (document.activeElement?.matches('[data-action="open-pause"]')) document.activeElement.click();
          else activateCursor();
          e.preventDefault();
        } else if (document.activeElement && document.activeElement.classList.contains('focusable')) {
          document.activeElement.click();
          e.preventDefault();
        }
        break;
      case 'Escape':
      case 'Backspace':
      case 'GoBack':
      case 'BrowserBack':
        handleBack();
        e.preventDefault();
        break;
    }
  });
  window.addEventListener('resize', fitDisplay);
  window.addEventListener('popstate', () => {
    if (!backArmed) return;
    backArmed = false;
    handleBack();
    armBackNavigation();
  });
}

let backArmed = false;
function armBackNavigation() {
  if (state.currentScreen === 'menu' || backArmed) return;
  try { history.pushState({metaChess:true}, '', location.href); backArmed = true; } catch {}
}
function handleBack() {
  if (state.currentScreen !== 'game') { navigateBack(); return; }
  if (!document.getElementById('confirm-resign').classList.contains('hidden')) { document.getElementById('confirm-resign').classList.add('hidden'); focusFirst(pauseEl); }
  else if (!promoteEl.classList.contains('hidden')) closePromote();
  else if (!pauseEl.classList.contains('hidden')) closePause();
  else if (state.selected) { state.selected = null; renderBoard(); updateStatus(); }
  else openPause();
}
function fitDisplay() {
  document.documentElement.style.setProperty('--scale',Math.min(1,innerWidth/600,innerHeight/600));
}

// ==================== INIT ====================
function init() {
  collectDom();
  fitDisplay();
  document.getElementById('hero-pieces').innerHTML = pieceSvg('n','b') + pieceSvg('k','w') + pieceSvg('p','w');
  document.querySelectorAll('#side .opt-btn').forEach((button,i) => button.insertAdjacentHTML('afterbegin', `<span class="side-art" aria-hidden="true">${pieceSvg(i===2?'n':'k',i===1?'b':'w')}</span>`));
  setupEvents();
  loadData();
  sfx.armOnFirstGesture(); // browsers require a user gesture to start AudioContext
  navigateTo('menu', { addToHistory: false });
  artReady.then(() => { repaintArt(); renderBoard(); });
  window.render_game_to_text = () => JSON.stringify({
    screen:state.currentScreen, human:state.human, difficulty:state.difficulty,
    fen:state.game?.fen() || null, turn:state.game?.turn(), thinking:state.thinking,
    cursor:squareName(state.cursor.f,state.cursor.r), selected:state.selected?.square || null,
    legalTargets:state.selected?.moves.map(m=>m.to) || [], lastMove:state.lastMove,
    modal:!document.getElementById('confirm-resign').classList.contains('hidden')?'resign':!promoteEl.classList.contains('hidden')?'promotion':!pauseEl.classList.contains('hidden')?'pause':null,
    focus:document.activeElement?.dataset.action || document.activeElement?.id,
    status:statusEl.textContent, coordinates:'a1 is White lower-left. Black view rotates 180 degrees; arrows follow screen direction.',
  });
  // Chess has no per-frame simulation. Advance waits for real worker/timer work.
  window.advanceTime = ms => new Promise(resolve => setTimeout(resolve,Math.max(0,ms)));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
