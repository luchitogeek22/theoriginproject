"""Compare, for each challenge target, the motion predicted by its catalogue proper motion with the
motion measured between the early and late halves of the SPHEREx visits (real data).

Usage: python scripts/validate_motion.py --api http://localhost:8000 --out ../docs/validacion-movimiento.md
"""

import argparse
import json
import sys
import time
from datetime import date
from pathlib import Path

import httpx

DATA = Path(__file__).resolve().parent.parent / "app" / "data" / "test_targets.json"
MOVERS = ("motion",)


def run(client: httpx.Client, api: str, target: dict, fov: float, timeout: float) -> dict:
    body = {
        "ra_deg": target["ra_deg"], "dec_deg": target["dec_deg"], "size_arcmin": fov,
        "max_frames": 12, "max_speed_arcsec_yr": 25.0, "steps": 11,
    }
    job = client.post(f"{api}/api/v1/sequences/shift-stack", json=body)
    job.raise_for_status()
    job_id = job.json()["job_id"]
    started = time.monotonic()
    while time.monotonic() - started < timeout:
        status = client.get(f"{api}/api/v1/jobs/{job_id}").json()
        if status["status"] in ("completed", "failed"):
            break
        time.sleep(4)
    return client.get(f"{api}/api/v1/jobs/{job_id}/results").json()


def row(target: dict, outcome: dict) -> str:
    result = outcome.get("result") or {}
    name = target["name"]
    pm_total = (target["pmra_mas_yr"] ** 2 + target["pmdec_mas_yr"] ** 2) ** 0.5 / 1000.0
    if outcome.get("status") != "completed":
        return f"| {name} | {pm_total:.2f} | - | - | - | - | - | no calculado: {outcome.get('error', outcome.get('status'))} |"
    targeted = result.get("targeted") or {}
    measured = targeted.get("measured_motion") or {}
    visits = result.get("n_visits", 0)
    detector = result.get("detector")
    if not measured.get("measurable"):
        reason = measured.get("reason") or "movimiento previsto demasiado pequeño"
        return f"| {name} | {pm_total:.2f} | D{detector} | {visits} | - | - | - | no medible: {reason} |"
    pe, pn = measured["predicted_east_arcsec"], measured["predicted_north_arcsec"]
    me, mn = measured["measured_east_arcsec"], measured["measured_north_arcsec"]
    error = measured["uncertainty_arcsec"]
    diff = measured["difference_arcsec"]
    verdict = "compatible" if diff <= 2 * error else "difiere"
    return (
        f"| {name} | {pm_total:.2f} | D{detector} | {visits} | {measured['baseline_days']:.0f} | "
        f"E {pe:+.1f} / N {pn:+.1f} | E {me:+.1f} / N {mn:+.1f} ± {error:.1f} | "
        f"{verdict} (dif. {diff:.1f}″ = {diff / 6.15:.2f} px) |"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api", default="http://localhost:8000")
    parser.add_argument("--fov", type=float, default=6.0)
    parser.add_argument("--timeout", type=float, default=900.0)
    parser.add_argument("--out", default="")
    args = parser.parse_args()
    targets = json.loads(DATA.read_text(encoding="utf-8"))["targets"]
    lines = [
        "# Validación del movimiento: predicción frente a medición",
        "",
        f"Generado el {date.today().isoformat()} con datos reales de SPHEREx (IRSA) mediante "
        "`backend/scripts/validate_motion.py`. El desplazamiento previsto sale del movimiento propio de "
        "SIMBAD; el medido, de comparar la posición del objetivo en el apilado de la mitad temprana de "
        "las visitas con la de la mitad tardía, en el detector D6.",
        "",
        "| Objetivo | Mov. propio (″/año) | Detector | Visitas | Línea base (días) | Previsto (″) | Medido (″) | Estado |",
        "|---|---|---|---|---|---|---|---|",
    ]
    with httpx.Client(timeout=60.0) as client:
        for target in targets:
            if target["phenomenon"] not in MOVERS:
                pm = (target["pmra_mas_yr"] ** 2 + target["pmdec_mas_yr"] ** 2) ** 0.5 / 1000.0
                lines.append(
                    f"| {target['name']} | {pm:.2f} | - | - | - | - | - | "
                    "no aplica: movimiento previsto muy inferior a un píxel; se estudia por brillo |"
                )
                continue
            outcome = run(client, args.api, target, args.fov, args.timeout)
            lines.append(row(target, outcome))
            print(lines[-1])
    lines += [
        "",
        "Lectura: la incertidumbre combina el error estadístico del centroide con un piso sistemático de "
        "0,3 px (1,85″) por el centroide en una PSF submuestreada, la alineación entre exposiciones y el "
        "paralaje (hasta ~0,55″ en Barnard). \"Compatible\" significa diferencia menor que dos veces esa "
        "incertidumbre. \"No medible\" significa que el objeto es demasiado débil para localizarlo en cada "
        "mitad. Un píxel de SPHEREx son 6,15″, de modo que la comparación solo resuelve diferencias "
        "mayores de ~0,3 px.",
    ]
    text = "\n".join(lines) + "\n"
    if args.out:
        Path(args.out).write_text(text, encoding="utf-8")
    else:
        print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
