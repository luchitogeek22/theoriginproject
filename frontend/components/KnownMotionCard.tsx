"use client";

/**
 * Catalogued motion checked on the same frames as the video (`result.known_motion`): the
 * motion measured between the two halves of the sequence against the catalogue value, and the
 * stack along the catalogued motion that makes a target invisible per frame appear. It
 * confirms a motion already in the catalogue; it never claims a discovery.
 */

import { useFormatter, useLocale, useTranslations } from "next-intl";
import { assetUrl } from "@/lib/api";
import { useTranslateLimitation } from "@/lib/limitations";
import type { KnownMotion } from "@/lib/types";

const DAYS_PER_YEAR = 365.25;

/** Below this median per-frame SNR the target is not detected in single frames. */
const FAINT_FRAME_SNR = 5;

export default function KnownMotionCard({ knownMotion }: { knownMotion?: KnownMotion | null }) {
  const t = useTranslations("knownMotionCard");
  const format = useFormatter();
  const locale = useLocale();
  const translateLimitation = useTranslateLimitation();

  if (!knownMotion) return null;

  /** Backend reasons are English; an untranslated one becomes the generic message. */
  const reasonText = (reason: string | null | undefined, generic: string): string => {
    if (!reason) return generic;
    const translated = translateLimitation(reason);
    return locale !== "en" && translated === reason ? generic : translated;
  };
  const num = (value: number, digits = 2) => format.number(value, { maximumFractionDigits: digits });

  if (!knownMotion.ok) {
    return (
      <p data-testid="known-motion-card" className="mb-3 text-[11px] text-mutedstar">
        {t("unavailable", { reason: reasonText(knownMotion.reason, t("genericReason")) })}
      </p>
    );
  }

  const { reference, detection, measured } = knownMotion;
  /** "Invisible in each frame" is only true for a target that is not detected frame by frame. */
  const faintPerFrame =
    detection?.median_frame_snr !== undefined && detection.median_frame_snr < FAINT_FRAME_SNR;
  const pAtFloor =
    !!detection?.n_null && detection.p_value <= (1 / (detection.n_null + 1)) * 1.000001;
  const stackUrl = knownMotion.stack_png_url ? assetUrl(knownMotion.stack_png_url) : null;

  return (
    <section
      data-testid="known-motion-card"
      aria-label={t("title")}
      className="mb-3 rounded border border-line bg-deep p-3 text-xs text-mutedstar"
    >
      <h2 className="text-sm font-semibold text-starlight">{t("title")}</h2>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1 space-y-1">
          {measured?.measurable === true ? (
            <>
              <p className="text-starlight">
                {measured.baseline_days > 0
                  ? t("measured", {
                      value: num(measured.measured_arcsec_yr),
                      error: num(measured.uncertainty_arcsec * (DAYS_PER_YEAR / measured.baseline_days)),
                    })
                  : t("measuredNoError", { value: num(measured.measured_arcsec_yr) })}
              </p>
              {reference && (
                <p>{t("catalogue", { source: reference.source, value: num(reference.total_arcsec_yr) })}</p>
              )}
              <p>{t("agreement", { sigma: num(measured.agreement_sigma, 1) })}</p>
              <p className="text-[11px]">
                {t("shift", {
                  days: num(measured.baseline_days, 0),
                  measured: num(measured.measured_arcsec, 1),
                  predicted: num(measured.predicted_arcsec, 1),
                })}
              </p>
            </>
          ) : (
            <>
              {reference && (
                <p>{t("catalogue", { source: reference.source, value: num(reference.total_arcsec_yr) })}</p>
              )}
              {measured && (
                <p className="text-gold">
                  {t("notMeasurable", { reason: reasonText(measured.reason, t("genericReason")) })}
                </p>
              )}
            </>
          )}
          {detection && (
            <p className="text-starlight">
              {t(faintPerFrame ? "detection" : "detectionVisible", {
                snr: detection.median_frame_snr === undefined ? "?" : num(detection.median_frame_snr, 1),
                visits: detection.n_visits,
                p: format.number(detection.p_value, { maximumSignificantDigits: 2 }),
              })}
              {pAtFloor && <> {t("pFloor", { nNull: detection.n_null ?? 0 })}</>}
            </p>
          )}
          <p className="text-[11px] text-mutedstar/80">{t("honesty")}</p>
        </div>
        {stackUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- science PNG served by the API, shown as is
          <img
            src={stackUrl}
            alt={t("imageAlt")}
            width={128}
            height={128}
            className="h-32 w-32 flex-none rounded border border-line bg-abyss object-contain [image-rendering:pixelated]"
          />
        )}
      </div>
    </section>
  );
}
