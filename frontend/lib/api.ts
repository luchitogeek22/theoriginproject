/** Typed API client for the scientific backend. All failures surface honestly. */

import type {
  Candidate,
  Cutout,
  DataSource,
  JobStatus,
  Observation,
  ReferenceStar,
  SearchResult,
  SpectralSample,
  Target,
} from "./types";
import { getAccessToken } from "@/lib/supabase/client";

export function resolveBase(value: string | undefined, production: boolean): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return production ? null : "http://localhost:8000";
  if (!/^https?:\/\//i.test(raw)) return null;
  try {
    new URL(raw);
  } catch {
    return null;
  }
  return raw.replace(/\/+$/, "");
}

export function parseErrorBody(status: number, contentType: string, body: string): string {
  const fallback = `Request failed (${status}).`;
  if (!contentType.toLowerCase().includes("json")) return fallback;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return fallback;
  }
  const detail = (parsed as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string" && detail) return detail.slice(0, 300);
  if (Array.isArray(detail)) {
    const parts = detail.map(formatValidationItem).filter(Boolean);
    if (parts.length) return parts.join("; ").slice(0, 300);
  }
  return fallback;
}

function formatValidationItem(item: unknown): string {
  if (typeof item === "string") return item;
  if (!item || typeof item !== "object") return "";
  const { loc, msg } = item as { loc?: unknown; msg?: unknown };
  if (typeof msg !== "string") return "";
  const field = Array.isArray(loc) ? loc.filter((p) => p !== "body" && p !== "query").join(".") : "";
  return field ? `${field}: ${msg}` : msg;
}

const BASE = resolveBase(process.env.NEXT_PUBLIC_API_URL, process.env.NODE_ENV === "production");

const NOT_CONFIGURED =
  "The API address is not configured. Set NEXT_PUBLIC_API_URL to the backend URL (https://...).";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (BASE === null) throw new ApiError(0, NOT_CONFIGURED);
  let authHeader: Record<string, string> = {};
  try {
    const token = await getAccessToken();
    if (token) authHeader = { Authorization: `Bearer ${token}` };
  } catch {
    /* anonymous mode: request without identity */
  }
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...authHeader,
        ...(init?.headers ?? {}),
      },
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError(0, "Backend unreachable. Is the scientific service running?");
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiError(res.status, parseErrorBody(res.status, contentType, body));
  }
  if (res.status === 204) return undefined as T;
  if (!contentType.toLowerCase().includes("json")) {
    throw new ApiError(
      res.status,
      "The server returned a non-JSON response. Check that NEXT_PUBLIC_API_URL points to the backend."
    );
  }
  try {
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError(res.status, "The server returned an invalid JSON response.");
  }
}

export const apiUrl = (path: string) =>
  path.startsWith("http") ? path : BASE === null ? "" : `${BASE}${path.startsWith("/") ? "" : "/"}${path}`;

export const api = {
  health: () => request<{ status: string }>("/api/v1/health"),
  dataSources: () =>
    request<{ sources: DataSource[]; archive_note: string }>("/api/v1/data-sources/status"),
  resolveTarget: (body: { name?: string; ra_deg?: number; dec_deg?: number; catalog_id?: string }) =>
    request<Target>("/api/v1/targets/resolve", { method: "POST", body: JSON.stringify(body) }),
  searchObservations: (body: {
    ra_deg: number;
    dec_deg: number;
    radius_arcmin: number;
    collections?: string[];
    maxrec?: number;
  }) => request<SearchResult>("/api/v1/observations/search", { method: "POST", body: JSON.stringify(body) }),
  getObservation: (id: number) => request<Observation>(`/api/v1/observations/${id}`),
  createCutout: (
    body: { observation_id: number; ra_deg: number; dec_deg: number; size_arcmin: number },
    init?: RequestInit
  ) =>
    request<Cutout>("/api/v1/cutouts", {
      method: "POST",
      body: JSON.stringify(body),
      ...init,
    }),
  analyzeTemporal: (body: { cutout_a_id: number; cutout_b_id: number; ra_deg?: number; dec_deg?: number }) =>
    request<JobStatus>("/api/v1/analysis/temporal", { method: "POST", body: JSON.stringify(body) }),
  analyzeDifferential: (body: { cutout_a_id: number; cutout_b_id: number }) =>
    request<JobStatus>("/api/v1/analysis/differential", { method: "POST", body: JSON.stringify(body) }),
  analyzeSpectral: (body: { cutout_id: number; ra_deg: number; dec_deg: number }) =>
    request<JobStatus>("/api/v1/analysis/spectral", { method: "POST", body: JSON.stringify(body) }),
  jobStatus: (jobId: string) => request<JobStatus>(`/api/v1/jobs/${jobId}`),
  jobResults: <T = Record<string, unknown>>(jobId: string) =>
    request<{ job_id: string; kind: string; status: string; result: T; error: string }>(
      `/api/v1/jobs/${jobId}/results`
    ),
  candidates: (limit = 100) => request<Candidate[]>(`/api/v1/candidates?limit=${limit}`),
  referenceStars: () => request<ReferenceStar[]>("/api/v1/sky/reference-stars"),
  saveResearch: (body: {
    title: string;
    target_name: string;
    ra_deg: number | null;
    dec_deg: number | null;
    payload: Record<string, unknown>;
  }) => request<{ id: string; share_url: string } & Record<string, unknown>>("/api/v1/research", {
    method: "POST",
    body: JSON.stringify(body),
  }),
  getResearch: (id: string) =>
    request<Record<string, unknown>>(`/api/v1/research/${id}`),
};

/** Poll a job until it completes or fails. Throws ApiError on failure/timeout. */
export async function pollJob<T>(
  jobId: string,
  opts: { intervalMs?: number; timeoutMs?: number } = {}
): Promise<T> {
  const interval = opts.intervalMs ?? 1500;
  const deadline = Date.now() + (opts.timeoutMs ?? 10 * 60 * 1000);
  for (;;) {
    const status = await api.jobStatus(jobId);
    if (status.status === "completed") {
      const full = await api.jobResults<T>(jobId);
      return full.result;
    }
    if (status.status === "failed") {
      throw new ApiError(500, status.error || "Analysis failed on the scientific service.");
    }
    if (Date.now() > deadline) throw new ApiError(504, "Analysis timed out. Try again later.");
    await new Promise((r) => setTimeout(r, interval));
  }
}

export interface SpectralResult {
  data_class: string;
  detector: string;
  band: string;
  date_obs: string;
  wavelength_unit: string;
  flux_unit: string;
  samples: SpectralSample[];
  n_samples: number;
  limitations: string[];
}

export interface TemporalResult {
  data_class: string;
  aligned: boolean;
  valid_fraction: number;
  background_mjy_sr: Record<string, number>;
  difference_stats: Record<string, number>;
  detections: Array<{
    label: number;
    npixels: number;
    peak_snr: number;
    x_centroid: number;
    y_centroid: number;
    classification: string;
  }>;
  astrometry: {
    measured: boolean;
    ra_a_deg?: number;
    dec_a_deg?: number;
    ra_b_deg?: number;
    dec_b_deg?: number;
    separation_arcsec?: number;
    separation_err_arcsec?: number | null;
    note?: string;
  };
  limitations: string[];
  artifacts?: Record<string, string>;
  inputs?: Record<string, Record<string, unknown>>;
}
