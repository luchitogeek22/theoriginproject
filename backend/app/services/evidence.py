"""Evidence reports: provenance, methods, limitations, references.

Integrity protocol: every research session carries a SHA-256 verification
hash over a canonical string (target, coordinates, observation ids,
candidate ids). Anyone can recompute it from the report's canonical string
or via GET /api/v1/research/{id}/verify. This detects accidental edits and
lets citizens audit reports; it is NOT tamper-proof against someone with
database write access, and it is never presented as such.
"""

import hashlib
import json
import pathlib
from datetime import datetime, timezone
from typing import Any

SPHEREX_DOIS = json.loads(
    (pathlib.Path(__file__).resolve().parent.parent / "data" / "collection_dois.json").read_text()
)["dois"]

ACKNOWLEDGMENT = (
    "This work uses data from the SPHEREx mission, archived at the NASA/IPAC "
    "Infrared Science Archive (IRSA). SPHEREx is a NASA Astrophysics Explorer "
    "mission. THE ORIGIN PROJECT is an independent educational initiative and "
    "is not an official NASA product."
)

ARCHIVE_DOCS = "https://caltech-ipac.github.io/spherex-archive-documentation/"


COVERS_V1 = (
    "target name, RA/DEC, sorted (collection, obs_id) list, candidate count and ids"
)
COVERS_V2 = (
    "title, target name, RA/DEC and the entire payload: observations, "
    "measurements, candidates with their job ids, cutout SHA-256 digests, "
    "methods, limitations and processing_version"
)
CURRENT_HASH_VERSION = 2


def covers_text(hash_version: int) -> str:
    return COVERS_V2 if hash_version >= 2 else COVERS_V1


def _canonical_v1(session: dict[str, Any]) -> str:
    payload = session.get("payload", {})
    if not isinstance(payload, dict):
        payload = {}
    observations = payload.get("observations", []) or []
    obs_keys = sorted(
        f"{o.get('collection', '')}:{o.get('obs_id', '')}"
        for o in observations
        if isinstance(o, dict)
    )
    candidates = payload.get("candidates", []) or []
    cand_ids = sorted(str(c.get("id", "")) for c in candidates if isinstance(c, dict))
    ra = session.get("ra_deg")
    dec = session.get("dec_deg")
    parts = [
        "origin-v1",
        f"target={session.get('target_name') or ''}",
        f"ra={float(ra):.6f}" if ra is not None else "ra=",
        f"dec={float(dec):.6f}" if dec is not None else "dec=",
        "obs=" + ",".join(obs_keys),
        f"candidates={len(cand_ids)}:" + ",".join(cand_ids),
    ]
    return "|".join(parts)


def _canonical_v2(session: dict[str, Any]) -> str:
    payload = session.get("payload", {})
    body = {
        "title": session.get("title") or "",
        "target_name": session.get("target_name") or "",
        "ra_deg": session.get("ra_deg"),
        "dec_deg": session.get("dec_deg"),
        "payload": payload if isinstance(payload, dict) else {},
    }
    encoded = json.dumps(
        body, sort_keys=True, separators=(",", ":"), ensure_ascii=True, default=str
    )
    return f"origin-v2|{encoded}"


def build_canonical_string(session: dict[str, Any]) -> str:
    if int(session.get("hash_version") or 1) >= 2:
        return _canonical_v2(session)
    return _canonical_v1(session)


def compute_verification_hash(session: dict[str, Any]) -> tuple[str, str]:
    """Return (sha256_hex, canonical_string) for a research session view."""
    canonical = build_canonical_string(session)
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return digest, canonical


def _dicts(items: Any) -> list[dict[str, Any]]:
    return [item for item in items if isinstance(item, dict)] if isinstance(items, list) else []


def _candidate_entry(candidate: dict[str, Any]) -> dict[str, Any]:
    evidence = candidate.get("evidence") if isinstance(candidate.get("evidence"), dict) else {}
    vetting = evidence.get("vetting") if isinstance(evidence.get("vetting"), dict) else None
    entry: dict[str, Any] = {
        "id": candidate.get("id"),
        "kind": candidate.get("kind"),
        "ra_deg": candidate.get("ra_deg"),
        "dec_deg": candidate.get("dec_deg"),
        "snr": candidate.get("snr"),
        "job_id": candidate.get("job_id"),
        "vetting": None,
    }
    if vetting:
        entry["vetting"] = {
            "category": vetting.get("category"),
            "category_label": vetting.get("category_label"),
            "reason": vetting.get("reason"),
            "checks": [
                {"name": c.get("name"), "status": c.get("status"), "summary": c.get("summary")}
                for c in _dicts(vetting.get("checks"))
            ],
        }
    return entry


