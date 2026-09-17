/* Minimal QR Code encoder — byte mode, error-correction level M,
   versions 1-9 (up to 180 bytes). Written here rather than pulled from
   npm so the checkout gains no dependency, and so the rendered code is
   a real scannable symbol rather than a decorative stand-in.

   ISO/IEC 18004. Verified by round-trip in qr.test-vector.mjs:
   syndromes of every RS block are zero and the matrix reads back to
   the exact codeword stream that was placed. */

// ── Error correction level M, versions 1-9 ────────────────────
// [ecCodewordsPerBlock, [[blockCount, dataCodewordsPerBlock], ...]]
const EC_M = {
  1: [10, [[1, 16]]],
  2: [16, [[1, 28]]],
  3: [26, [[1, 44]]],
  4: [18, [[2, 32]]],
  5: [24, [[2, 43]]],
  6: [16, [[4, 27]]],
  7: [18, [[4, 31]]],
  8: [22, [[2, 38], [2, 39]]],
  9: [22, [[3, 36], [2, 37]]],
};

const ALIGN = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
  6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46],
};

/* UTF-8 encode without relying on the TextEncoder global, which is
   absent from CRA's jsdom test environment. */
export function utf8Bytes(text) {
  const out = [];
  const str = String(text);
  for (let i = 0; i < str.length; i += 1) {
    let code = str.codePointAt(i);
    if (code > 0xffff) i += 1;                     // consumed a surrogate pair
    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      out.push(
        0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f),
      );
    }
  }
  return out;
}

const dataCodewords = (v) => EC_M[v][1].reduce((sum, [n, k]) => sum + n * k, 0);
// 4-bit mode indicator + 8-bit character count, then whole bytes.
const byteCapacity = (v) => Math.floor((dataCodewords(v) * 8 - 12) / 8);

// ── GF(256), primitive polynomial 0x11D ───────────────────────
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
})();

const mul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

// Coefficients in DESCENDING order, leading 1 first — the synthetic
// division in remainder() indexes gen[i + 1] as the non-leading terms.
function generatorPoly(degree) {
  let poly = [1];
  for (let d = 0; d < degree; d += 1) {
    const next = new Array(poly.length + 1).fill(0);
    for (let i = 0; i < poly.length; i += 1) {
      next[i] ^= poly[i];                        // multiply by x
      next[i + 1] ^= mul(poly[i], EXP[d]);       // multiply by alpha^d
    }
    poly = next;
  }
  return poly;
}

function remainder(data, ecLength) {
  const gen = generatorPoly(ecLength);
  const out = new Array(ecLength).fill(0);
  for (const byte of data) {
    const factor = byte ^ out[0];
    out.shift();
    out.push(0);
    for (let i = 0; i < ecLength; i += 1) out[i] ^= mul(gen[i + 1], factor);
  }
  return out;
}

// Exported for the self-test: a correct codeword block has zero syndromes.
export function syndromes(block, ecLength) {
  const out = [];
  for (let i = 0; i < ecLength; i += 1) {
    let acc = 0;
    for (const byte of block) acc = mul(acc, EXP[i]) ^ byte;
    out.push(acc);
  }
  return out;
}

// ── Bit stream ────────────────────────────────────────────────
function buildCodewords(bytes, version) {
  const total = dataCodewords(version);
  const bits = [];
  const push = (value, length) => {
    for (let i = length - 1; i >= 0; i -= 1) bits.push((value >> i) & 1);
  };

  push(0b0100, 4);          // byte mode
  push(bytes.length, 8);    // character count (8 bits for versions 1-9)
  for (const b of bytes) push(b, 8);

  const capacity = total * 8;
  push(0, Math.min(4, capacity - bits.length));      // terminator
  while (bits.length % 8 !== 0) bits.push(0);        // pad to byte boundary

  const words = [];
  for (let i = 0; i < bits.length; i += 8) {
    words.push(bits.slice(i, i + 8).reduce((acc, bit) => (acc << 1) | bit, 0));
  }
  const PAD = [0xec, 0x11];
  while (words.length < total) words.push(PAD[(words.length - bits.length / 8) % 2]);

  return words;
}

