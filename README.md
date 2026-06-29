# Chess for Meta Ray-Ban Display

A full-color chess game for Meta Ray-Ban Display smart glasses, powered by Stockfish. D-pad navigation via the Neural Band; play against a tunable AI opponent across five difficulty tiers from ~600 to ~2200 ELO.

## Features

- 600×600 dark-theme UI tuned for the additive waveguide display
- Full color: cream/brown board, classic white vs black pieces — the colored squares emit light around each piece so the black silhouettes read cleanly even on the additive display
- D-pad cursor with Enter to select, legal-move dots, capture rings
- Castling, en passant, pawn promotion, checkmate / stalemate / threefold / 50-move draw
- **Stockfish 10 (WASM)** chess engine — five difficulty tiers using UCI Skill Level + movetime + random-blunder probability for believable beginner play
- Captured-piece tracker on each side of the board
- Synthesized move / capture / check / mate sound effects with mute toggle
- Auto-save: close mid-game and Continue Game from the menu
- Pause menu: undo, new game, resign, sound toggle, return to main menu

## Run locally

```sh
python -m http.server 5173
# open http://localhost:5173
```

Use arrow keys to move the cursor, Enter to select/move, Escape for the pause menu.

## Hosting

Deploys as a Render Static Site (or any static-file host with HTTPS). Add the deployed URL to the Meta AI app under **Devices → Display Glasses → App connections → Web apps**.

## License

This project is licensed under [GPL-3.0](LICENSE) because it bundles Stockfish. See [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) for the full list of bundled third-party software (Stockfish, chess.js).
