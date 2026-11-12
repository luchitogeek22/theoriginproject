"""Prepare and verify the permanent demo sequences of the five challenge targets.

Posts the exact request the web page sends for each target (so the last good result is cached under
the same request hash), waits for the job and checks that at least two visits were produced. If IRSA
is unreachable later, those cached real results are served and labelled as such.

Usage: python scripts/warm_targets.py --api http://localhost:8000 --frontend http://localhost:3000
"""

import argparse
import json
import sys
import time
from pathlib import Path

import httpx

DATA = Path(__file__).resolve().parent.parent / "app" / "data" / "test_targets.json"
MIN_VISITS = 2


def targets() -> list[dict]:
    return json.loads(DATA.read_text(encoding="utf-8"))["targets"]


def mode_for(target: dict) -> str:
    return "motion" if target["phenomenon"] == "motion" else "brightness"


def page_link(frontend: str, target: dict, fov: float, reference: bool) -> str:
    link = (
        f"{frontend.rstrip('/')}/time-explorer?ra={target['ra_deg']:.6f}&dec={target['dec_deg']:.6f}"
        f"&fov={fov:g}&mode={mode_for(target)}"
    )
    return link + "&ref=1" if reference else link


def request_body(target: dict, fov: float, reference: bool) -> dict:
    body = {
        "ra_deg": target["ra_deg"], "dec_deg": target["dec_deg"], "size_arcmin": fov,
        "mode": mode_for(target),
    }
    if reference:
        body["include_reference"] = True
    return body


def run_one(client: httpx.Client, api: str, body: dict, deadline_s: float) -> dict:
    job = client.post(f"{api}/api/v1/sequences", json=body)
    job.raise_for_status()
    job_id = job.json()["job_id"]
    started = time.monotonic()
    while time.monotonic() - started < deadline_s:
        status = client.get(f"{api}/api/v1/jobs/{job_id}").json()
        if status["status"] in ("completed", "failed"):
            break
        time.sleep(3)
    else:
        return {"status": "timeout", "error": "job did not finish in time"}
    return client.get(f"{api}/api/v1/jobs/{job_id}/results").json()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api", default="http://localhost:8000")
    parser.add_argument("--frontend", default="http://localhost:3000")
    parser.add_argument("--fov", type=float, default=6.0)
    parser.add_argument("--retries", type=int, default=2, help="extra attempts when frames are missing")
    parser.add_argument("--check", action="store_true", help="single attempt, no retries")
    parser.add_argument("--timeout", type=float, default=900.0, help="seconds per job")
    parser.add_argument("--no-reference", action="store_true", help="skip the WISE reference variant")
    args = parser.parse_args()

    failures = 0
    variants = [False] if args.no_reference else [False, True]
    with httpx.Client(timeout=60.0) as client:
        for target in targets():
            for reference in variants:
                body = request_body(target, args.fov, reference)
                attempts = 1 if args.check else args.retries + 1
                outcome: dict = {}
                for attempt in range(attempts):
                    outcome = run_one(client, args.api, body, args.timeout)
                    result = outcome.get("result") or {}
                    complete = (
                        outcome.get("status") == "completed"
                        and result.get("n_used", 0) >= MIN_VISITS
                        and result.get("n_used", 0) >= min(result.get("n_available", 0), 12)
                    )
                    if complete or outcome.get("status") != "completed":
                        break
                result = outcome.get("result") or {}
                ok = outcome.get("status") == "completed" and result.get("n_used", 0) >= MIN_VISITS
                failures += 0 if ok else 1
                label = "ref" if reference else "   "
                served = " (served from cache)" if result.get("served_from_cache") else ""
                print(
                    f"{'OK  ' if ok else 'FAIL'} {target['name']:<16} {label} "
                    f"frames={result.get('n_used', 0)}/{result.get('n_available', 0)} "
                    f"queried={str(result.get('queried_at', ''))[:19]}{served}"
                    + ("" if ok else f" error={outcome.get('error', outcome.get('status'))}")
                )
                print(f"     {page_link(args.frontend, target, args.fov, reference)}")
    print(f"\n{failures} of {len(targets()) * len(variants)} sequences need attention")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
