// app.js — main controller for the MRBD chess app.
// ES module: loaded with <script type="module"> so we can import chess.js.

import { Chess } from './chess-rules.js';
import { pieceSvg } from './pieces.js';

// ==================== CONFIG ====================
const CONFIG = {
  storageKey: 'mrbd_chess_v1',
  // Per-difficulty: search depth ceiling + soft time budget. Iterative deepening
  // in the worker uses the full budget when the deeper search is reachable, and
  // falls back to the deepest completed iteration otherwise. Hard gets enough
  // time to actually reach depth 4 in the opening (~4–5s); Easy is near-instant.
  difficulty: {
    easy:   { depth: 1, timeMs: 500  },
    medium: { depth: 3, timeMs: 1500 },
    hard:   { depth: 4, timeMs: 5000 },
  },
  // Small artificial floor on AI move time so the UI always reads
  // "thinking..." rather than instant-move at depth 1.
  minThinkMs: 350,
};

// ==================== STATE ====================
const state = {
  currentScreen: 'menu',
  history: [],
  game: null,           // chess.js instance (active game) or null
  human: 'w',           // 'w' = human plays white, 'b' = human plays red
  difficulty: 'medium',
  cursor: { f: 4, r: 6 }, // file 0..7, rank 0..7 (rank 0 = top of HTML grid = rank 8)
  selected: null,        // { f, r, square: 'e2', moves: [] }
  lastMove: null,        // { from, to }
  thinking: false,
  pendingPromotion: null,// { from, to } awaiting piece pick
  worker: null,
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
  if (addToHistory && state.currentScreen) state.history.push(state.currentScreen);
  Object.values(screens).forEach(s => s.classList.add('hidden'));
  screens[id].classList.remove('hidden');
  state.currentScreen = id;
  onEnter(id);
  focusFirst(screens[id]);
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
  const el = container.querySelector('.focusable:not([hidden]):not([disabled])');
  if (el) el.focus();
}

function moveFocusInList(direction) {
  // Used inside menus / option lists. Game screen handles its own keys.
  const container =
    state.currentScreen === 'game' && !pauseEl.classList.contains('hidden') ? pauseEl :
    state.currentScreen === 'game' && !promoteEl.classList.contains('hidden') ? promoteEl :
    screens[state.currentScreen];
  const list = Array.from(
    container.querySelectorAll('.focusable:not([hidden]):not([disabled])')
  );
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
    case 'continue':   if (state.game) navigateTo('game'); break;
    case 'how':        navigateTo('how'); break;

    case 'diff-easy':   state.difficulty = 'easy';   navigateTo('side'); break;
    case 'diff-medium': state.difficulty = 'medium'; navigateTo('side'); break;
    case 'diff-hard':   state.difficulty = 'hard';   navigateTo('side'); break;

    case 'side-w': startNewGame('w'); break;
    case 'side-b': startNewGame('b'); break;
    case 'side-r': startNewGame(Math.random() < 0.5 ? 'w' : 'b'); break;

    case 'open-pause': openPause(); break;
    case 'resume':     closePause(); break;
    case 'undo':       closePause(); undoLastFullMove(); break;
    case 'new-game':   closePause(); state.game = null; navigateTo('difficulty', { addToHistory: false }); break;
    case 'resign':     closePause(); resign(); break;
    case 'to-menu':    closePause(); state.history = []; navigateTo('menu', { addToHistory: false }); break;

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
  state.game = new Chess();
  state.human = humanColor;
  state.lastMove = null;
  state.selected = null;
  state.cursor = humanColor === 'w' ? { f: 4, r: 6 } : { f: 4, r: 1 };
  state.history = [];
  saveData();
  navigateTo('game', { addToHistory: false });
}

function resign() {
  if (!state.game) return;
  // Treat as a loss for the human.
  showGameOver({
    result: 'Resigned',
    detail: state.human === 'w' ? 'Red wins' : 'White wins',
  });
}

function showGameOver({ result, detail }) {
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
      if (cell) inner += pieceSvg(cell.type, cell.color);
      if (targets.has(sq)) {
        inner += captureTargets.has(sq) ? '<span class="dot capture"></span>' : '<span class="dot"></span>';
      }
      html.push(`<div class="${classes.join(' ')}" data-sq="${sq}" data-f="${f}" data-r="${r}">${inner}</div>`);
    }
  }
  boardEl.innerHTML = html.join('');
}

// ==================== STATUS LINE ====================
function updateStatus() {
  if (!state.game) return;
  const turn = state.game.turn();
  turnPillEl.classList.toggle('red', turn === 'b');
  turnPillEl.classList.toggle('thinking', state.thinking);

  if (state.thinking) {
    turnTextEl.textContent = 'Computer thinking…';
  } else if (turn === state.human) {
    turnTextEl.textContent = 'Your move';
  } else {
    turnTextEl.textContent = (turn === 'w' ? 'White' : 'Red') + ' to move';
  }

  lastMoveEl.textContent = state.lastMove
    ? `${state.lastMove.san}`
    : ' ';

  statusEl.classList.remove('alert', 'win');
  if (state.game.inCheck() && !state.game.isCheckmate()) {
    statusEl.textContent = 'Check!';
    statusEl.classList.add('alert');
  } else {
    statusEl.textContent = ' ';
  }
}

