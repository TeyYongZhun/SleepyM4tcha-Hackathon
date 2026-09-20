"""Load the model, classify the inbox, write the submission.

    python -m src.predict [--inbox DIR] [--model PATH]
"""
import argparse
import json
import logging
import sys
from pathlib import Path

import joblib

from .config import (DEFAULT_REVIEW_REASON, DEFAULT_STATUS, INBOX_DIR, LOW_CONFIDENCE_THRESHOLD,
                     MAJORITY_CLASS, MODEL_PATH, OUT_DIR, PREDICTIONS_PATH, SUBMISSION_PATH)
from .features import featurize
from .loading import email_index, inbox_paths, load_email
from .rules import apply_rules, rule_disagreements
from .schema import Features, Prediction

log = logging.getLogger(__name__)


def classify(model, feats: list[Features]) -> list[Prediction]:
    """Model prediction followed by the rule override."""
    if not feats:
        return []
    proba = model.predict_proba(feats)
    classes = list(model.classes_)
    preds = []
    for f, row in zip(feats, proba):
        i = int(row.argmax())
        pred = Prediction(email_id=f.email_id, category=str(classes[i]),
                          confidence=float(row[i]), source="model",
                          model_category=str(classes[i]))
        preds.append(apply_rules(f, pred))
    return preds


def error_prediction(email_id: str) -> Prediction:
    return Prediction(email_id=email_id, category=MAJORITY_CLASS, confidence=0.0,
                      source="error", model_category=None)


def classify_inbox(model, inbox_dir: Path) -> list[Prediction]:
    """Classify every email; one bad email never kills the run."""
    feats: list[Features] = []
    failed: list[Prediction] = []
    for path in inbox_paths(inbox_dir):
        try:
            feats.append(featurize(load_email(path)))
        except Exception:
            log.exception("failed to load/featurise %s", path.name)
            failed.append(error_prediction(path.stem))

    try:
        preds = classify(model, feats)
    except Exception:
        log.exception("batch prediction failed; falling back to per-email")
        preds = []
        for f in feats:
            try:
                preds.extend(classify(model, [f]))
            except Exception:
                log.exception("failed to classify %s", f.email_id)
                preds.append(error_prediction(f.email_id))

    return sorted(preds + failed, key=lambda p: email_index(p.email_id))


def submission_entry(pred: Prediction) -> dict:
    return {
        "category": pred.category,
        "status": DEFAULT_STATUS,
        "review_reason": DEFAULT_REVIEW_REASON,
        "defect_fields": [],
        "has_defect": False,
    }


def write_outputs(preds: list[Prediction], submission_path: Path, predictions_path: Path):
    submission = {p.email_id: submission_entry(p) for p in preds}
    diagnostics = {
        p.email_id: {**submission_entry(p), "confidence": round(p.confidence, 4),
                     "source": p.source, "model_category": p.model_category}
        for p in preds
    }
    submission_path.parent.mkdir(parents=True, exist_ok=True)
    with open(submission_path, "w", encoding="utf-8") as f:
        json.dump(submission, f, indent=2)
    with open(predictions_path, "w", encoding="utf-8") as f:
        json.dump(diagnostics, f, indent=2)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--inbox", type=Path, default=INBOX_DIR)
    ap.add_argument("--model", type=Path, default=MODEL_PATH)
    ap.add_argument("--out", type=Path, default=OUT_DIR)
    ap.add_argument("--show", action="store_true", help="print one line per email")
    args = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    model = joblib.load(args.model)
    preds = classify_inbox(model, args.inbox)
    write_outputs(preds, args.out / SUBMISSION_PATH.name, args.out / PREDICTIONS_PATH.name)

    from collections import Counter
    if args.show:
        print(f"{'email_id':<16}{'category':<15}{'confidence':>10}  source")
        for p in preds:
            print(f"{p.email_id:<16}{p.category:<15}{p.confidence:>10.2f}  {p.source}")
        print()
    print(f"classified {len(preds)} emails -> {args.out / SUBMISSION_PATH.name}")
    print("by category:", dict(Counter(p.category for p in preds)))
    print("by source:  ", dict(Counter(p.source for p in preds)))
    disagreements = rule_disagreements(preds)
    print(f"rule/model disagreements: {len(disagreements)}")
    for p in disagreements:
        print(f"  {p.email_id}: model said {p.model_category}, rule said {p.category}")
    low = [p for p in preds if p.source == "model" and p.confidence < LOW_CONFIDENCE_THRESHOLD]
    print(f"low-confidence (< {LOW_CONFIDENCE_THRESHOLD}) model predictions: {len(low)}")
    for p in low:
        print(f"  {p.email_id}: {p.category} @ {p.confidence:.2f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
