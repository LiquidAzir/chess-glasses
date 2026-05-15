# Chess for Meta Ray-Ban Display

A simple, full-color chess game for Meta Ray-Ban Display smart glasses. D-pad navigation via the Neural Band; play against a computer opponent at three difficulty levels.

## Features

- 600×600 dark-theme UI tuned for the additive waveguide display
- Full color: cream/brown board, classic white vs black pieces — the colored squares emit light around each piece so the black silhouettes read cleanly even on the additive display
- D-pad cursor with Enter to select, legal-move dots, capture rings
- Castling, en passant, pawn promotion, checkmate / stalemate / threefold / 50-move draw
- AI opponent (chess.js for rules, custom negamax + alpha-beta in a Web Worker, iterative deepening)
- Auto-save: close mid-game and Continue Game from the menu
- Pause: undo, new game, resign, return to main menu

## Run locally

```sh
python -m http.server 5173
# open http://localhost:5173
```

Use arrow keys to move the cursor, Enter to select/move, Escape for the pause menu.

## Hosting

Deploys as a Render Static Site (or any static-file host with HTTPS). Add the deployed URL to the Meta AI app under **Devices → Display Glasses → App connections → Web apps**.