// ==================== INPUT: cursor / selection ====================
function moveCursor(df, dr) {
  // Cursor moves in display orientation, but we store world coords.
  let { f, r } = state.cursor;
  if (isFlipped()) { df = -df; dr = -dr; }
  f = (f + df + 8) % 8;
  r = (r + dr + 8) % 8;
  state.cursor = { f, r };
  renderBoard();
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
        // Click on empty / opponent without legal target → just deselect.
        state.selected = null;
        renderBoard();
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

  if (checkGameOver()) return;
  // Hand off to AI.
  setTimeout(maybeAiMove, 50);
}

// ==================== AI ====================
function ensureWorker() {
  if (state.worker) return state.worker;
  state.worker = new Worker('chess-engine.js', { type: 'module' });
  state.worker.onmessage = (e) => onAiResponse(e.data);
  return state.worker;
}

function maybeAiMove() {
  if (!state.game) return;
  if (state.game.isGameOver()) { checkGameOver(); return; }
  if (state.game.turn() === state.human) return;

  state.thinking = true;
  updateStatus();
  const id = ++state.reqId;
  const fen = state.game.fen();
  const cfg = CONFIG.difficulty[state.difficulty];
  const startedAt = Date.now();

  ensureWorker().postMessage({ id, fen, depth: cfg.depth, timeMs: cfg.timeMs });
  // Stash request meta so we can rate-limit move display.
  state._pendingAi = { id, startedAt };
}

function onAiResponse(msg) {
  if (!state._pendingAi || msg.id !== state._pendingAi.id) return;
  const elapsed = Date.now() - state._pendingAi.startedAt;
  const wait = Math.max(0, CONFIG.minThinkMs - elapsed);
  setTimeout(() => {
    state._pendingAi = null;
    state.thinking = false;
    if (msg.error || !msg.move) {
      updateStatus();
      checkGameOver();
      return;
    }
    const m = msg.move;
    const move = state.game.move({ from: m.from, to: m.to, promotion: m.promotion });
    if (move) {
      state.lastMove = { from: move.from, to: move.to, san: move.san };
    }
    renderBoard();
    updateStatus();
    saveData();
    checkGameOver();
  }, wait);
}

// ==================== GAME OVER CHECK ====================
function checkGameOver() {
  if (!state.game || !state.game.isGameOver()) return false;
  let result = 'Game Over';
  let detail = '';
  if (state.game.isCheckmate()) {
    result = 'Checkmate';
    // If it's now <other side>'s turn, that side has been mated → opposite wins.
    const loser = state.game.turn();
    detail = loser === state.human ? 'You lose' : 'You win!';
  } else if (state.game.isStalemate()) {
    result = 'Stalemate';
    detail = 'Draw';
  } else if (state.game.isThreefoldRepetition()) {
    result = 'Draw';
    detail = 'Threefold repetition';
  } else if (state.game.isInsufficientMaterial()) {
    result = 'Draw';
    detail = 'Insufficient material';
  } else if (state.game.isDraw()) {
    result = 'Draw';
    detail = '50-move rule';
  }
  showGameOver({ result, detail });
  return true;
}

// ==================== PAUSE / PROMOTION MODALS ====================
function openPause() {
  if (state.thinking) return; // don't let user pause mid-AI; cleaner
  pauseEl.classList.remove('hidden');
  setTimeout(() => focusFirst(pauseEl), 0);
}
function closePause() { pauseEl.classList.add('hidden'); boardEl.focus(); }

function openPromote() {
  promoteEl.classList.remove('hidden');
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
    state.game = new Chess();
    if (p.pgn) state.game.loadPgn(p.pgn);
    else if (p.fen) state.game.load(p.fen);
    state.human = p.human || 'w';
    state.difficulty = p.difficulty || 'medium';
    state.lastMove = p.lastMove || null;
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
    if (a) { handleAction(a.dataset.action, a); return; }
    const p = e.target.closest('[data-promote]');
    if (p) { pickPromotion(p.dataset.promote); return; }
    // Click on a board square also moves the cursor (helps desktop testing).
    const sq = e.target.closest('.sq');
    if (sq && state.currentScreen === 'game') {
      state.cursor = { f: parseInt(sq.dataset.f, 10), r: parseInt(sq.dataset.r, 10) };
      renderBoard();
      activateCursor();
    }
  });

  // Keyboard / D-pad
  document.addEventListener('keydown', (e) => {
    const inGame = state.currentScreen === 'game';
    const inModal = inGame && (!pauseEl.classList.contains('hidden') || !promoteEl.classList.contains('hidden'));

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
          activateCursor();
          e.preventDefault();
        } else if (document.activeElement && document.activeElement.classList.contains('focusable')) {
          document.activeElement.click();
          e.preventDefault();
        }
        break;
      case 'Escape':
        if (inGame && !pauseEl.classList.contains('hidden')) {
          closePause();
        } else if (inGame && !promoteEl.classList.contains('hidden')) {
          closePromote();
        } else if (inGame) {
          openPause();
        } else {
          navigateBack();
        }
        e.preventDefault();
        break;
    }
  });
}

// ==================== INIT ====================
function init() {
  collectDom();
  setupEvents();
  loadData();
  navigateTo('menu', { addToHistory: false });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
