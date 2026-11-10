"use client";

/** Saved research detail + evidence exports (JSON / PDF / CSV / Markdown). */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Download, Loader2 } from "lucide-react";
import { ApiError, api, apiUrl } from "@/lib/api";

type ReportFormat = "json" | "markdown" | "csv" | "pdf";

const EXT: Record<ReportFormat, string> = { json: "json", markdown: "md", csv: "csv", pdf: "pdf" };

function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "untargeted";
}

export default function JournalDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<ReportFormat | null>(null);
  const [dlError, setDlError] = useState("");

  useEffect(() => {
    api
      .getResearch(id)
      .then((d) => setData(d))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Load failed"))
      .finally(() => setLoading(false));
  }, [id]);

  /** Fetch the report and force a file download (never navigate away). */
  const downloadReport = async (format: ReportFormat) => {
    if (downloading) return;
    setDownloading(format);
    setDlError("");
    try {
      const res = await fetch(apiUrl(`/api/v1/evidence/${id}/report?format=${format}`));
      if (!res.ok) {
        let message = `Export failed (${res.status})`;
        try {
          const parsed = (await res.json()) as { detail?: string };
          if (parsed.detail) message = parsed.detail;
        } catch {
          /* keep default */
        }
        throw new Error(message);
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="?([^";]+)"?/);
      const fallback = `research-${slugify(
        String(data?.target_name || data?.title || id)
      )}.${EXT[format]}`;
      const filename = match ? match[1] : fallback;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setDlError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setDownloading(null);
    }
  };

  const payload = (data?.payload ?? {}) as Record<string, unknown>;
  const observations = (payload.observations ?? []) as Array<Record<string, unknown>>;
  const methods = (payload.methods ?? []) as string[];
  const limitations = (payload.limitations ?? []) as string[];
  const candidates = (payload.candidates ?? []) as Array<Record<string, unknown>>;

  return (
    <div className="scroll-thin h-full overflow-y-auto p-3 md:p-4">
      {loading && <p className="flex items-center gap-1 text-xs text-mutedstar"><Loader2 size={13} className="animate-spin" /> Cargando…</p>}
      {error && <p className="text-xs text-red-300">{error}</p>}
      {data && (
        <>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-lg font-bold text-starlight">{String(data.title)}</h1>
            <div className="flex gap-1.5 text-[11px]">
              {(["json", "markdown", "csv", "pdf"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => void downloadReport(f)}
                  disabled={downloading !== null}
                  className="flex items-center gap-1 rounded border border-line px-2 py-1.5 text-mutedstar hover:text-starlight disabled:opacity-40"
                >
                  {downloading === f ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Download size={12} />
                  )}{" "}
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
            {dlError && <p className="mt-1 text-right text-[11px] text-red-300">{dlError}</p>}
          </div>
          <p className="text-xs text-mutedstar">
            Objetivo: {String(data.target_name || "—")} · {String(data.ra_deg ?? "—")}, {String(data.dec_deg ?? "—")} ·
            creada {String(data.created_at ?? "").slice(0, 19).replace("T", " ")}
          </p>
          <p className="mt-0.5 break-all text-[11px] text-mutedstar/70">Enlace reproducible: {String(data.share_url ?? "")}</p>

          <h2 className="mb-1 mt-3 text-xs font-semibold uppercase tracking-widest text-mutedstar">Observaciones ({observations.length})</h2>
          <ul className="flex flex-col gap-1">
            {observations.map((o, i) => (
              <li key={i} className="truncate rounded border border-line bg-deep p-2 text-[11px] text-mutedstar">
                {String(o.obs_id)} [{String(o.collection)}] {String(o.date_obs ?? "")} · det {String(o.detector ?? "—")}
              </li>
            ))}
          </ul>

          <h2 className="mb-1 mt-3 text-xs font-semibold uppercase tracking-widest text-mutedstar">Candidatos ({candidates.length})</h2>
          {candidates.length === 0 && <p className="text-[11px] text-mutedstar">Ninguno registrado.</p>}
          <ul className="flex flex-col gap-1">
            {candidates.map((c, i) => (
              <li key={i} className="rounded border border-line bg-deep p-2 text-[11px] text-mutedstar">
                #{String(c.id)} {String(c.kind)} · SNR {String(c.snr ?? "—")} · Δ {String(c.separation_arcsec ?? "—")}″
              </li>
            ))}
          </ul>

          <h2 className="mb-1 mt-3 text-xs font-semibold uppercase tracking-widest text-mutedstar">Métodos</h2>
          <ul className="flex flex-col gap-0.5">{methods.map((m, i) => (<li key={i} className="text-[11px] text-mutedstar">· {m}</li>))}</ul>

          <h2 className="mb-1 mt-3 text-xs font-semibold uppercase tracking-widest text-mutedstar">Limitaciones</h2>
          <ul className="flex flex-col gap-0.5">{limitations.map((m, i) => (<li key={i} className="text-[11px] text-gold">· {m}</li>))}</ul>
        </>
      )}
    </div>
  );
}
