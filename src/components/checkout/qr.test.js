import { encodeQR, syndromes, utf8Bytes, __test } from './qr';

const { buildCodewords, interleave, blankMatrix, drawFunctionPatterns, placeData, byteCapacity } = __test;

const toBytes = utf8Bytes;

describe('QR encoder', () => {
  // A block whose Reed-Solomon codewords are correct evaluates to zero
  // at every root of the generator polynomial.
  it.each([1, 2, 4, 5, 8, 9])('produces zero RS syndromes at version %i', (version) => {
    const words = buildCodewords(toBytes('A'.repeat(byteCapacity(version))), version);
    const { blocks, ecLength } = interleave(words, version);
    for (const block of blocks) {
      expect(syndromes([...block.data, ...block.ec], ecLength)).toEqual(new Array(ecLength).fill(0));
    }
  });

  // Reading the data modules back in placement order must return the
  // exact codeword stream — this catches zigzag and reservation bugs.
  it.each([1, 3, 5, 7, 9])('round-trips the codeword stream through the matrix at version %i', (version) => {
    const payload = 'DINEFLOW-' + 'x'.repeat(Math.min(20, byteCapacity(version) - 9));
    const words = buildCodewords(toBytes(payload), version);
    const { stream } = interleave(words, version);

    const size = 17 + 4 * version;
    const m = blankMatrix(size);
    drawFunctionPatterns(m, version);
    placeData(m, stream);

    const bits = [];
    let upward = true;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let step = 0; step < size; step += 1) {
        const row = upward ? size - 1 - step : step;
        for (const col of [right, right - 1]) {
          if (m.reserved[row][col]) continue;
          bits.push(m.modules[row][col] ? 1 : 0);
        }
      }
      upward = !upward;
    }
    const recovered = [];
    for (let i = 0; i + 8 <= stream.length * 8; i += 8) {
      recovered.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
    }
    expect(recovered).toEqual(stream);
  });

  it('keeps the function patterns intact after masking', () => {
    const { size, modules } = encodeQR('https://dineflow.example/pay/ORD-1?amt=245.00');

    const finderIntact = (top, left) => {
      const expected = [
        [1, 1, 1, 1, 1, 1, 1], [1, 0, 0, 0, 0, 0, 1], [1, 0, 1, 1, 1, 0, 1],
        [1, 0, 1, 1, 1, 0, 1], [1, 0, 1, 1, 1, 0, 1], [1, 0, 0, 0, 0, 0, 1], [1, 1, 1, 1, 1, 1, 1],
      ];
      return expected.every((row, r) => row.every((v, c) => modules[top + r][left + c] === (v === 1)));
    };
    expect(finderIntact(0, 0)).toBe(true);
    expect(finderIntact(0, size - 7)).toBe(true);
    expect(finderIntact(size - 7, 0)).toBe(true);

    for (let i = 8; i < size - 8; i += 1) {
      expect(modules[6][i]).toBe(i % 2 === 0);
      expect(modules[i][6]).toBe(i % 2 === 0);
    }
    expect(modules[size - 8][8]).toBe(true);
  });

  it('picks the smallest version that fits and rejects overflow', () => {
    expect(encodeQR('hi').version).toBe(1);
    expect(encodeQR('z'.repeat(120)).version).toBe(7);
    expect(() => encodeQR('z'.repeat(200))).toThrow(/too long/i);
  });
});
