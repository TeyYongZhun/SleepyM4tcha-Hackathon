"""Confusion matrix, per-class P/R/F1, error dump.

    python -m src.evaluate                       # out-of-fold CV on the training set
    python -m src.evaluate --predictions out/predictions.json   # score a prediction file
    python -m src.evaluate --labelled extra_data/test_handwritten.json  # saved model on a labelled file
"""
import argparse
import json
import sys
from collections import Counter
from pathlib import Path

import joblib
from sklearn.base import clone
from sklearn.metrics import classification_report, confusion_matrix, f1_score
from sklearn.model_selection import StratifiedKFold

from .config import (CATEGORIES, CV_FOLDS, ERRORS_PATH, GROUND_TRUTH_PATH,
                     HANDWRITTEN_ID_PREFIX, HANDWRITTEN_TRAIN_PATH, HANDWRITTEN_WEIGHT,
                     INBOX_DIR, MODEL_PATH, RANDOM_STATE)
from .features import featurize_all
from .loading import is_training_id, load_ground_truth, load_inbox, load_labelled_file
from .pipeline import build_pipeline
from .predict import classify
from .rules import rule_disagreements
from .schema import Features, Prediction


def load_training_set(inbox_dir=INBOX_DIR, gt_path=GROUND_TRUTH_PATH,
                      handwritten: bool = True):
    """Featurised email_001..500 with their labels (edge cases excluded),
    plus the hand-written training emails when `handwritten` is set."""
    gt = load_ground_truth(gt_path)
    records = [r for r in load_inbox(inbox_dir) if is_training_id(r.email_id) and r.email_id in gt]
    labels = [gt[r.email_id] for r in records]
    if handwritten and HANDWRITTEN_TRAIN_PATH.exists():
        hw_records, hw_labels = load_labelled_file(HANDWRITTEN_TRAIN_PATH)
        records += hw_records
        labels += hw_labels
    return featurize_all(records), labels


def sample_weights(feats: list[Features]) -> list[float]:
    return [HANDWRITTEN_WEIGHT if f.email_id.startswith(HANDWRITTEN_ID_PREFIX) else 1.0
            for f in feats]


def score_labelled_file(path: Path, model_path: Path = MODEL_PATH) -> dict:
    """Score the saved model on a labelled JSON file (e.g. the held-out
    hand-written set) and list every miss."""
    records, labels = load_labelled_file(path)
    feats = featurize_all(records)
    preds = classify(joblib.load(model_path), feats)
    result = report(labels, preds, title=f"{path.name} with {model_path.name}")
    for f, t, p in zip(feats, labels, preds):
        if t != p.category:
            print(f"  WRONG {f.email_id}: true {t}, predicted {p.category} @ {p.confidence:.2f}"
                  f"  | {f.email.record.subject}")
    return result


def cross_validated_predictions(feats: list[Features], labels: list[str],
                                model: str = "logreg") -> tuple[list[Prediction], list[float]]:
    """Out-of-fold predictions (rule applied) and per-fold macro-F1."""
    skf = StratifiedKFold(n_splits=CV_FOLDS, shuffle=True, random_state=RANDOM_STATE)
    template = build_pipeline(model)
    oof: list[Prediction | None] = [None] * len(feats)
    fold_f1 = []
    for train_idx, test_idx in skf.split(feats, labels):
        est = clone(template).fit([feats[i] for i in train_idx], [labels[i] for i in train_idx],
                                  clf__sample_weight=sample_weights([feats[i] for i in train_idx]))
        preds = classify(est, [feats[i] for i in test_idx])
        for i, p in zip(test_idx, preds):
            oof[i] = p
        fold_f1.append(f1_score([labels[i] for i in test_idx], [p.category for p in preds],
                                labels=CATEGORIES, average="macro", zero_division=0))
    return oof, fold_f1


def confusion_grid(y_true: list[str], y_pred: list[str]) -> str:
    abbrev = {"BL_COMPARISON": "BL_CMP", "SI_REQUEST": "SI_REQ", "INVOICE_QUERY": "INVOICE",
              "GENERAL": "GENERAL", "SPAM": "SPAM"}
    m = confusion_matrix(y_true, y_pred, labels=CATEGORIES)
    w = 9
    lines = ["true \\ pred".ljust(14) + "".join(abbrev[c].rjust(w) for c in CATEGORIES)]
    for c, row in zip(CATEGORIES, m):
        lines.append(abbrev[c].ljust(14) + "".join(str(v).rjust(w) for v in row))
    return "\n".join(lines)


