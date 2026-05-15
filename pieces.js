// Original chess piece silhouettes for the MRBD glasses chess app.
// Each piece is drawn inside a 100x100 viewBox with currentColor fills,
// so colour is driven by CSS (.piece-white vs .piece-black).
//
// Designed chunky and high-contrast so the silhouettes still read at
// the small ~56px display size on the glasses. On the additive display,
// black pieces appear as silhouettes — the surrounding colored square
// emits light, making the piece shape visible by absence of light.

const PIECES = {
  // Pawn — round head, flared skirt, stacked base.
  p: `
    <ellipse cx="50" cy="88" rx="30" ry="5"/>
    <path d="M 26 84 L 74 84 L 70 78 L 30 78 Z"/>
    <path d="M 30 78 L 70 78 L 64 60 L 36 60 Z"/>
    <ellipse cx="50" cy="58" rx="17" ry="3.5"/>
    <path d="M 41 56 L 59 56 L 57 46 L 43 46 Z"/>
    <circle cx="50" cy="33" r="13"/>
  `,

  // Rook — castle tower with five crenellations.
  r: `
    <ellipse cx="50" cy="88" rx="32" ry="5"/>
    <path d="M 24 84 L 76 84 L 72 78 L 28 78 Z"/>
    <path d="M 30 78 L 70 78 L 68 42 L 32 42 Z"/>
    <path d="M 26 42 L 74 42 L 74 36 L 32 36 L 32 30 Z M 26 42 L 26 36 L 32 36 Z"/>
    <path d="M 26 36 L 74 36 L 74 30 L 64 30 L 64 22 L 56 22 L 56 30 L 53 30 L 53 22 L 47 22 L 47 30 L 44 30 L 44 22 L 36 22 L 36 30 L 26 30 Z"/>
  `,

  // Knight — stylised horse head facing right with mane and ear.
  n: `
    <ellipse cx="50" cy="88" rx="32" ry="5"/>
    <path d="M 24 84 L 76 84 L 72 78 L 28 78 Z"/>
    <path d="M 30 78 L 70 78 L 66 60 L 34 60 Z"/>
    <path d="
      M 34 60
      L 34 48
      Q 34 40 38 36
      L 44 30
      Q 48 22 56 18
      L 64 14
      L 70 10
      L 74 18
      L 76 28
      Q 76 38 70 42
      L 64 44
      L 60 40
      L 55 44
      L 50 52
      L 60 56
      L 66 58
      L 66 60
      Z
    "/>
    <circle cx="60" cy="30" r="2.2" fill="#0a0a0a"/>
  `,

  // Bishop — tall mitre with diagonal slit and top finial.
  b: `
    <ellipse cx="50" cy="88" rx="30" ry="5"/>
    <path d="M 26 84 L 74 84 L 70 78 L 30 78 Z"/>
    <path d="M 32 78 L 68 78 L 64 66 L 36 66 Z"/>
    <ellipse cx="50" cy="64" rx="20" ry="4"/>
    <path d="M 36 62 Q 30 46 40 32 Q 50 14 60 32 Q 70 46 64 62 Z"/>
    <circle cx="50" cy="14" r="4"/>
    <path d="M 47 36 L 53 36 L 53 28 Q 50 24 47 28 Z" fill="#0a0a0a"/>
  `,

  // Queen — domed body with five-point spiked crown and jewels.
  q: `
    <ellipse cx="50" cy="88" rx="33" ry="5"/>
    <path d="M 23 84 L 77 84 L 73 78 L 27 78 Z"/>
    <path d="M 29 78 L 71 78 L 65 60 L 35 60 Z"/>
    <ellipse cx="50" cy="58" rx="22" ry="4"/>
    <path d="M 32 56 Q 34 36 50 30 Q 66 36 68 56 Z"/>
    <path d="M 26 36 L 30 18 L 36 32 L 42 14 L 50 30 L 58 14 L 64 32 L 70 18 L 74 36 Z"/>
    <circle cx="30" cy="18" r="3"/>
    <circle cx="42" cy="14" r="3"/>
    <circle cx="50" cy="14" r="3.5"/>
    <circle cx="58" cy="14" r="3"/>
    <circle cx="70" cy="18" r="3"/>
  `,

  // King — domed body, crown band, cross on top.
  k: `
    <ellipse cx="50" cy="88" rx="33" ry="5"/>
    <path d="M 23 84 L 77 84 L 73 78 L 27 78 Z"/>
    <path d="M 29 78 L 71 78 L 65 58 L 35 58 Z"/>
    <ellipse cx="50" cy="56" rx="22" ry="4"/>
    <path d="M 32 54 Q 34 32 50 28 Q 66 32 68 54 Z"/>
    <rect x="34" y="22" width="32" height="8"/>
    <rect x="46" y="4" width="8" height="22"/>
    <rect x="40" y="10" width="20" height="6"/>
  `,
};

export function pieceSvg(type, color) {
  // type: 'p'|'r'|'n'|'b'|'q'|'k'   color: 'w'|'b'
  const cls = color === 'w' ? 'piece piece-white' : 'piece piece-black';
  return `<svg class="${cls}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${PIECES[type]}</svg>`;
}
