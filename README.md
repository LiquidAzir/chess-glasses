# Chess for Meta Ray-Ban Display

A full-color chess game for Meta Ray-Ban Display smart glasses and phones, powered by Stockfish. Includes the September 2026 visual and controls overhaul.

## Features

- Framed timber board, textured cream/teal squares, and original sculpted ivory/blue-steel pieces with visible rims and highlights
- One cached canvas for the board; twelve small decoded vector sprites; no continuous graphics loop or added runtime library
- 600×600 layout with safe margins, plus native-size phone menus and a responsive board
- D-pad and touch controls, legal-move dots, capture rings, selected-piece borders, last-move outlines, and check symbols
- Castling, en passant, pawn promotion, checkmate / stalemate / threefold / 50-move draw
- **Stockfish 10 (WASM)** chess engine — five difficulty tiers using UCI Skill Level + movetime + random-blunder probability for believable beginner play
- Captured-piece tracker on each side of the board
- Synthesized move / capture / check / mate sound effects with mute toggle
- Auto-save using the original `mrbd_chess_v1` key and FEN/PGN format; existing saves still load
- Pause during a computer search, undo a full turn, cancel new-game setup without losing progress, and confirm before resigning

## Run locally

```sh
node scripts/serve.cjs
# open http://127.0.0.1:5201
```

Use arrows to move, then pinch or Enter to select a piece and a marked destination. A pinch delivered as a click on the focused element is supported. Touch users can tap squares directly. Back/Escape cancels selection first, then opens the game menu. Move up beyond the board's top row to focus Menu and pinch to open it. Promotion can be cancelled with Back. F toggles fullscreen on desktop. The glasses' system gestures can vary; the explicit Menu button is always available.

## Verification

`node tests/browser.cjs` runs 61 isolated browser checks and closes its local server afterward. It uses a locally installed Playwright package or the installed Codex web-game skill's Playwright. Install Playwright and its Chromium browser if neither is available. All save fixtures belong to disposable test profiles; no user's local or cloud saves are touched.

The checks cover real AI replies, interrupted searches, undo, save/reload, black orientation, castling, en passant, promotion, checkmate, resignation, pinch clicks, browser Back, fullscreen, real mobile emulation at 320/390px, and landscape fitting. Physical glasses testing remains to be performed on the device. See `progress.md` for implementation and review notes.

## Hosting

Production: [chess-glasses.onrender.com](https://chess-glasses.onrender.com/). The existing Render Static Site deploys from `main` with no build step and the repository root as its publish directory. Add this URL to the glasses using the Meta AI app's Web apps settings. Existing installations use the same URL and save format.

## License

This project is licensed under [GPL-3.0](LICENSE) because it bundles Stockfish. See [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) for the full list of bundled third-party software (Stockfish, chess.js).
