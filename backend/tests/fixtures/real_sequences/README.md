# Real sequences for the browser tests

Results of `POST /sequences` computed on 2026-11-12 from real SPHEREx data (NASA/IPAC IRSA) for the five
challenge targets, with and without the AllWISE reference frame: `last.json` per sequence, the rendered
frame PNGs, the reference PNG and the request index. Nothing here is synthetic.

The browser tests (`frontend/e2e`) start the backend with the archive unreachable, so each request is
answered from these files and labelled as served from cache. Regenerate with
`backend/scripts/warm_targets.py` and copy `<storage>/sequences/index` and the referenced keys.
