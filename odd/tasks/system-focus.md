# System focus for the submission

Objective: cut the product to one flow, surface the measured motion and the known-motion detection in the explorer, fix light-curve and spectral issues, close the vetting write hole. Branch: `developer` (project convention, parent commits). Delivery: work-unit commits on `developer`. Runners: pytest (`backend/.venv/bin/python -m pytest`), `npm run test:unit`, `npm run test:i18n`, `npx playwright test`, `npx tsc --noEmit` (in `frontend/`).

## Specs

- S2. Hide Living Sky, Candidates, Discoveries, Journal and Login behind a flag that is easy to turn back on. User words: "ocultalos con una bandera por fa que sea facil de volver a ponerlos". One env flag `NEXT_PUBLIC_SHOW_EXTRA_PAGES` (default off = hidden). When off: not in the sidebar, no buttons/links lead to them (observatory "Explorar el cielo" / "Buscar un objeto" etc.), direct URL returns the normal not-found page. When `true`: everything is exactly as before. Documented in `docs/deployment.md` and `.env.example` is NOT edited (permission rule); document in docs instead.
- S3. Measured motion on the same frames as the video, compared with the catalogue (Gaia / known proper motion). No extra downloads, no new storage beyond one small PNG. Must work for any coordinate with a known proper motion; when there is none or too few frames, say so.
- S4. The known-motion stack detection (`targeted_check`: target invisible per frame, appears when stacking along its motion, empirical p-value) is shown in the main explorer, not only in the folded Planet X panel.
- S5. Light curves: Gaia field queries cached per field (long TTL) so a Gaia 429 does not leave curves absolute when a cached answer exists; the wavelength filter is applied over the frames already downloaded (no extra downloads); the comparison-star note no longer contradicts itself ("Only 3 ... at least 3 needed").
- S6. The real multi-detector spectrum (`SpectrumPanel`) is reachable inside the time explorer; the "spatial profile" tool (`services/spectral.py` strip vs wavelength) is no longer offered in the UI.
- S7. Target-card mini curves (`TargetCurve.tsx`) are visibly labelled as illustrations.
- S8. `POST /api/v1/analysis/vet` must not write without authentication when auth is configured, and `GET /candidates` lists only the caller's candidates; with auth unconfigured (anonymous dev mode) behaviour stays as today. User's item 8: "Que la verificación de candidatos no escriba sin autenticación". (Corrected 2026-11-14: the earlier wording "any other candidate-writing endpoint" over-reached; `/analysis/temporal|differential|spectral` are anonymous on purpose since c2658e8 and `test_analysis_is_public_even_when_auth_is_configured` pins it.)
- L1 (user, 2026-11-13): "Inicia pero ocultalos con una bandera por fa que sea facil de volver a ponerlos en el paso 2 ok? avanza la 3 y la todo hasta la 8 la 1 ya yo me encargo adeltn haz todas pro favor me avisas cuando acabes."

### Shared contract (S3 + S4): `result["known_motion"]` in motion-mode sequence results

Present only in motion mode. Absent key = old cached result (frontend must tolerate).

```json
{
  "ok": true,
  "reason": null,
  "reference": {"source": "Gaia DR3", "pm_ra_mas_yr": -802.8, "pm_dec_mas_yr": 10362.5, "total_arcsec_yr": 10.39},
  "detection": {"observed_sigma": 12.1, "p_value": 0.0005, "sigma_equivalent": 3.3, "offset_px": 0.4, "n_visits": 12, "median_frame_snr": 2.6},
  "measured": {"measurable": true, "baseline_days": 190.0, "measured_arcsec": 5.6, "predicted_arcsec": 5.4,
               "measured_arcsec_yr": 10.8, "predicted_arcsec_yr": 10.39, "difference_arcsec": 0.4, "uncertainty_arcsec": 1.9,
               "agreement_sigma": 0.2},
  "stack_png_url": "/api/v1/sequences/<key>/known_motion.png",
  "limitations": ["..."]
}
```

- `ok=false` with `reason` (English sentence, frontend translates by pattern via `lib/limitations.ts` or shows a generic key) when no proper motion is known, fewer than 4 frames, or the field is too large to compute quickly.
- `measured.measurable=false` with `reason` when the target cannot be located in each half (e.g. WISE 0855 too faint): the UI then shows the detection only.
- Numbers above are illustrative only.

## Tasks

| ID | Spec | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S3, S4, S5, S8 (backend) | delegated writer (parallel unit, disjoint surface) | done | bcf852f (S3–S5), 9457eb2 (S8); 384 pytest; ruff clean |
| T2 | S2, S6, S7, S3/S4 card (frontend) | delegated writer (parallel unit, disjoint surface) | done | 560fd85; e2e 47/47 twice, tsc, unit 9/9, i18n 18/18 |
| T3 | all | inline (parent) | done | real IRSA run (below); saturation rule; reason translations; e2e autoplay race fixed |

## Log

- L1 2026-11-13: "Inicia pero ocultalos con una bandera por fa que sea facil de volver a ponerlos en el paso 2 ok? avanza la 3 y la todo hasta la 8 la 1 ya yo me encargo adeltn haz todas pro favor me avisas cuando acabes."
- Discovery: `shift_stack.measure_motion` and `targeted_check` already exist and run only in the shift-stack job (`routers/sequences.py:267-283`); the frontend never shows `measured_motion`.
- Route evidence: two independent units with disjoint edit surfaces (backend vs frontend), each several files / 100+ lines, launched together → Writer trigger (a). Parent owns git and integration.
- 2026-11-14 real IRSA run (local backend, DR1+QR3, no cache): ε Indi B measured 3.96 ± 1.66″/yr vs 4.68 (0.5σ); WISE 0855 11.96 ± 3.83″/yr vs 8.15 (1.2σ), median frame SNR 2.6, detected only when stacked; Barnard first gave 17.6 vs 10.39 (4.7σ) because its core saturates (light curve uses psf_wings) → new rule: saturated/flagged target is reported as not measurable, detection kept.
- Detection p-value sits at the test floor 1/(n_null+1) ≈ 0.00048 for all three; the card now says it is a bound.
- Local `backend/.env` still lists QR2/QR3 collections and overrides the DR1 default (production uses discovery and is fine).
- RDD: global off → no native review. S8 (high-risk item 2) gets an independent verifier.
- 2026-11-14 independent verifier on 9457eb2: vet/list with auth on PASS (401/404, nothing written, owner can vet); auth off byte-identical to base 43dc778 (13-request probe diff empty); token forgery PASS (alg none, wrong secret, expired, wrong audience → 401). Flagged the anonymous analysis endpoints as unmet; resolved as a spec over-reach (see S8). Advisory for the user: with auth on, candidates created anonymously have user_id=None and nobody can list or vet them.
