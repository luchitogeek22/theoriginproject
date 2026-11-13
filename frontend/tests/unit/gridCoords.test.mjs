// Click-to-coordinates must match the backend grid exactly.
// Expected values: astropy WCS.pixel_to_world on the grid built like
// backend/app/services/sequence.py::common_grid (generated 2026-11-13).
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatSexagesimal, gridFractionToSky } from "../../lib/gridCoords.ts";

// [ra0, dec0, n, ix, iy (0-based, FITS bottom-up), ra, dec]
const ASTROPY = [
  [133.818908, -7.247048, 59, 0, 0, 133.868854099, -7.296586912],
  [133.818908, -7.247048, 59, 58, 58, 133.768972883, -7.197503641],
  [133.818908, -7.247048, 59, 3, 54, 133.863678096, -7.204337498],
  [133.818908, -7.247048, 59, 29, 29, 133.818908, -7.247048],
  [248.167611, 66.754979, 585, 0, 0, 249.40625204, 66.251222877],
  [248.167611, 66.754979, 585, 584, 584, 246.877735372, 67.248621591],
  [248.167611, 66.754979, 585, 3, 580, 249.443877308, 67.24189629],
  [0.01, 89.9, 293, 0, 0, 35.529610704, 89.570701917],
  [0.01, 89.9, 293, 292, 292, 239.085727968, 89.709257094],
  [0.01, 89.9, 293, 3, 288, 120.280354507, 89.717146512],
];

const sepArcsec = (ra1, dec1, ra2, dec2) => {
  const r = Math.PI / 180;
  const cos =
    Math.sin(dec1 * r) * Math.sin(dec2 * r) + Math.cos(dec1 * r) * Math.cos(dec2 * r) * Math.cos((ra1 - ra2) * r);
  return (Math.acos(Math.min(1, cos)) / r) * 3600;
};

test("pixel centres match astropy within 0.01 arcsec", () => {
  for (const [ra0, dec0, n, ix, iy, ra, dec] of ASTROPY) {
    const grid = { ra_deg: ra0, dec_deg: dec0, pixel_scale_arcsec: 6.15, size_px: n };
    const got = gridFractionToSky(grid, (ix + 0.5) / n, (n - 1 - iy + 0.5) / n);
    assert.ok(sepArcsec(got.ra, got.dec, ra, dec) < 0.01, `${ra0},${dec0} px ${ix},${iy}: ${got.ra},${got.dec}`);
  }
});

test("image centre is the grid centre; east is left and north is up", () => {
  const grid = { ra_deg: 133.818908, dec_deg: -7.247048, pixel_scale_arcsec: 6.15, size_px: 59 };
  const c = gridFractionToSky(grid, 0.5, 0.5);
  assert.ok(sepArcsec(c.ra, c.dec, grid.ra_deg, grid.dec_deg) < 1e-6);
  assert.ok(gridFractionToSky(grid, 0.1, 0.5).ra > grid.ra_deg);
  assert.ok(gridFractionToSky(grid, 0.5, 0.1).dec > grid.dec_deg);
});

test("sexagesimal text", () => {
  assert.equal(formatSexagesimal(133.795129, -7.245147), "08h55m10.83s -07°14′42.5″");
  assert.equal(formatSexagesimal(359.99999999, 0), "00h00m00.00s +00°00′00.0″");
});