function interleave(words, version) {
  const [ecLength, groups] = EC_M[version];
  const blocks = [];
  let offset = 0;
  for (const [count, size] of groups) {
    for (let i = 0; i < count; i += 1) {
      const data = words.slice(offset, offset + size);
      offset += size;
      blocks.push({ data, ec: remainder(data, ecLength) });
    }
  }

  const out = [];
  const maxData = Math.max(...blocks.map((b) => b.data.length));
  for (let i = 0; i < maxData; i += 1) {
    for (const block of blocks) if (i < block.data.length) out.push(block.data[i]);
  }
  for (let i = 0; i < ecLength; i += 1) {
    for (const block of blocks) out.push(block.ec[i]);
  }
  return { stream: out, blocks, ecLength };
}

// ── Matrix ────────────────────────────────────────────────────
function blankMatrix(size) {
  return {
    modules: Array.from({ length: size }, () => new Array(size).fill(false)),
    reserved: Array.from({ length: size }, () => new Array(size).fill(false)),
    size,
  };
}

function place(m, row, col, dark, reserve = true) {
  m.modules[row][col] = dark;
  if (reserve) m.reserved[row][col] = true;
}

function drawFunctionPatterns(m, version) {
  const { size } = m;

  const finder = (top, left) => {
    for (let r = -1; r <= 7; r += 1) {
      for (let c = -1; c <= 7; c += 1) {
        const rr = top + r;
        const cc = left + c;
        if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
        const inRing = (r >= 0 && r <= 6 && (c === 0 || c === 6)) || (c >= 0 && c <= 6 && (r === 0 || r === 6));
        const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        place(m, rr, cc, inRing || inCore);
      }
    }
  };
  finder(0, 0);
  finder(0, size - 7);
  finder(size - 7, 0);

  for (let i = 8; i < size - 8; i += 1) {
    const dark = i % 2 === 0;
    place(m, 6, i, dark);
    place(m, i, 6, dark);
  }

  const centers = ALIGN[version];
  for (const r of centers) {
    for (const c of centers) {
      // Alignment patterns never overlap the three finders.
      if ((r <= 8 && c <= 8) || (r <= 8 && c >= size - 9) || (r >= size - 9 && c <= 8)) continue;
      for (let dr = -2; dr <= 2; dr += 1) {
        for (let dc = -2; dc <= 2; dc += 1) {
          const ring = Math.max(Math.abs(dr), Math.abs(dc));
          place(m, r + dr, c + dc, ring !== 1);
        }
      }
    }
  }

  place(m, size - 8, 8, true);                     // dark module

  for (let i = 0; i < 9; i += 1) {                 // reserve format areas
    if (!m.reserved[8][i]) place(m, 8, i, false);
    if (!m.reserved[i][8]) place(m, i, 8, false);
  }
  for (let i = 0; i < 8; i += 1) {
    if (!m.reserved[8][size - 1 - i]) place(m, 8, size - 1 - i, false);
    if (!m.reserved[size - 1 - i][8]) place(m, size - 1 - i, 8, false);
  }
  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i += 1) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (version << 12) | rem;
    for (let i = 0; i < 18; i += 1) {
      const a = size - 11 + (i % 3), b = Math.floor(i / 3), dark = ((bits >>> i) & 1) !== 0;
      place(m, b, a, dark); place(m, a, b, dark);
    }
  }
}

function placeData(m, stream) {
  const { size } = m;
  const bits = [];
  for (const byte of stream) for (let i = 7; i >= 0; i -= 1) bits.push((byte >> i) & 1);

  let index = 0;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;                    // skip the vertical timing column
    for (let step = 0; step < size; step += 1) {
      const row = upward ? size - 1 - step : step;
      for (const col of [right, right - 1]) {
        if (m.reserved[row][col]) continue;
        m.modules[row][col] = index < bits.length ? bits[index] === 1 : false;
        index += 1;
      }
    }
    upward = !upward;
  }
  return index;
}

