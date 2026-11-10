/** Centralized celestial coordinates. Single source of truth for RA/DEC <-> 3D.
 *
 * Convention (right-handed, Y = north celestial pole):
 *   x = cos(dec) * cos(ra)
 *   y = sin(dec)
 *   z = -cos(dec) * sin(ra)
 * RA increases eastward; RA=0 sits on +X. The grid, markers and footprints
 * in CelestialSphere all derive from radecToVec3 — change it in one place.
 */

export const DEG = Math.PI / 180;

export function radecToVec3(
  raDeg: number,
  decDeg: number,
  radius: number
): [number, number, number] {
  const ra = raDeg * DEG;
  const dec = decDeg * DEG;
  const cosDec = Math.cos(dec);
  return [
    radius * cosDec * Math.cos(ra),
    radius * Math.sin(dec),
    -radius * cosDec * Math.sin(ra),
  ];
}

/** Parse an STC-S s_region polygon into [ra, dec] pairs. Returns null if foreign. */
export function parsePolygonRegion(sRegion: string): Array<[number, number]> | null {
  if (!sRegion) return null;
  const match = sRegion.match(/polygon\s+(?:icrs\s+)?(.+)/i);
  if (!match) return null;
  const nums = match[1].trim().split(/\s+/).map(Number);
  if (nums.length < 6 || nums.length % 2 !== 0 || nums.some((n) => !Number.isFinite(n))) {
    return null;
  }
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
  return pts;
}

export function angularSeparationArcsec(
  ra1: number,
  dec1: number,
  ra2: number,
  dec2: number
): number {
  const dRa = (ra2 - ra1) * DEG;
  const d1 = dec1 * DEG;
  const d2 = dec2 * DEG;
  const sinD =
    Math.sin(d1) * Math.sin(d2) + Math.cos(d1) * Math.cos(d2) * Math.cos(dRa);
  return Math.acos(Math.min(1, Math.max(-1, sinD))) / DEG * 3600;
}

export function mjdToDate(mjd: number | null): string {
  if (mjd === null || !Number.isFinite(mjd)) return "—";
  const unix = (mjd - 40587) * 86400000;
  const d = new Date(unix);
  return Number.isNaN(d.getTime()) ? "—" : d.toISOString().slice(0, 10);
}

export function formatRaDec(ra: number, dec: number): string {
  return `${ra.toFixed(5)}°, ${dec >= 0 ? "+" : ""}${dec.toFixed(5)}°`;
}
