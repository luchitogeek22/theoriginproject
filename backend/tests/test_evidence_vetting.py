"""WP-27: the vetting category and checks travel into the evidence report."""

from app.services.evidence import build_report, report_markdown
from app.services.vetting import vet_candidate


def test_report_lists_candidates_with_their_vetting():
    vetting = vet_candidate(
        {"ra_deg": 1.0, "dec_deg": 2.0, "mjd": 60800.0, "flag_bits": [0], "detected_per_visit": [True, False]},
        gaia_fn=lambda *a, **k: [],
        skybot_fn=lambda *a, **k: [],
    )
    session = {
        "id": "s1", "title": "t", "target_name": "x", "ra_deg": 1.0, "dec_deg": 2.0,
        "payload": {"candidates": [{"id": 5, "kind": "unclassified", "ra_deg": 1.0, "dec_deg": 2.0,
                                    "snr": 9.0, "job_id": "j", "evidence": {"vetting": vetting}}]},
    }
    report = build_report(session)
    entry = report["candidates"][0]
    assert entry["vetting"]["category"] == "artifact_likely"
    assert len(entry["vetting"]["checks"]) == 7
    text = report_markdown(report)
    assert "## Candidates and vetting" in text and "Probable artifact" in text
    assert "quality_flags: fail" in text


def test_a_candidate_without_vetting_says_it_was_not_run():
    session = {"id": "s", "payload": {"candidates": [{"id": 1, "kind": "k"}]}}
    assert "vetting: not run" in report_markdown(build_report(session))
