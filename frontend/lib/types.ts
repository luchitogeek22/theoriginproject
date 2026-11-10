/** Shared API + domain types. Mirror of backend/app/schemas.py. */

export type DataClass =
  | "OBSERVED_DATA"
  | "PROCESSED_DATA"
  | "COMPUTED_MEASUREMENT"
  | "PRELIMINARY_INTERPRETATION";

export interface Provenance {
  source: string;
  collection: string;
  obs_id: string;
  access_url: string;
  queried_at: string;
  cached: boolean;
  data_class: DataClass;
}

export interface Target {
  name: string;
  catalog_id: string;
  ra_deg: number;
  dec_deg: number;
  frame: string;
  epoch: string;
  resolver: string;
  warning: string;
  record_id: number | null;
}

export interface Observation {
  id: number | null;
  obs_id: string;
  collection: string;
  ra_deg: number | null;
  dec_deg: number | null;
  fov_deg: number | null;
  t_min_mjd: number | null;
  t_max_mjd: number | null;
  date_obs: string;
  instrument: string;
  detector: string;
  band: string;
  dataproduct_type: string;
  access_url: string;
  access_format: string;
  filesize_bytes: number | null;
  s_region: string;
  provenance?: Provenance | null;
}

export interface SearchResult {
  count: number;
  items: Observation[];
  queried_at: string;
  cached: boolean;
  collections_queried: string[];
  warnings: string[];
}

export interface Cutout {
  cutout_id: number;
  observation_id: number;
  storage_key: string;
  preview_url: string;
  sha256: string;
  size_bytes: number;
  source_url: string;
  fits_summary: Record<string, unknown>;
  warning: string;
}

export interface JobStatus {
  job_id: string;
  kind: string;
  status: "queued" | "running" | "completed" | "failed";
  error: string;
}

export interface Candidate {
  id: number;
  kind: string;
  ra_deg: number;
  dec_deg: number;
  job_id: string;
  separation_arcsec: number | null;
  separation_err_arcsec: number | null;
  delta_mag: number | null;
  snr: number | null;
  quality: string;
  evidence: Record<string, unknown>;
  user_id: string | null;
}

export interface ReferenceStar {
  name: string;
  ra_deg: number;
  dec_deg: number;
  mag: number;
}

export interface DataSource {
  name: string;
  reachable: boolean;
  latency_ms: number | null;
  detail: string;
  checked_at: string;
}

export type Mode = "explore" | "investigate";

export interface Epoch {
  key: string;
  label: string;
  mjd: number | null;
  observations: Observation[];
}

export interface SpectralSample {
  row: number;
  flux: number;
  flux_err: number | null;
  wavelength_um: number | null;
}
