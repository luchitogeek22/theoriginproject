// WiseView-style difference of two displayed frames (same grid, same linear scale).
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { BRIGHTER_RGB, FAINTER_RGB, NO_DATA_RGB, differenceRgba } from "../../lib/differenceImage.ts";

const px = (...rgb) => [...rgb, 255];
const grey = (v) => px(v, v, v);

test("an unchanged pixel is black", () => {
  const out = differenceRgba(new Uint8ClampedArray(grey(90)), new Uint8ClampedArray(grey(90)));
  assert.deepEqual([...out], px(0, 0, 0));
});

test("a pixel brighter than the reference is orange, scaled by the change", () => {
  const out = differenceRgba(new Uint8ClampedArray(grey(200)), new Uint8ClampedArray(grey(72)));
  // |d| = 128 -> full intensity
  assert.deepEqual([...out], px(...BRIGHTER_RGB));
  const half = differenceRgba(new Uint8ClampedArray(grey(136)), new Uint8ClampedArray(grey(72)));
  assert.deepEqual([...half], px(...BRIGHTER_RGB.map((c) => Math.round(c * 0.5))));
});

test("a pixel fainter than the reference is blue", () => {
  const out = differenceRgba(new Uint8ClampedArray(grey(10)), new Uint8ClampedArray(grey(250)));
  assert.deepEqual([...out], px(...FAINTER_RGB));
});

test("pixels without data in either frame stay neutral", () => {
  const noData = px(58, 66, 84);
  const a = differenceRgba(new Uint8ClampedArray(noData), new Uint8ClampedArray(grey(10)));
  const b = differenceRgba(new Uint8ClampedArray(grey(10)), new Uint8ClampedArray(noData));
  assert.deepEqual([...a], px(...NO_DATA_RGB));
  assert.deepEqual([...b], px(...NO_DATA_RGB));
});

test("arrays of different length are rejected", () => {
  assert.throws(() => differenceRgba(new Uint8ClampedArray(4), new Uint8ClampedArray(8)), RangeError);
});

test("changes within the noise of the difference are hidden; real changes keep their colour", () => {
  // 400 noisy pixels (|d| <= 6) and one real change of +120 grey levels.
  const n = 401;
  const current = new Uint8ClampedArray(n * 4);
  const reference = new Uint8ClampedArray(n * 4);
  for (let p = 0; p < n; p += 1) {
    const noise = p === n - 1 ? 120 : ((p * 7) % 13) - 6;
    const ref = 80;
    for (let c = 0; c < 3; c += 1) {
      current[p * 4 + c] = ref + noise;
      reference[p * 4 + c] = ref;
    }
    current[p * 4 + 3] = reference[p * 4 + 3] = 255;
  }
  const out = differenceRgba(current, reference, { noiseSigmas: 3 });
  for (let p = 0; p < n - 1; p += 1) assert.deepEqual([...out.slice(p * 4, p * 4 + 4)], [0, 0, 0, 255], `pixel ${p}`);
  const last = [...out.slice((n - 1) * 4, n * 4)];
  assert.ok(last[0] > 150 && last[1] > 100, `real change stays orange: ${last}`);
});
