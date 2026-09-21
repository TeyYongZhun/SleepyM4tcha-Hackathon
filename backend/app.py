"""FastAPI gateway: serves both ML models to the Next.js frontend.

Run from the repo root:

    .venv/Scripts/python.exe -m uvicorn backend.app:app --reload --port 8000

Then set BACKEND_API_URL=http://localhost:8000 in .env.local and restart
`npm run dev`. The frontend needs no code change: `backendEnabled` flips on
its own and `request()` starts calling these two routes.

Two routes, deliberately split by cost:

    GET /emails        classification only. Cheap: the frontend's HTTP client
                       aborts after 15s, and parsing every attachment of 520
                       emails would blow that budget many times over.
    GET /emails/{id}   the same, plus the SI-vs-BL comparison for the one
                       email being opened.
"""
from __future__ import annotations

import logging
import sys
import tempfile
from functools import lru_cache
from pathlib import Path

import joblib
from fastapi import Body, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

ROOT = Path(__file__).resolve().parent.parent
# Both saved models pickle references to modules by the name they had when the
# model was trained -- classifier.joblib holds "src.pipeline", and Sam's holds
# the top-level "label_vocab". joblib.load re-imports those by name, so the
# directories that make those names resolve must be on sys.path. Restructuring
# either project into a package would break loading its own model, which is why
# both stay as they are.
sys.path.insert(0, str(ROOT / "sdoc_comparator" / "src"))   # main, extractor, compare, label_vocab
sys.path.insert(0, str(ROOT / "sdoc_classifier"))           # src.pipeline, src.features, ...
sys.path.insert(0, str(ROOT))                               # sdoc_classifier.src.*

from sdoc_classifier.src.config import LOW_CONFIDENCE_THRESHOLD  # noqa: E402
from sdoc_classifier.src.features import featurize          # noqa: E402
from sdoc_classifier.src.loading import inbox_paths, load_email, parse_record  # noqa: E402
from sdoc_classifier.src.predict import classify            # noqa: E402

import main as comparator                                   # noqa: E402  (sdoc_comparator/src/main.py)

from .assemble import comparison_json, email_json, kind_of, submission_entry, summary   # noqa: E402

log = logging.getLogger("gateway")

INBOX_DIR = ROOT / "sdoc_classifier" / "data" / "inbox"
MODEL_PATH = ROOT / "sdoc_classifier" / "models" / "classifier.joblib"
ATTACHMENT_DIR = ROOT / "public" / "dummy" / "attachments"

app = FastAPI(title="WayBoxAI gateway")

# The Next.js server calls this from Node, not the browser, so CORS is not
# strictly needed -- but it makes `curl` from a browser tab and any future
# client-side fetch work without surprises.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


@lru_cache(maxsize=1)
def _model():
    return joblib.load(MODEL_PATH)


@lru_cache(maxsize=1)
def _records() -> dict:
    """The demo inbox, keyed by email_id. Cached: reading 520 files per
    request would dominate the response time."""
    return {r.email_id: r for r in (load_email(p) for p in inbox_paths(INBOX_DIR))}


@lru_cache(maxsize=1)
def _predictions() -> dict:
    """Classify the whole inbox once, then serve from memory."""
    records = list(_records().values())
    preds = classify(_model(), [featurize(r) for r in records])
    return {p.email_id: p for p in preds}


def _doc_pair(record) -> tuple[Path | None, Path | None]:
    """The email's SI and BL attachments as paths on disk, or None each."""
    si = bl = None
    for name in record.attachments:
        path = ATTACHMENT_DIR / Path(name).name
        if not path.exists():
            continue
        kind = kind_of(path.name)
        if kind == "SI" and si is None:
            si = path
        elif kind == "BL" and bl is None:
            bl = path
    return si, bl


def _compare(record, prediction):
    """Run the SI-vs-BL comparison, or return None when it does not apply.

    A failure here must not take the email with it: the dashboard showing a
    correctly-classified email with no comparison is far better than a 500.
    """
    if prediction.category != "BL_COMPARISON":
        return None
    si, bl = _doc_pair(record)
    if si is None and bl is None:
        # Nothing to compare. If the body promised documents ("attached are the
        # SI and draft BL") and none arrived, that is itself a missing
        # attachment for someone to chase -- and it separates the two cases
        # exactly on the demo inbox: of the 94 BL_COMPARISON emails with no
        # document pair, the 91 that make no such claim are all OK in
        # ground_truth.json, and the 3 that do are all missing_attachment.
        if featurize(record).flags.get("body_claims_attachment"):
            return {
                "status": "NEEDS_REVIEW",
                "reason": "missing_attachment",
                "rows": [],
                "mismatch_fields": set(),
            }
        return None
    try:
        return comparator.analyze_pair(si, bl)
    except Exception:
        log.exception("comparison failed for %s", record.email_id)
        return None