const MASKS = [
  (i, j) => (i + j) % 2 === 0,
  (i) => i % 2 === 0,
  (i, j) => j % 3 === 0,
  (i, j) => (i + j) % 3 === 0,
  (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0,
  (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
  (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0,
  (i, j) => (((i + j) % 2) + ((i * j) % 3)) % 2 === 0,
];

function applyMask(m, maskIndex) {
  const fn = MASKS[maskIndex];
  const out = m.modules.map((row) => row.slice());
  for (let r = 0; r < m.size; r += 1) {
    for (let c = 0; c < m.size; c += 1) {
      if (!m.reserved[r][c] && fn(r, c)) out[r][c] = !out[r][c];
    }
  }
  return out;
}

function formatBits(maskIndex) {
  const data = (0b00 << 3) | maskIndex;           // 0b00 = EC level M
  let rem = data << 10;
  for (let i = 14; i >= 10; i -= 1) {
    if ((rem >> i) & 1) rem ^= 0b10100110111 << (i - 10);
  }
  return (((data << 10) | rem) ^ 0b101010000010010) & 0x7fff;
}

function drawFormat(modules, size, maskIndex) {
  const bits = formatBits(maskIndex);
  const bit = (i) => ((bits >> i) & 1) === 1;
  for (let i = 0; i <= 5; i += 1) modules[i][8] = bit(i);
  modules[7][8] = bit(6);
  modules[8][8] = bit(7);
  modules[8][7] = bit(8);
  for (let i = 9; i <= 14; i += 1) modules[8][14 - i] = bit(i);
  for (let i = 0; i <= 7; i += 1) modules[8][size - 1 - i] = bit(i);
  for (let i = 8; i <= 14; i += 1) modules[size - 15 + i][8] = bit(i);
  modules[size - 8][8] = true;                    // dark module stays dark
}

function penalty(modules, size) {
  let score = 0;

  const runScore = (line) => {
    let run = 1;
    for (let i = 1; i < size; i += 1) {
      if (line[i] === line[i - 1]) {
        run += 1;
      } else {
        if (run >= 5) score += 3 + (run - 5);
        run = 1;
      }
    }
    if (run >= 5) score += 3 + (run - 5);
  };
  for (let r = 0; r < size; r += 1) runScore(modules[r]);
  for (let c = 0; c < size; c += 1) runScore(modules.map((row) => row[c]));

  for (let r = 0; r < size - 1; r += 1) {
    for (let c = 0; c < size - 1; c += 1) {
      const v = modules[r][c];
      if (v === modules[r][c + 1] && v === modules[r + 1][c] && v === modules[r + 1][c + 1]) score += 3;
    }
  }

  const PATTERN = [true, false, true, true, true, false, true, false, false, false, false];
  const matches = (get, start) => {
    for (let i = 0; i < 11; i += 1) if (get(start + i) !== PATTERN[i]) return false;
    return true;
  };
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c <= size - 11; c += 1) {
      if (matches((i) => modules[r][i], c)) score += 40;
      if (matches((i) => modules[r][size - 1 - i], c)) score += 40;
    }
  }
  for (let c = 0; c < size; c += 1) {
    for (let r = 0; r <= size - 11; r += 1) {
      if (matches((i) => modules[i][c], r)) score += 40;
      if (matches((i) => modules[size - 1 - i][c], r)) score += 40;
    }
  }

  let dark = 0;
  for (let r = 0; r < size; r += 1) for (let c = 0; c < size; c += 1) if (modules[r][c]) dark += 1;
  const percent = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;

  return score;
}

/** Encode `text` as a QR symbol. Returns { size, modules } where
 *  modules[row][col] is true for a dark module. */
export function encodeQR(text) {
  const bytes = utf8Bytes(text);

  let version = 0;
  for (let v = 1; v <= 9; v += 1) {
    if (bytes.length <= byteCapacity(v)) { version = v; break; }
  }
  if (!version) throw new Error(`QR payload too long: ${bytes.length} bytes (max ${byteCapacity(9)})`);

  const words = buildCodewords(bytes, version);
  const { stream } = interleave(words, version);

  const size = 17 + 4 * version;
  const matrix = blankMatrix(size);
  drawFunctionPatterns(matrix, version);
  placeData(matrix, stream);

  let best = null;
  for (let mask = 0; mask < 8; mask += 1) {
    const modules = applyMask(matrix, mask);
    drawFormat(modules, size, mask);
    const score = penalty(modules, size);
    if (!best || score < best.score) best = { score, modules };
  }

  return { size, modules: best.modules, version };
}

// Internals exposed only for the round-trip self-test.
export const __test = { buildCodewords, interleave, blankMatrix, drawFunctionPatterns, placeData, dataCodewords, byteCapacity, EC_M };
