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
  pm_ra_mas_yr: number | null;
  pm_dec_mas_yr: number | null;
  propagated_ra_deg: number | null;
  propagated_dec_deg: number | null;
  propagated_epoch: string | null;
}

export interface Observation {
  id: number | null;
  obs_id: string;
  product_id: string;
  collection: string;
  ra_deg: number | null;
  dec_deg: number | null;
  fov_deg: number | null;
  t_min_mjd: number | null;
  t_max_mjd: number | null;
  date_obs: string;
  instrument: string;
  detector: number | null;
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
  stage?: string;
  done?: number;
  total?: number;
  created_at?: string;
  updated_at?: string;
}

export type SequenceMode = "motion" | "brightness";

export interface SequenceRequest {
  ra_deg: number;
  dec_deg: number;
  size_arcmin: number;
  mode: SequenceMode;
  detector?: number;
  max_frames?: number;
  include_reference?: boolean;
}

export interface LightCurvePoint {
  index: number;
  mjd: number;
  value: number | null;
  err: number | null;
  flagged: boolean;
  used: boolean;
  date_iso: string;
}

export interface LightCurve {
  relative: boolean;
  label: string;
  points: LightCurvePoint[];
  comparison_scatter: number | null;
  n_comparisons: number;
  detector?: number | null;
  target_detected?: boolean;
  target_median_snr?: number | null;
  method?: "aperture" | "psf_wings";
  limitations: string[];
}

export interface OverlayPosition {
  index: number;
  x: number;
  y: number;
}

export interface SequenceOverlay {
  target: OverlayPosition[];
  gaia: Array<{ source_id: string | number; g_mag: number | null; positions: OverlayPosition[] }>;
  uncertainty_px: number;
  proper_motion_applied: boolean;
  gaia_available: boolean;
  gaia_warning?: string;
  displacement_arcsec?: number;
  fov_hint: string | null;
}

export interface SequenceReference {
  png_url: string;
  label: string;
  band: string;
  band_wavelength_um?: number;
  survey?: string;
  epoch_iso: string;
}

export interface ShiftStackBest {
  v_east_arcsec_yr: number;
  v_north_arcsec_yr: number;
  x: number;
  y: number;
  sigma_raw: number;
  sigma_corrected: number;
  p_value_corrected: number;
  n_trials: number;
  detected: boolean;
}

export interface TargetedCheck {
  ok: boolean;
  n_visits: number;
  observed_sigma?: number;
  p_value?: number;
  sigma_equivalent?: number;
  n_null?: number;
  peak_xy?: number[];
  offset_px?: number;
  predicted_motion_px?: number;
  stack_png_url?: string;
  limitations: string[];
}

export interface ShiftStackResult {
  ok: boolean;
  targeted?: TargetedCheck | null;
  n_visits: number;
  velocity_axis_arcsec_yr?: number[];
  significance_map?: Array<Array<number | null>>;
  best?: ShiftStackBest;
  threshold_sigma?: number;
  stack_png_url?: string;
  limitations: string[];
}

export interface SpectrumPoint {
  mjd: number;
  date_iso: string;
  detector: number | null;
  wavelength_um: number;
  bandwidth_um?: number | null;
  flux_jy: number;
  flux_jy_err: number | null;
  snr?: number | null;
  flagged: boolean;
}

export interface SpectrumColor {
  available: boolean;
  reason?: string;
  index?: number;
  index_err?: number | null;
  reading?: string;
  reference_note?: string;
}

export interface SpectrumResult {
  label: string;
  points: SpectrumPoint[];
  color: SpectrumColor;
  limitations: string[];
  n_exposures?: number;
}

export type VetStatus = "pass" | "fail" | "info" | "not_checked";
export type VetCategory = "known_object" | "artifact_likely" | "unexplained_candidate" | "inconclusive";

export interface VetCheck {
  name: string;
  status: VetStatus;
  summary: string;
}

export interface VetResult {
  category: VetCategory;
  category_label: string;
  reason: string;
  checks: VetCheck[];
}

export interface SequenceFrame {
  index: number;
  obs_id: string;
  collection: string;
  t_mid_mjd: number;
  date_iso: string;
  detector: number;
  wavelength_um: number | null;
  png_url: string;
  flagged_fraction: number;
  coverage_fraction: number;
}

export interface SequenceResult {
  mode: SequenceMode;
  frames: SequenceFrame[];
  scale: { mode: string; lo: number; hi: number; unit: string };
  grid: {
    ra_deg: number;
    dec_deg: number;
    pixel_scale_arcsec: number;
    size_px: number;
    orientation: string;
  };
  n_available: number;
  n_used: number;
  limitations: string[];
  processing_version: string;
  key: string;
  lightcurve?: LightCurve;
  overlay?: SequenceOverlay;
  reference?: SequenceReference;
  served_from_cache?: boolean;
  queried_at?: string;
  cache_label?: string;
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

export interface NeossatCoverage {
  archive: string;
  collection: string;
  count: number;
  first_date: string | null;
  last_date: string | null;
  radius_deg: number;
  collection_url: string;
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

export interface DataCollections {
  used: string[];
  source: "irsa" | "configured";
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
