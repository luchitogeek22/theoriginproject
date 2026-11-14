# Challenge resources coverage

Objective: close every gap between the Space Apps Resources tab and the product. Branch: `developer` (project convention). Delivery: work-unit commits on `developer`. Runners: pytest (`backend/.venv`), `node --test` + Playwright (`frontend`).

## Specs

- S1. WiseView-style difference view in the sequence player: show the current frame minus a chosen reference frame, so moving or changing sources stand out. Uses the common-grid, common-scale PNGs (linear mapping per sequence), honest about clipping.
- S2. ePSF (IRSA notebook `spherex-psf`): for v7+ products with an `EPSF` table, use the ePSF of the nearest detector zone to compute the encircled energy inside the photometry aperture and apply it as a per-epoch aperture correction; report the zone and correction. Products without `EPSF` behave exactly as before.
- S3. CSA resources (NEOSSat, CADC, NEOSSat dataset/tutorial): query CADC TAP (`ws.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/argus`, collection `NEOSSAT`) for observations covering the requested coordinates and show count, date range and a CADC link in the time explorer. Live counts 2026-11-13 (r=0.25°): Barnard 652, ε Indi B 2, WISE 0855 7, RW Aur 0, R Dra 8.
- L1 (user, 2026-11-13): "dale completa todo no acabas hasta que termines y marque todo check"

## Tasks

| ID | Spec | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S2 | inline | done | 724534d · RED→GREEN pytest; real DR1 WISE 0855: zone [3,1], EE 0.965 |
| T2 | S3 | inline | done | 806b4de · 5 pytest + 2 e2e; live endpoint R Dra 8 |
| T3 | S1 | inline | done | 587bb90 · 6 unit + 1 e2e; screenshots WISE 0855 / Barnard |
| T4 | all | inline | done | docs/challenge.md resource table all ✅ |

## Log

- L1 2026-11-13: "dale completa todo no acabas hasta que termines y marque todo check"
- 2026-11-13: earlier today shipped DR1 DOI (cce132a) and Aladin npm loader + SPHEREx DR1 HiPS base (80418c5). CDS outage observed.
- Route: inline for all tasks; each unit is under ~250 lines and depends on no other, no writer trigger.
- 2026-11-13: all suites green after T3: backend pytest full, unit 9/9, i18n 18/18, e2e 32/32, tsc clean.
- Not done: `.env.example` CADC_TAP_URL line (file read blocked by a permission rule; default lives in config.py).
