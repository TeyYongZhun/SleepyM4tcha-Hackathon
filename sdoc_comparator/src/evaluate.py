import json
import sys
from collections import Counter
from pathlib import Path

from compare import MATCH, PAIR_OK, PAIR_MISMATCH, PAIR_REVIEW
from label_vocab import COMPARISON_FIELDS, REVIEW_REASONS
from main import analyze_pair, find_pairs, FIELD_BY_DISPLAY

ROOT = Path(__file__).resolve().parent.parent
GROUND_TRUTH = ROOT / "data" / "ground_truth.json"
SAMPLE_DIR = ROOT / "data" / "sample_docs"

# ground truth spells it gross_weight_kg, the code says gross_weight
GT_FIELD = {"gross_weight_kg": "gross_weight"}


def main():
    quiet = "--quiet" in sys.argv
    truth = json.loads(GROUND_TRUTH.read_text(encoding="utf-8"))
    pairs = find_pairs(SAMPLE_DIR)

    confusion = Counter()
    reason_confusion = Counter()
    tp, fp, fn = Counter(), Counter(), Counter()
    disagreements = []
    not_evaluated = []

    for pair_id, docs in sorted(pairs.items()):
        gt = truth.get(pair_id)
        if gt is None:
            not_evaluated.append(pair_id)
            continue
        expected = gt["status"]
        expected_reason = gt["review_reason"]
        expected_fields = {GT_FIELD.get(f, f) for f in gt["defect_fields"]}

        result = analyze_pair(docs.get("SI"), docs.get("BL"))
        status, reason, mism = result["status"], result["reason"], result["mismatch_fields"]
        confusion[(expected, status)] += 1
        if expected == PAIR_REVIEW:
            reason_confusion[(expected_reason, reason)] += 1

        if expected == PAIR_MISMATCH and status in (PAIR_MISMATCH, PAIR_REVIEW):
            for f in COMPARISON_FIELDS:
                if f in mism and f in expected_fields:
                    tp[f] += 1
                elif f in mism:
                    fp[f] += 1
                elif f in expected_fields:
                    fn[f] += 1
        elif status == PAIR_MISMATCH:
            for f in mism:
                fp[f] += 1

        wrong_fields = expected == PAIR_MISMATCH and status == PAIR_MISMATCH and mism != expected_fields
        wrong_reason = expected == PAIR_REVIEW and status == PAIR_REVIEW and reason != expected_reason
        if status != expected or wrong_fields or wrong_reason:
            disagreements.append((pair_id, gt, result, expected_fields))

    # Emails the ground truth lists but that have no files at all can't be run.
    no_files = {i: g["review_reason"] for i, g in truth.items()
                if i not in pairs and g["status"] == PAIR_REVIEW}

    total = sum(confusion.values())
    correct = sum(n for (e, p), n in confusion.items() if e == p)
    print(f"Emails scored: {total}   (no ground truth for: {len(not_evaluated)})")
    print(f"Status agrees with ground truth: {correct}/{total} = {correct / total:.1%}\n")

    labels = [PAIR_OK, PAIR_MISMATCH, PAIR_REVIEW]
    print(f"{'expected \\ predicted':<22}" + "".join(f"{p:>14}" for p in labels))
    for e in labels:
        print(f"{e:<22}" + "".join(f"{confusion[(e, p)]:>14}" for p in labels))

    review_total = sum(reason_confusion.values())
    review_right = sum(n for (e, p), n in reason_confusion.items() if e == p)
    print(f"\nReview reason agrees (NEEDS_REVIEW pairs): {review_right}/{review_total}")
    print(f"  {'expected \\ predicted':<22}" + "".join(f"{r:>19}" for r in REVIEW_REASONS))
    for e in REVIEW_REASONS:
        if any(reason_confusion[(e, p)] for p in REVIEW_REASONS):
            print(f"  {e:<22}" + "".join(f"{reason_confusion[(e, p)]:>19}" for p in REVIEW_REASONS))

    print("\nDefect-field detection (mismatch pairs only):")
    print(f"  {'field':<20}{'precision':>10}{'recall':>8}")
    for f in COMPARISON_FIELDS:
        p = tp[f] / (tp[f] + fp[f]) if tp[f] + fp[f] else float("nan")
        r = tp[f] / (tp[f] + fn[f]) if tp[f] + fn[f] else float("nan")
        print(f"  {f:<20}{p:>10.2f}{r:>8.2f}")

    if no_files:
        print(f"\nNot scorable, no files in sample_docs: "
              + ", ".join(f"{i} ({r})" for i, r in sorted(no_files.items())))

    print(f"\nDisagreements: {len(disagreements)}")
    if quiet:
        return
    for pair_id, gt, result, exp_fields in disagreements:
        why = gt["review_reason"] or ",".join(sorted(exp_fields)) or "-"
        got = result["status"] + (f" ({result['reason']})" if result["reason"] else "")
        print(f"\n{pair_id}: expected {gt['status']} ({why}) -> predicted {got}")
        for line in result["details"]:
            print(f"    {line}")
        if result["rows"]:
            print(f"    predicted mismatch: {sorted(result['mismatch_fields'])}  "
                  f"unsure: {sorted(result['unsure_fields'])}  expected fields: {sorted(exp_fields)}")
            for r in result["rows"]:
                f = FIELD_BY_DISPLAY[r["field"]]
                if r["status"] != MATCH and f not in exp_fields and f not in result["unsure_fields"]:
                    print(f"    [{r['field']}] SI: {r['si_value'][:60]} | BL: {r['bl_value'][:60]}")
        if result["low_conf"]:
            print(f"    low-confidence labels: {result['low_conf']}")


if __name__ == "__main__":
    main()
