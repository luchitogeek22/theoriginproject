"""WP-27: candidate vetting with simulated Gaia and SkyBoT."""

from app.services.catalogs import CatalogUnavailable
from app.services.vetting import vet_candidate

SOURCE = {"ra_deg": 150.0, "dec_deg": 2.0, "mjd": 60850.0, "flag_bits": [21], "detected_per_visit": [True, True],
          "sigma_pix": 0.5, "psf_sigma_pix": 0.5, "shape_snr": 20.0}


def gaia_none(*a, **k):
    return []


def skybot_none(*a, **k):
    return []


def gaia_with_star(ra, dec, mjd_unused=None, *a, **k):
    return [{"source_id": 123, "ra": 150.0, "dec": 2.0, "pmra": 0.0, "pmdec": 0.0, "parallax": None,
             "g_mag": 15.0, "variable": False}]


def unreachable(*a, **k):
    raise CatalogUnavailable("down")


def checks(result):
    return {c["name"]: c for c in result["checks"]}


def test_an_asteroid_at_the_position_and_date_is_a_known_object_with_its_name():
    def skybot(ra, dec, radius, mjd):
        return [{"name": "(433) Eros", "ra": 150.0 + 2 / 3600, "dec": 2.0}]

    result = vet_candidate(SOURCE, gaia_fn=gaia_none, skybot_fn=skybot)
    assert result["category"] == "known_object"
    assert "Eros" in result["reason"]
    assert checks(result)["solar_system"]["evidence"]["name"] == "(433) Eros"


def test_a_gaia_star_at_its_expected_position_is_a_known_object():
    result = vet_candidate(SOURCE, gaia_fn=gaia_with_star, skybot_fn=skybot_none)
    assert result["category"] == "known_object"
    assert checks(result)["gaia_star"]["evidence"]["source_id"] == 123


def test_flagged_pixels_in_a_single_visit_are_a_probable_artifact():
    source = {**SOURCE, "flag_bits": [0, 11], "detected_per_visit": [True, False]}
    result = vet_candidate(source, gaia_fn=gaia_none, skybot_fn=skybot_none)
    assert result["category"] == "artifact_likely"
    assert checks(result)["quality_flags"]["status"] == "fail"


def test_unreachable_catalogues_are_not_checked_and_never_unexplained():
    result = vet_candidate(SOURCE, gaia_fn=unreachable, skybot_fn=unreachable)
    assert checks(result)["gaia_star"]["status"] == "not_checked"
    assert checks(result)["solar_system"]["status"] == "not_checked"
    assert result["category"] == "inconclusive"
    assert result["category"] != "unexplained_candidate"


def test_with_every_catalogue_answering_and_nothing_found_it_stays_a_candidate():
    result = vet_candidate(SOURCE, gaia_fn=gaia_none, skybot_fn=skybot_none)
    assert result["category"] == "unexplained_candidate"
    assert len(result["checks"]) == 7


def test_motion_coherence_needs_three_visits_and_detects_a_straight_line():
    straight = [(60800.0 + 100 * k, 150.0 + k * 1e-3, 2.0) for k in range(4)]
    result = vet_candidate({**SOURCE, "positions": straight}, gaia_fn=gaia_none, skybot_fn=skybot_none)
    assert checks(result)["coherent_motion"]["status"] == "pass"
    jumpy = [(60800.0, 150.0, 2.0), (60900.0, 150.01, 2.0), (61000.0, 149.99, 2.0), (61100.0, 150.02, 2.02)]
    bad = vet_candidate({**SOURCE, "positions": jumpy}, gaia_fn=gaia_none, skybot_fn=skybot_none)
    assert checks(bad)["coherent_motion"]["status"] == "fail"
    few = vet_candidate({**SOURCE, "positions": straight[:2]}, gaia_fn=gaia_none, skybot_fn=skybot_none)
    assert checks(few)["coherent_motion"]["status"] == "not_checked"


def test_no_text_calls_a_candidate_a_discovery():
    result = vet_candidate(SOURCE, gaia_fn=gaia_none, skybot_fn=skybot_none)
    text = str(result).lower()
    assert "discover" not in text and "descubr" not in text


def test_vet_endpoint_stores_the_checks_on_the_candidate(monkeypatch):
    import json

    from fastapi.testclient import TestClient

    from app.database import SessionLocal, init_db
    from app.main import app
    from app.models import Candidate
    from app.routers import analysis
    from app.services import vetting

    init_db()
    with SessionLocal() as db:
        candidate = Candidate(
            kind="unclassified", ra_deg=150.0, dec_deg=2.0, job_id="vet-job", snr=9.0,
            evidence_json=json.dumps({"astrometry": {}, "cutouts": None}),
        )
        db.add(candidate)
        db.commit()
        candidate_id = candidate.id
    monkeypatch.setattr(vetting, "gaia_cone", gaia_none)
    monkeypatch.setattr(vetting, "skybot_cone", skybot_none)
    original = vetting.vet_candidate
    monkeypatch.setattr(
        "app.services.vetting.vet_candidate",
        lambda source, **kw: original(source, gaia_fn=gaia_none, skybot_fn=skybot_none),
    )
    client = TestClient(app)
    response = client.post("/api/v1/analysis/vet", json={"candidate_id": candidate_id})
    assert response.status_code == 200
    body = response.json()
    assert len(body["checks"]) == 7 and body["category"] == "inconclusive"
    with SessionLocal() as db:
        assert "vetting" in json.loads(db.get(Candidate, candidate_id).evidence_json)
    assert client.post("/api/v1/analysis/vet", json={"candidate_id": 10**9}).status_code == 404
    assert analysis is not None


def test_unmeasured_inputs_keep_a_candidate_inconclusive():
    result = vet_candidate(
        {"ra_deg": 1.0, "dec_deg": 2.0, "mjd": 60800.0}, gaia_fn=gaia_none, skybot_fn=skybot_none
    )
    assert result["category"] == "inconclusive"


def test_a_faint_real_point_source_does_not_fail_the_shape_check():
    from app.services.vetting import check_point_source

    assert check_point_source(0.5 * 1.6, 0.5, snr=6.0)["status"] == "pass"
    assert check_point_source(0.5 * 3.0, 0.5, snr=30.0)["status"] == "fail"
    assert check_point_source(0.5, 0.5, snr=2.0)["status"] == "not_checked"


def test_ra_wrap_does_not_break_the_motion_check():
    wrapped = [(60800.0 + 100 * k, (359.9995 + k * 0.0005) % 360.0, 2.0) for k in range(4)]
    result = vet_candidate(
        {"ra_deg": 0.0, "dec_deg": 2.0, "mjd": 60800.0, "positions": wrapped},
        gaia_fn=gaia_none, skybot_fn=skybot_none,
    )
    motion = checks(result)["coherent_motion"]
    assert motion["status"] == "pass" and motion["evidence"]["rms_arcsec"] < 1.0
