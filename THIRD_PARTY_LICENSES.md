# Third-Party Licenses

This project is licensed under [GPL-3.0](./LICENSE). It bundles the following third-party software, each retaining its own license.

---

## Stockfish (chess engine)

Source: https://github.com/nmrugg/stockfish.js
Vendored as: `stockfish/stockfish.js` and `stockfish/stockfish.wasm`
License: **GPL-3.0** (full text in `LICENSE` and in `stockfish/Copying.txt`)

Stockfish is the chess engine that powers this app's AI opponent. It is the reason this project as a whole is distributed under GPL-3.0.

```
Stockfish, a UCI chess playing engine derived from Glaurung 2.1
Copyright (C) 2004-2024 The Stockfish developers (see AUTHORS file)

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
```

The WebAssembly build is by Nathan Rugg, with contributions sponsored by Chess.com.

---

## chess.js

Source: https://github.com/jhlywa/chess.js
Vendored as: `chess-rules.js`
License: BSD 2-Clause (GPL-compatible)

```
Copyright (c) 2023, Jeff Hlywa (jhlywa@gmail.com)
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice,
   this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE
LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.
```
