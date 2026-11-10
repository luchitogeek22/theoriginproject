"""Sky reference data: bright-star visual references (catalog J2000, approximate).

These are orientation landmarks only — clearly labeled in the UI as
reference visuals, never as SPHEREx detections.
"""

import json
import os

from fastapi import APIRouter

from app.schemas import ReferenceStar

router = APIRouter()


def _load() -> list[dict]:
    path = os.path.join(os.path.dirname(__file__), "..", "data", "reference_stars.json")
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


@router.get("/sky/reference-stars", response_model=list[ReferenceStar])
def reference_stars() -> list[ReferenceStar]:
    return [ReferenceStar(**row) for row in _load()]