def build_report(session: dict[str, Any]) -> dict[str, Any]:
    payload = session.get("payload", {}) if isinstance(session, dict) else {}
    if not isinstance(payload, dict):
        payload = {}
    observations = _dicts(payload.get("observations"))
    hash_version = int(session.get("hash_version") or 1)
    collections = sorted({str(o.get("collection", "")) for o in observations if o.get("collection")})
    dois = {c: SPHEREX_DOIS.get(c, "see IRSA documentation") for c in collections}
    stored_hash = str(session.get("verification_hash", "") or "")
    recomputed, canonical = compute_verification_hash(session if isinstance(session, dict) else {})
    return {
        "title": session.get("title", "Research evidence report"),
        "session_id": session.get("id", ""),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "target": {
            "name": session.get("target_name", ""),
            "ra_deg": session.get("ra_deg"),
            "dec_deg": session.get("dec_deg"),
        },
        "integrity": {
            "algorithm": "SHA-256",
            "hash_version": hash_version,
            "verification_hash": stored_hash,
            "canonical_string": canonical,
            "covers": covers_text(hash_version),
            "match_stored_hash": (stored_hash == recomputed) if stored_hash else None,
            "verify_how": (
                "Recompute SHA-256 over canonical_string, or call "
                "GET /api/v1/research/{id}/verify"
            ),
        },
        "observations": [
            {
                "obs_id": o.get("obs_id"),
                "collection": o.get("collection"),
                "date_obs": o.get("date_obs"),
                "detector": o.get("detector"),
                "band": o.get("band"),
                "access_url": o.get("access_url"),
            }
            for o in observations
        ],
        "candidates": [_candidate_entry(c) for c in _dicts(payload.get("candidates"))],
        "methods": payload.get("methods", []),
        "measurements": payload.get("measurements", []),
        "limitations": payload.get("limitations", []),
        "references": {
            "archive_docs": ARCHIVE_DOCS,
            "collection_dois": dois,
            "acknowledgment": ACKNOWLEDGMENT,
        },
        "reproducibility": payload.get("reproducibility", {}),
    }


def report_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# {report.get('title', 'Evidence report')}",
        "",
        f"Generated: {report.get('generated_at', '')}",
        f"Target: {report['target'].get('name', '')} "
        f"({report['target'].get('ra_deg')}, {report['target'].get('dec_deg')})",
        "",
        "## Observations",
    ]
    for obs in report.get("observations", []):
        lines.append(
            f"- {obs.get('obs_id')} [{obs.get('collection')}] {obs.get('date_obs', '')} "
            f"det={obs.get('detector', '')} band={obs.get('band', '')}"
        )
        if obs.get("access_url"):
            lines.append(f"  {obs.get('access_url')}")
    lines += ["", "## Candidates and vetting"]
    candidates = report.get("candidates", [])
    if not candidates:
        lines.append("- (none recorded)")
    for cand in candidates:
        lines.append(
            f"- #{cand.get('id')} {cand.get('kind')} at ({cand.get('ra_deg')}, {cand.get('dec_deg')}) "
            f"SNR={cand.get('snr')} job={cand.get('job_id')}"
        )
        vetting = cand.get("vetting")
        if not vetting:
            lines.append("  vetting: not run")
            continue
        lines.append(f"  category: {vetting.get('category_label')} - {vetting.get('reason')}")
        for check in vetting.get("checks", []):
            lines.append(f"  - {check.get('name')}: {check.get('status')} - {check.get('summary')}")
    lines += ["", "## Methods"]
    lines += [f"- {m}" for m in report.get("methods", [])] or ["- (none recorded)"]
    lines += ["", "## Measurements"]
    lines += [f"- {m}" for m in report.get("measurements", [])] or ["- (none recorded)"]
    lines += ["", "## Limitations"]
    lines += [f"- {m}" for m in report.get("limitations", [])] or ["- (none recorded)"]
    integrity = report.get("integrity", {}) if isinstance(report.get("integrity"), dict) else {}
    match = integrity.get("match_stored_hash")
    status = (
        "MATCH - content agrees with the registered hash"
        if match is True
        else "MISMATCH - content differs from registration; treat as edited"
        if match is False
        else "no registered hash"
    )
    lines += [
        "",
        "## Integrity verification",
        f"Algorithm: {integrity.get('algorithm', 'SHA-256')}",
        f"Verification hash: {integrity.get('verification_hash', '(none)')}",
        f"Covers: {integrity.get('covers', '')}",
        f"Status: {status}",
        f"How to verify: {integrity.get('verify_how', '')}",
    ]
    refs = report.get("references", {})
    lines += [
        "",
        "## References",
        f"Archive docs: {refs.get('archive_docs', '')}",
        f"DOIs: {refs.get('collection_dois', {})}",
        "",
        refs.get("acknowledgment", ""),
    ]
    return "\n".join(lines)