@app.get("/health")
def health():
    return {"status": "ok", "emails": len(_records())}


@app.get("/emails")
def list_emails():
    """Every email with its category and summary. No attachment parsing."""
    preds = _predictions()
    return [email_json(r, preds[eid]) for eid, r in _records().items()]


@app.get("/emails/{email_id}")
def get_email(email_id: str):
    """One email, plus the SI-vs-BL comparison when it is a BL_COMPARISON."""
    record = _records().get(email_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"No such email: {email_id}")
    prediction = _predictions()[email_id]
    return email_json(record, prediction, _compare(record, prediction))


@lru_cache(maxsize=1)
def _submission() -> dict:
    """Every email of the demo inbox as a ground_truth.json-shaped entry. Compares every BL
    pair, so it is slow once and instant after."""
    preds = _predictions()
    return {
        eid: submission_entry(preds[eid], _compare(record, preds[eid]), comparator.TO_GT_FIELD)
        for eid, record in _records().items()
    }


@app.get("/submission")
def submission():
    """The whole inbox as a submission (category + SI-vs-BL verdict per email), ready to be
    scored against ground_truth.json. The frontend's Export button asks for this in backend mode."""
    return _submission()


@app.get("/api/demo-attachments/{name}")
def attachment_file(name: str):
    """Serves the demo attachments the Email.url fields point at."""
    path = ATTACHMENT_DIR / Path(name).name      # basename only: no path traversal
    if not path.exists():
        raise HTTPException(status_code=404, detail="No such attachment")
    return FileResponse(path)


@app.post("/classify")
def classify_one(message: dict = Body(...)):
    """Classify a single message that did not come from the demo inbox.

    This is what `src/lib/gmail/enrich.ts` calls for each Gmail message, so the
    user's own mail runs through the same model as the seeded inbox. It reuses
    the exact chain GET /emails uses -- parse_record -> featurize -> classify --
    rather than a second copy of the logic.

    Body: {email_id?, from|sender, subject, body, attachments?}
    Returns: {category, confidence, model_category, low_confidence, summary}

    The model is trained on 520 templated logistics emails, so on a real inbox
    it is often out of its depth. Below LOW_CONFIDENCE_THRESHOLD we report
    GENERAL rather than a confident wrong answer, but keep what the model
    actually said in `model_category` so nothing is hidden.
    """
    try:
        record = parse_record({**message, "email_id": message.get("email_id") or "inbound"})
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Unreadable message: {exc}") from exc

    try:
        prediction = classify(_model(), [featurize(record)])[0]
    except Exception:
        log.exception("classification failed for %s", record.email_id)
        raise HTTPException(status_code=500, detail="Classification failed")

    low = prediction.source == "model" and prediction.confidence < LOW_CONFIDENCE_THRESHOLD
    category = "GENERAL" if low else prediction.category
    return {
        "category": category,
        "confidence": round(float(prediction.confidence), 4),
        "model_category": prediction.category,
        "low_confidence": low,
        "summary": summary(category, prediction.confidence, len(record.attachments), record.body),
    }


@app.post("/compare")
async def compare_uploaded(si: UploadFile = File(...), bl: UploadFile = File(...)):
    """Compare an SI against a BL that arrived as email attachments.

    GET /emails/{id} compares the seeded inbox, whose documents are already on
    disk. Gmail attachments only exist as bytes, so they are written to a temp
    directory first -- extract_fields() dispatches on the file extension
    (sdoc_comparator/src/extractor.py), so each name's suffix has to survive.

    The directory is removed as soon as the request ends: nothing from the
    user's mail is kept.
    """
    with tempfile.TemporaryDirectory(prefix="wayboxai-") as tmp:
        paths = {}
        for label, upload in (("SI", si), ("BL", bl)):
            # Basename only -- an uploaded name is untrusted and must not escape tmp.
            name = Path(upload.filename or f"{label}.txt").name
            path = Path(tmp) / f"{label}_{name}"
            path.write_bytes(await upload.read())
            paths[label] = path

        try:
            result = comparator.analyze_pair(paths["SI"], paths["BL"])
        except Exception:
            log.exception("comparison failed for uploaded %s / %s", si.filename, bl.filename)
            raise HTTPException(status_code=500, detail="Comparison failed")

    return comparison_json(result)
