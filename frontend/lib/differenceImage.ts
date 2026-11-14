/**
 * WiseView-style difference of two sequence frames, computed on the displayed PNGs.
 *
 * Every frame of a sequence shares one grid and one linear grey mapping (backend `_to_png`), so
 * the grey difference is proportional to the physical difference, clipped where the display scale
 * saturates. Pixels without data are painted in the backend's neutral colour and stay neutral here.
 */

/** Backend `NEUTRAL_RGB`: pixels with no data. Grey levels always have R = G = B, so never collide. */
export const NO_DATA_RGB = [58, 66, 84] as const;
/** Brighter now than in the reference frame (something arrived or brightened). */
export const BRIGHTER_RGB = [255, 182, 74] as const;
/** Fainter now than in the reference frame (something left or dimmed). */
export const FAINTER_RGB = [70, 216, 255] as const;

/** Grey-level change that maps to full colour intensity. */
const FULL_SCALE = 128;

function isNoData(data: Uint8ClampedArray, i: number): boolean {
  return data[i] === NO_DATA_RGB[0] && data[i + 1] === NO_DATA_RGB[1] && data[i + 2] === NO_DATA_RGB[2];
}

function median(values: Int16Array): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort();
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Robust standard deviation (1.4826 x MAD) of the grey difference over pixels with data. */
export function differenceNoise(current: Uint8ClampedArray, reference: Uint8ClampedArray): number {
  const deltas: number[] = [];
  for (let i = 0; i < current.length; i += 4) {
    if (!isNoData(current, i) && !isNoData(reference, i)) deltas.push(current[i] - reference[i]);
  }
  const values = Int16Array.from(deltas);
  const centre = median(values);
  return 1.4826 * median(values.map((d) => Math.abs(d - centre)));
}

export interface DifferenceOptions {
  /** Hide changes within this many robust sigmas of the difference itself (frame noise). */
  noiseSigmas?: number;
}

/** RGBA pixels of `current - reference`; both arrays are RGBA of the same size. */
export function differenceRgba(
  current: Uint8ClampedArray,
  reference: Uint8ClampedArray,
  options: DifferenceOptions = {}
): Uint8ClampedArray {
  if (current.length !== reference.length) {
    throw new RangeError("frames must have the same size");
  }
  const threshold = options.noiseSigmas ? options.noiseSigmas * differenceNoise(current, reference) : 0;
  const out = new Uint8ClampedArray(current.length);
  for (let i = 0; i < current.length; i += 4) {
    out[i + 3] = 255;
    if (isNoData(current, i) || isNoData(reference, i)) {
      out[i] = NO_DATA_RGB[0];
      out[i + 1] = NO_DATA_RGB[1];
      out[i + 2] = NO_DATA_RGB[2];
      continue;
    }
    const delta = current[i] - reference[i];
    const colour = delta >= 0 ? BRIGHTER_RGB : FAINTER_RGB;
    const strength = Math.abs(delta) <= threshold ? 0 : Math.min(1, Math.abs(delta) / FULL_SCALE);
    out[i] = Math.round(colour[0] * strength);
    out[i + 1] = Math.round(colour[1] * strength);
    out[i + 2] = Math.round(colour[2] * strength);
  }
  return out;
}