def _latin(text: str) -> str:
    return text.encode("latin-1", errors="replace").decode("latin-1")


def report_pdf_bytes(report: dict[str, Any]) -> bytes:
    from fpdf import FPDF  # type: ignore[import-untyped]

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()
    # Header band.
    pdf.set_fill_color(4, 7, 15)
    pdf.set_text_color(232, 238, 252)
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 9, _latin("THE ORIGIN PROJECT  -  Evidence report"),
             new_x="LMARGIN", new_y="NEXT", fill=True)
    pdf.set_text_color(20, 20, 20)
    pdf.ln(3)
    # Title + target block.
    pdf.set_font("Helvetica", "B", 16)
    pdf.multi_cell(0, 8, _latin(str(report.get("title", "Evidence report"))),
                   new_x="LMARGIN", new_y="NEXT")
    target = report.get("target", {}) if isinstance(report.get("target"), dict) else {}
    pdf.set_font("Helvetica", "", 10)
    pdf.multi_cell(0, 5, _latin(
        f"Target: {target.get('name', '')} "
        f"({target.get('ra_deg')}, {target.get('dec_deg')})"),
        new_x="LMARGIN", new_y="NEXT")
    pdf.multi_cell(0, 5, _latin(f"Generated: {report.get('generated_at', '')}"),
                   new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    def section(title: str, items: list[str]) -> None:
        pdf.set_font("Helvetica", "B", 12)
        pdf.cell(0, 7, _latin(title), new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 10)
        if not items:
            pdf.multi_cell(0, 5, _latin("(none recorded)"), new_x="LMARGIN", new_y="NEXT")
        for item in items:
            pdf.multi_cell(0, 5, _latin(f"-  {item}"), new_x="LMARGIN", new_y="NEXT")
        pdf.ln(1)

    obs_lines = [
        f"{o.get('obs_id')} [{o.get('collection')}] {o.get('date_obs', '')} "
        f"det={o.get('detector', '')} band={o.get('band', '')}"
        for o in report.get("observations", [])
    ]
    section("Observations", obs_lines)
    section("Methods", [str(m) for m in report.get("methods", [])])
    section("Measurements", [str(m) for m in report.get("measurements", [])])
    section("Limitations", [str(m) for m in report.get("limitations", [])])
    # Integrity verification.
    integrity = report.get("integrity", {}) if isinstance(report.get("integrity"), dict) else {}
    match = integrity.get("match_stored_hash")
    status = (
        "MATCH - content agrees with the registered hash"
        if match is True
        else "MISMATCH - content differs from registration; treat as edited"
        if match is False
        else "no registered hash"
    )
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 7, _latin("Verificación de integridad"), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    pdf.multi_cell(0, 5, _latin(f"SHA-256: {integrity.get('verification_hash', '(none)')}"),
                   new_x="LMARGIN", new_y="NEXT")
    pdf.multi_cell(0, 5, _latin(f"Cubre: {integrity.get('covers', '')}"),
                   new_x="LMARGIN", new_y="NEXT")
    pdf.multi_cell(0, 5, _latin(f"Estado: {status}"),
                   new_x="LMARGIN", new_y="NEXT")
    pdf.multi_cell(0, 5, _latin(
        "Verificación: recalcule SHA-256 sobre canonical_string (ver JSON) o "
        f"GET /api/v1/research/{report.get('session_id', '{id}')}/verify"),
        new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1)
    # References.
    refs = report.get("references", {}) if isinstance(report.get("references"), dict) else {}
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 7, _latin("References"), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    pdf.multi_cell(0, 5, _latin(f"Archive docs: {refs.get('archive_docs', '')}"),
                   new_x="LMARGIN", new_y="NEXT")
    pdf.multi_cell(0, 5, _latin(f"DOIs: {refs.get('collection_dois', {})}"),
                   new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1)
    pdf.set_font("Helvetica", "I", 9)
    pdf.multi_cell(0, 5, _latin(str(refs.get("acknowledgment", ""))),
                   new_x="LMARGIN", new_y="NEXT")
    out = pdf.output()
    return bytes(out) if isinstance(out, (bytes, bytearray)) else out.encode("latin-1")
