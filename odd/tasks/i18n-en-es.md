# i18n EN/ES for the whole frontend
Objective: end-to-end internationalization (English default, Spanish second) with next-intl, extensible to new locales by config + message files.
Branch: `feat/i18n-en-es` (from `developer`). Delivery: ask-on-risk. Runner: `tsc --noEmit`, `next build`, `node --test` (parity), Playwright e2e.

## Specs

- S1 Languages: "Inglés (`en`): idioma predeterminado de toda la aplicación." / "Español (`es`): segundo idioma disponible." "Toda la aplicación debe utilizar inglés por defecto, incluyendo la primera visita de un usuario sin preferencias guardadas."
- S2 Extensibility: "La arquitectura debe permitir incorporar nuevos idiomas posteriormente sin tener que modificar componentes, páginas o lógica de negocio."
- S3 Architecture: "Separar los textos de traducción de los componentes." "Evitar textos visibles escritos directamente en JSX/TSX." "Utilizar tipado fuerte con TypeScript." "Detectar traducciones faltantes durante desarrollo." "Mantener una estructura consistente entre idiomas." Use a mature library (next-intl) instead of a custom system.
- S4 Default and persistence: "El idioma predeterminado debe ser inglés (`en`)." "La selección del idioma debe persistir entre visitas." "Al navegar entre páginas, debe mantenerse el idioma seleccionado." "Al recargar la página, debe conservarse la preferencia." "No implementes detección automática por navegador como comportamiento prioritario."
- S5 Coverage: "La traducción debe cubrir el 100 % de los textos propios de la aplicación." — "tanto para la lading como para las demas pantallas".
- S6 Scientific data: "No traduzcas identificadores, nombres técnicos oficiales, códigos, coordenadas ni valores científicos." "Las fechas, horas, números y cantidades deben utilizar formatos localizados." "No inventes traducciones científicas ni afirmes que NASA proporciona traducciones cuando no sea así."
- S7 SEO: URLs per language, `hreflang`, canonical, translated metadata, localized Open Graph, sitemap with language variants, `html lang`.
- S8 Language switcher: current language, native names "English" and "Español", keyboard accessible, keeps current page, existing design.
- S9 Messages by functional domain; Spanish has "exactamente las mismas claves y estructura".
- S10 Server Components by default; no hydration errors; no new unnecessary dependencies.
- S11 Automated tests for critical i18n aspects; tsc and console clean.
- S12 Final report: architecture, default resolution, persistence, how to add `fr`, how to add translations, files, tests, limitations.

Decisions: `localePrefix: "as-needed"` (English unprefixed keeps `/time-explorer` embed URL and existing links; Spanish under `/es`). Locale cookie `NEXT_LOCALE` 1 year. `Accept-Language` ignored so first visit is English. Scientific values (coordinates, wavelengths, fluxes, IDs, mission/instrument names) keep invariant formatting; dates and human counts use locale formatting. Audit decision D4 ("interfaz en español") is superseded by this request.

## Tasks

- T1 S1-S4,S7,S8,S10 — next-intl infra, `[locale]` routes, middleware (+auth guard), switcher, metadata/sitemap — route: inline — status: done (build green; curl smoke: first visit en with Accept-Language es, cookie 1y set/updated, hreflang+canonical, embed headers, es 404)
- T2 S3,S5,S6 — shared `lib/` texts (limitations, motion, api, useJob, sequenceExport, targets) — route: inline (shared contract) — status: pending
- T3 S5 — app pages under `app/[locale]/(app)` — route: delegated (parallel units, disjoint surfaces) — status: pending
- T4 S5 — analysis components (SequencePlayer, CutoutComparison, ShiftStackPanel, …) — route: delegated (parallel) — status: pending
- T5 S5 — small shared components + landing — route: delegated (parallel) — status: pending
- T6 S9,S11,S12 — parity test, e2e i18n spec, e2e text updates, docs — route: inline — status: pending

## Log

- L1 (2026-11-12) User request: full i18n prompt (EN default, ES second, next-intl evaluation, SEO, switcher, tests, final report) + "tanto para la lading como para las demas pantallas ok?"
- L2 Audit: Next 14.2.35 App Router, React 18.3.1, TS 5.6.3; ~40 files with hardcoded Spanish; landing already English; backend sends English limitation text that `lib/limitations.ts` translates to Spanish via regex; `html lang="es"` fixed; no unit test runner (audit D11).
- L3 (2026-11-12) User correction: "no llames la carpete messages llamale locales por fa" — translation files live in `frontend/locales/<locale>/*.json`.
