"""Pydantic v2 API contracts."""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

DataClass = Literal[
    "OBSERVED_DATA", "PROCESSED_DATA", "COMPUTED_MEASUREMENT", "PRELIMINARY_INTERPRETATION"
]


class Provenance(BaseModel):
    model_config = ConfigDict(extra="allow")

    source: str = "NASA/IPAC IRSA"
    collection: str = ""
    obs_id: str = ""
    access_url: str = ""
    queried_at: str = ""
    cached: bool = False
    data_class: DataClass = "OBSERVED_DATA"


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    version: str = "1.0.0"
    environment: str = ""


class DataSourceStatus(BaseModel):
    name: str
    reachable: bool
    latency_ms: int | None = None
    detail: str = ""
    checked_at: str = ""


class DataSourcesResponse(BaseModel):
    sources: list[DataSourceStatus]
    archive_note: str = (
        "SPHEREx se actualiza semanalmente; SIA2 puede reflejar nuevos productos "
        "con ~1 día de retraso. La cobertura mostrada corresponde a la última consulta."
    )


class TargetResolveRequest(BaseModel):
    name: str | None = None
    ra_deg: float | None = None
    dec_deg: float | None = None
    catalog_id: str | None = None


class TargetResolveResponse(BaseModel):
    name: str
    catalog_id: str = ""
    ra_deg: float
    dec_deg: float
    frame: str = "ICRS"
    epoch: str = "J2000"
    resolver: str = ""
    warning: str = ""
    record_id: int | None = None


class ObservationSearchRequest(BaseModel):
    ra_deg: float = Field(ge=0, lt=360)
    dec_deg: float = Field(ge=-90, le=90)
    radius_arcmin: float = Field(default=10.0, gt=0, le=180)
    collections: list[str] | None = None
    t_min_mjd: float | None = None
    t_max_mjd: float | None = None
    maxrec: int = Field(default=200, gt=0, le=2000)


class ObservationItem(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: int | None = None
    obs_id: str
    collection: str
    ra_deg: float | None = None
    dec_deg: float | None = None
    fov_deg: float | None = None
    t_min_mjd: float | None = None
    t_max_mjd: float | None = None
    date_obs: str = ""
    instrument: str = ""
    detector: str = ""
    band: str = ""
    dataproduct_type: str = ""
    access_url: str = ""
    access_format: str = ""
    filesize_bytes: int | None = None
    s_region: str = ""
    provenance: Provenance | None = None


class ObservationSearchResponse(BaseModel):
    count: int
    items: list[ObservationItem]
    queried_at: str
    cached: bool = False
    collections_queried: list[str] = []
    warnings: list[str] = []


class CutoutRequest(BaseModel):
    observation_id: int
    ra_deg: float = Field(ge=0, lt=360)
    dec_deg: float = Field(ge=-90, le=90)
    size_arcmin: float = Field(default=6.0, gt=0, le=60)


class CutoutResponse(BaseModel):
    cutout_id: int
    observation_id: int
    storage_key: str
    preview_url: str
    sha256: str
    size_bytes: int
    source_url: str
    fits_summary: dict[str, Any] = {}
    warning: str = ""


class JobResponse(BaseModel):
    job_id: str
    kind: str
    status: str


class JobStatusResponse(BaseModel):
    job_id: str
    kind: str
    status: str
    error: str = ""
    created_at: str = ""
    updated_at: str = ""


class JobResultResponse(BaseModel):
    job_id: str
    kind: str
    status: str
    result: dict[str, Any] = {}
    error: str = ""


class TemporalAnalysisRequest(BaseModel):
    cutout_a_id: int
    cutout_b_id: int
    ra_deg: float | None = None
    dec_deg: float | None = None
    detection_sigma: float = Field(default=5.0, gt=0, le=50)


class DifferentialAnalysisRequest(BaseModel):
    cutout_a_id: int
    cutout_b_id: int
    detection_sigma: float = Field(default=5.0, gt=0, le=50)


class SpectralAnalysisRequest(BaseModel):
    cutout_id: int
    ra_deg: float
    dec_deg: float


class CandidateItem(BaseModel):
    id: int
    kind: str
    ra_deg: float
    dec_deg: float
    job_id: str
    separation_arcsec: float | None = None
    separation_err_arcsec: float | None = None
    delta_mag: float | None = None
    snr: float | None = None
    quality: str = ""
    evidence: dict[str, Any] = {}
    user_id: str | None = None


class ResearchCreateRequest(BaseModel):
    title: str = ""
    target_name: str = ""
    ra_deg: float | None = None
    dec_deg: float | None = None
    payload: dict[str, Any] = {}


class ResearchResponse(BaseModel):
    id: str
    title: str
    target_name: str
    ra_deg: float | None
    dec_deg: float | None
    payload: dict[str, Any]
    created_at: str
    updated_at: str
    share_url: str = ""
    verification_hash: str = ""
    user_id: str | None = None


class ReferenceStar(BaseModel):
    name: str
    ra_deg: float
    dec_deg: float
    mag: float