def report(y_true: list[str], preds: list[Prediction], title: str = "") -> dict:
    y_pred = [p.category for p in preds]
    macro = f1_score(y_true, y_pred, labels=CATEGORIES, average="macro", zero_division=0)
    acc = sum(t == p for t, p in zip(y_true, y_pred)) / len(y_true) if y_true else 0.0
    if title:
        print(f"\n=== {title} (n={len(y_true)}) ===")
    print(classification_report(y_true, y_pred, labels=CATEGORIES, digits=4, zero_division=0))
    print(confusion_grid(y_true, y_pred))
    disagreements = rule_disagreements(preds)
    print(f"\nmacro-F1: {macro:.4f}   accuracy: {acc:.4f}")
    print(f"sources: {dict(Counter(p.source for p in preds))}   "
          f"rule/model disagreements: {len(disagreements)}")
    return {"macro_f1": macro, "accuracy": acc, "n": len(y_true),
            "rule_disagreements": [p.email_id for p in disagreements],
            "confusion": confusion_matrix(y_true, y_pred, labels=CATEGORIES).tolist()}


def write_errors(feats: list[Features], y_true: list[str], preds: list[Prediction],
                 path: Path = ERRORS_PATH) -> int:
    errors = [
        {"email_id": f.email_id, "true": t, "predicted": p.category,
         "confidence": round(p.confidence, 4), "source": p.source,
         "subject_raw": f.email.record.subject, "subject_clean": f.email.subject_clean,
         "body_clean": f.email.body_clean,
         "flags": {k: v for k, v in f.flags.items() if v}}
        for f, t, p in zip(feats, y_true, preds) if t != p.category
    ]
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(errors, fh, indent=2, ensure_ascii=False)
    return len(errors)


def score_prediction_file(path: Path, gt_path: Path = GROUND_TRUTH_PATH) -> dict:
    """Score a submission.json / predictions.json against ground truth, split
    into the main set and the edge cases. A missing email counts as GENERAL,
    matching the official scorer."""
    gt = load_ground_truth(gt_path)
    with open(path, encoding="utf-8") as f:
        sub = json.load(f)
    results = {}
    for name, ids in [("main 001-500", [e for e in gt if is_training_id(e)]),
                      ("edge 501-520", [e for e in gt if not is_training_id(e)]),
                      ("all", list(gt))]:
        if not ids:
            continue
        preds = [Prediction(e, sub.get(e, {}).get("category", "GENERAL"),
                            float(sub.get(e, {}).get("confidence", 1.0)),
                            sub.get(e, {}).get("source", "model"),
                            sub.get(e, {}).get("model_category"))
                 for e in ids]
        results[name] = report([gt[e] for e in ids], preds, title=f"{path.name} - {name}")
        wrong = [(e, gt[e], p.category) for e, p in zip(ids, preds) if gt[e] != p.category]
        for e, t, p in wrong:
            print(f"  WRONG {e}: true {t}, predicted {p}")
    return results


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--predictions", type=Path,
                    help="score this submission/predictions file instead of running CV")
    ap.add_argument("--labelled", type=Path,
                    help="score the saved model on a labelled JSON file")
    ap.add_argument("--model", default="logreg", choices=["logreg", "svc"])
    ap.add_argument("--no-handwritten", action="store_true",
                    help="train on the generated emails only")
    args = ap.parse_args(argv)

    if args.predictions:
        score_prediction_file(args.predictions)
        return 0
    if args.labelled:
        score_labelled_file(args.labelled)
        return 0

    feats, labels = load_training_set(handwritten=not args.no_handwritten)
    oof, fold_f1 = cross_validated_predictions(feats, labels, args.model)
    report(labels, oof, title=f"{CV_FOLDS}-fold out-of-fold, {args.model}")
    print("per-fold macro-F1:", " ".join(f"{x:.4f}" for x in fold_f1))
    n = write_errors(feats, labels, oof)
    print(f"{n} misclassified -> {ERRORS_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
