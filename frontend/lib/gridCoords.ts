/** Sky position under a point of a sequence frame.
 *
 * Every sequence frame is reprojected by the backend onto one common grid
 * (`backend/app/services/sequence.py::common_grid`): gnomonic (RA---TAN /
 * DEC--TAN), centred on (ra_deg, dec_deg), CRPIX = n/2 + 0.5, CDELT =
 * [-scale, +scale], and the PNG is flipped so north is up and east is left.
 * This inverts that projection, so a click on the image gives the RA/Dec the
 * pixel shows. No dependencies: it is imported by node tests directly.
 */

export interface GridGeometry {
  ra_deg: number;
  dec_deg: number;
  pixel_scale_arcsec: number;
  size_px: number;
}

const RAD = Math.PI / 180;

/**
 * @param fx horizontal position as a fraction of the image width (0 = left edge, 1 = right edge)
 * @param fy vertical position as a fraction of the image height (0 = top edge, 1 = bottom edge)
 */
export function gridFractionToSky(grid: GridGeometry, fx: number, fy: number): { ra: number; dec: number } {
  const n = grid.size_px;
  const scaleDeg = grid.pixel_scale_arcsec / 3600;
  const crpix = n / 2 + 0.5;
  // 0-based pixel i spans [i - 0.5, i + 0.5]; FITS pixels are 1-based.
  const px = fx * n - 0.5 + 1;
  // The PNG row 0 is the top (north) row; FITS row 1 is the bottom one.
  const py = n - 1 - (fy * n - 0.5) + 1;
  const x = (px - crpix) * -scaleDeg * RAD; // intermediate coordinate, positive towards east
  const y = (py - crpix) * scaleDeg * RAD; // positive towards north
  const ra0 = grid.ra_deg * RAD;
  const dec0 = grid.dec_deg * RAD;
  const rho = Math.hypot(x, y);
  if (rho === 0) return { ra: grid.ra_deg, dec: grid.dec_deg };
  const c = Math.atan(rho);
  const sinC = Math.sin(c);
  const cosC = Math.cos(c);
  const dec = Math.asin(cosC * Math.sin(dec0) + (y * sinC * Math.cos(dec0)) / rho);
  const ra = ra0 + Math.atan2(x * sinC, rho * Math.cos(dec0) * cosC - y * Math.sin(dec0) * sinC);
  return { ra: (((ra / RAD) % 360) + 360) % 360, dec: dec / RAD };
}

/** "08h55m10.83s -07°14′42.5″" style text for a position. */
export function formatSexagesimal(raDeg: number, decDeg: number): string {
  const pad = (v: number, width: number, digits = 0) => v.toFixed(digits).padStart(width, "0");
  let raSec = Math.round((((raDeg % 360) + 360) % 360) / 15 * 3600 * 100) / 100;
  if (raSec >= 86400) raSec -= 86400;
  const h = Math.floor(raSec / 3600);
  const m = Math.floor((raSec - h * 3600) / 60);
  const s = raSec - h * 3600 - m * 60;
  const sign = decDeg < 0 ? "-" : "+";
  const decArcsec = Math.round(Math.abs(decDeg) * 3600 * 10) / 10;
  const d = Math.floor(decArcsec / 3600);
  const dm = Math.floor((decArcsec - d * 3600) / 60);
  const ds = decArcsec - d * 3600 - dm * 60;
  return `${pad(h, 2)}h${pad(m, 2)}m${pad(s, 5, 2)}s ${sign}${pad(d, 2)}°${pad(dm, 2)}′${pad(ds, 4, 1)}″`;
}

/** SIMBAD cone search around a position (10″ radius). */
export function simbadUrl(raDeg: number, decDeg: number): string {
  const coord = encodeURIComponent(`${raDeg.toFixed(6)} ${decDeg >= 0 ? "+" : ""}${decDeg.toFixed(6)}`);
  return `https://simbad.cds.unistra.fr/simbad/sim-coo?Coord=${coord}&Radius=10&Radius.unit=arcsec`;
}
