"""Pydantic v2 API contracts."""

import json
from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

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
    status: Literal["ok", "degraded"] = "ok"
    version: str = "1.0.0"
    environment: str = ""
    database: Literal["ok", "unreachable"] = "ok"


class DataSourceStatus(BaseModel):
    name: str
    reachable: bool
    latency_ms: int | None = None
    detail: str = ""
    checked_at: str = ""


class DataSourcesResponse(BaseModel):
    sources: list[DataSourceStatus]
    collections: dict[str, Any] | None = None
    archive_note: str = (
        "SPHEREx se actualiza semanalmente; SIA2 puede reflejar nuevos productos "
        "con ~1 día de retraso. La cobertura mostrada corresponde a la última consulta."
    )


def ra_field(**kw: Any) -> Any:
    return Field(ge=0, lt=360, **kw)


def dec_field(**kw: Any) -> Any:
    return Field(ge=-90, le=90, **kw)


class TargetResolveRequest(BaseModel):
    query: str | None = Field(default=None, max_length=256)
    name: str | None = Field(default=None, max_length=256)
    ra_deg: float | None = ra_field(default=None)
    dec_deg: float | None = dec_field(default=None)
    catalog_id: str | None = Field(default=None, max_length=256)
    obstime: date | None = None


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
    pm_ra_mas_yr: float | None = None
    pm_dec_mas_yr: float | None = None
    propagated_ra_deg: float | None = None
    propagated_dec_deg: float | None = None
    propagated_epoch: str | None = None


class ObservationSearchRequest(BaseModel):
    ra_deg: float = Field(ge=0, lt=360)
    dec_deg: float = Field(ge=-90, le=90)
    radius_arcmin: float = Field(default=10.0, gt=0, le=180)
    collections: list[str] | None = None
    t_min_mjd: float | None = None
    t_max_mjd: float | None = None
    maxrec: int = Field(default=200, gt=0, le=5000)


class ObservationItem(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: int | None = None
    obs_id: str
    product_id: str = ""
    collection: str
    ra_deg: float | None = None
    dec_deg: float | None = None
    fov_deg: float | None = None
    t_min_mjd: float | None = None
    t_max_mjd: float | None = None
    date_obs: str = ""
    instrument: str = ""
    detector: int | None = None
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


class SequenceRequest(BaseModel):
    ra_deg: float = ra_field()
    dec_deg: float = dec_field()
    size_arcmin: float = Field(default=6.0, ge=1, le=60)
    mode: Literal["motion", "brightness"] = "motion"
    detector: int | None = Field(default=None, ge=1, le=6)
    max_frames: int = Field(default=12, ge=1, le=24)
    pm_ra_mas_yr: float | None = None
    pm_dec_mas_yr: float | None = None
    parallax_mas: float | None = None
    ref_epoch: str | None = Field(default=None, max_length=32)
    include_reference: bool = False


class ShiftStackRequest(BaseModel):
    ra_deg: float = ra_field()
    dec_deg: float = dec_field()
    size_arcmin: float = Field(default=4.0, ge=1, le=60)
    detector: int | None = Field(default=None, ge=1, le=6)
    max_frames: int = Field(default=12, ge=3, le=24)
    max_speed_arcsec_yr: float = Field(default=80.0, gt=0, le=2000)
    steps: int = Field(default=11, ge=3, le=31)


class SpectrumRequest(BaseModel):
    ra_deg: float = ra_field()
    dec_deg: float = dec_field()
    size_arcmin: float = Field(default=3.0, ge=1, le=60)
    per_detector: int = Field(default=3, ge=1, le=8)
    pm_ra_mas_yr: float | None = None
    pm_dec_mas_yr: float | None = None
    parallax_mas: float | None = None
    ref_epoch: str | None = Field(default=None, max_length=32)


class VetRequest(BaseModel):
    candidate_id: int


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
    stage: str = ""
    done: int = 0
    total: int = 0


class JobResultResponse(BaseModel):
    job_id: str
    kind: str
    status: str
    result: dict[str, Any] = {}
    error: str = ""


class TemporalAnalysisRequest(BaseModel):
    cutout_a_id: int
    cutout_b_id: int
    ra_deg: float | None = ra_field(default=None)
    dec_deg: float | None = dec_field(default=None)
    detection_sigma: float = Field(default=5.0, gt=0, le=50)


class DifferentialAnalysisRequest(BaseModel):
    cutout_a_id: int
    cutout_b_id: int
    detection_sigma: float = Field(default=5.0, gt=0, le=50)


class SpectralAnalysisRequest(BaseModel):
    cutout_id: int
    ra_deg: float = ra_field()
    dec_deg: float = dec_field()


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


RESEARCH_MAX_TITLE = 256
RESEARCH_MAX_PAYLOAD_BYTES = 256 * 1024
RESEARCH_MAX_LIST_ITEMS = 200
RESEARCH_OBJECT_LISTS = ("observations", "candidates", "cutouts")


class ResearchCreateRequest(BaseModel):
    title: str = Field(default="", max_length=RESEARCH_MAX_TITLE)
    target_name: str = Field(default="", max_length=RESEARCH_MAX_TITLE)
    ra_deg: float | None = ra_field(default=None)
    dec_deg: float | None = dec_field(default=None)
    payload: dict[str, Any] = {}

    @field_validator("payload")
    @classmethod
    def _bounded_payload(cls, value: dict[str, Any]) -> dict[str, Any]:
        for key, item in value.items():
            if not isinstance(item, list):
                continue
            if len(item) > RESEARCH_MAX_LIST_ITEMS:
                raise ValueError(f"{key} accepts at most {RESEARCH_MAX_LIST_ITEMS} items")
            if key in RESEARCH_OBJECT_LISTS and not all(isinstance(i, dict) for i in item):
                raise ValueError(f"{key} must be a list of objects")
        if len(json.dumps(value, default=str).encode("utf-8")) > RESEARCH_MAX_PAYLOAD_BYTES:
            raise ValueError("payload exceeds 256 KB")
        return value


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
    hash_version: int = 1


class ReferenceStar(BaseModel):
    name: str
    ra_deg: float
    dec_deg: float
    mag: float
