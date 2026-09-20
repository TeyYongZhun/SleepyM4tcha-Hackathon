"""Cross-validate, fit on all training emails, persist.

    python -m src.train [--model logreg|svc]
"""
import argparse
import json
import statistics
import sys

import joblib

from .config import CV_FOLDS, CV_REPORT_PATH, ERRORS_PATH, MODEL_PATH
from .evaluate import (cross_validated_predictions, load_training_set, report, sample_weights,
                       write_errors)
from .pipeline import build_pipeline


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--model", default="logreg", choices=["logreg", "svc"])
    ap.add_argument("--no-handwritten", action="store_true",
                    help="train on the generated emails only")
    args = ap.parse_args(argv)

    feats, labels = load_training_set(handwritten=not args.no_handwritten)
    n_hw = sum(1 for f in feats if f.email_id.startswith("hw_"))
    print(f"training set: {len(feats)} emails = {len(feats) - n_hw} generated "
          f"+ {n_hw} hand-written (edge cases 501-520 excluded)")

    oof, fold_f1 = cross_validated_predictions(feats, labels, args.model)
    summary = report(labels, oof, title=f"{CV_FOLDS}-fold out-of-fold, {args.model}")
    print("per-fold macro-F1:", " ".join(f"{x:.4f}" for x in fold_f1),
          f"(mean {statistics.mean(fold_f1):.4f}, sd {statistics.pstdev(fold_f1):.4f})")
    for name, keep in [("generated", lambda e: not e.startswith("hw_")),
                       ("hand-written", lambda e: e.startswith("hw_"))]:
        pairs = [(t, p) for f, t, p in zip(feats, labels, oof) if keep(f.email_id)]
        if pairs:
            right = sum(t == p.category for t, p in pairs)
            print(f"  out-of-fold on {name} emails: {right}/{len(pairs)} correct")
    n_err = write_errors(feats, labels, oof)
    print(f"{n_err} out-of-fold errors -> {ERRORS_PATH}")

    model = build_pipeline(args.model).fit(feats, labels, clf__sample_weight=sample_weights(feats))
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, MODEL_PATH)
    print(f"final model fit on all {len(feats)} -> {MODEL_PATH}")

    CV_REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(CV_REPORT_PATH, "w", encoding="utf-8") as f:
        json.dump({"model": args.model, "fold_macro_f1": fold_f1, **summary}, f, indent=2)
    return 0


if __name__ == "__main__":
    sys.exit(main())
