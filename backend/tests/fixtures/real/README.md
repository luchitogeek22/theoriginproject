# Real SPHEREx data (WP-05)

Captured from NASA/IPAC IRSA on 2026-11-11. Nothing here is synthetic.

| File | What it is |
|---|---|
| `*.fits` | One real QR2 cutout per mandatory target. All extensions are untouched except `PSF`, truncated to 3 of 121 planes (about 290 KB each instead of 5 MB). |
| `spherex_qr2_facts.json` | SIA2 columns, extension layout, header keys, `WCS-WAVE` structure and quirks of the products. |
| `spherex_flags.json` | `FLAGS` bit meanings and the mask this project uses. |
| `coverage_2026-11-11.json` | Exposures, detectors, visits and time baselines per target and collection. |
| `observed_cutouts.json` | Per-fixture measurements: target pixel, wavelength at the target, flagged fractions. |
| `targets_simbad.json` | Positions and proper motions from SIMBAD, with provenance. |
| `experiment_wise0855_stack.json` | Result of stacking 20 D6 exposures of WISE 0855, with caveats. |

Fixture to target: `wise0855_d6_20250505`, `barnards_star_d6_20250827`,
`epsilon_indi_b_d6_20251104`, `rw_aurigae_d1_20250904`, `r_draconis_d3_20251226`.

Read the wavelength at a pixel with
`astropy.wcs.WCS(hdul["IMAGE"].header, hdul, key="W").all_pix2world([[x, y]], 0)`.
