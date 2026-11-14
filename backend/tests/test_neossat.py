"""CSA NEOSSat coverage through CADC TAP (Space Apps "Resources" tab, CSA partner data)."""

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import neossat
from app.services.catalogs import CatalogUnavailable

CSV = "nobs,tmin,tmax\n652,58436.97625922454,59897.50685894676\n"


def transport_answering(text, status=200, seen=None):
    def handler(request: httpx.Request) -> httpx.Response:
        if seen is not None:
            seen.append(request)
        return httpx.Response(status, text=text)

    return httpx.MockTransport(handler)


def test_coverage_counts_neossat_planes_that_contain_the_position():
    seen = []
    result = neossat.query_coverage(269.452, 4.693, 0.25, transport=transport_answering(CSV, seen=seen))
    query = seen[0].url.params["QUERY"]
    assert "o.collection = 'NEOSSAT'" in query
    assert "CIRCLE('ICRS', 269.452000, 4.693000, 0.250000)" in query
    assert seen[0].url.params["LANG"] == "ADQL"
    assert result["count"] == 652
    assert result["first_date"] == "2018-11-14"
    assert result["last_date"] == "2022-11-14"
    assert result["radius_deg"] == 0.25
    assert result["archive"] == "CADC"
    assert result["collection_url"] == "https://www.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/en/neossat"


def test_no_coverage_is_zero_with_no_dates():
    result = neossat.query_coverage(76.956, 30.401, 0.25, transport=transport_answering("nobs,tmin,tmax\n0,,\n"))
    assert result["count"] == 0
    assert result["first_date"] is None and result["last_date"] is None


@pytest.mark.parametrize("text,status", [("oops", 500), ("<VOTABLE>ERROR</VOTABLE>", 200)])
def test_a_failing_archive_raises_catalog_unavailable(text, status):
    with pytest.raises(CatalogUnavailable):
        neossat.query_coverage(1.0, 2.0, 0.25, transport=transport_answering(text, status))


def test_the_endpoint_returns_coverage_and_503_when_cadc_is_down(monkeypatch):
    client = TestClient(app)
    monkeypatch.setattr(neossat, "neossat_coverage", lambda ra, dec, radius_deg=0.25: {
        "archive": "CADC", "collection": "NEOSSAT", "count": 7, "first_date": "2019-12-07",
        "last_date": "2021-12-01", "radius_deg": radius_deg,
        "collection_url": "https://www.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/en/neossat",
    })
    ok = client.get("/api/v1/sky/neossat", params={"ra": 133.795, "dec": -7.245})
    assert ok.status_code == 200
    assert ok.json()["count"] == 7

    def down(*args, **kwargs):
        raise CatalogUnavailable("catalogue query failed")

    monkeypatch.setattr(neossat, "neossat_coverage", down)
    failed = client.get("/api/v1/sky/neossat", params={"ra": 133.795, "dec": -7.245})
    assert failed.status_code == 503
    assert failed.json()["detail"] == "CADC (NEOSSat archive) could not be reached."
    assert client.get("/api/v1/sky/neossat", params={"ra": 400, "dec": 0}).status_code == 422
