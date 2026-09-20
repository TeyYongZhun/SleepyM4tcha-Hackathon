import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

from extractor import extract_fields
from compare import (
    compare_documents, format_report, format_escalation, pair_status,
    PAIR_REVIEW, PAIR_MISMATCH, UNSURE, MISMATCH,
)
from label_vocab import REVIEW_REASONS, MISSING_ATTACHMENT, DISPLAY_NAME, COMPARISON_FIELDS

ROOT = Path(__file__).resolve().parent.parent
DEMO_OUTPUT = ROOT / "output" / "demo_results.json"

FIELD_BY_DISPLAY = {v: k for k, v in DISPLAY_NAME.items()}
TO_GT_FIELD = {"gross_weight": "gross_weight_kg"}   # our field name -> the name used in ground_truth.json


def _escalate(problems):
    """problems: list of (reason, text). The main reason is the first one in REVIEW_REASONS order."""
    reasons = {r for r, _ in problems}
    main_reason = next(r for r in REVIEW_REASONS if r in reasons)
    return {
        "status": PAIR_REVIEW,
        "reason": main_reason,
        "report": format_escalation(main_reason, problems),
        "details": [f"[{r}] {t}" for r, t in problems],
        "rows": [],
        "mismatch_fields": set(),
        "unsure_fields": set(),
        "low_conf": [],
    }


def analyze_pair(si_path, bl_path):
    """
    Runs the whole flow on one pair. A path of None means that attachment
    was never received. Returns a dict:
        status   OK / MISMATCH / NEEDS_REVIEW
        reason   None, or one of missing_attachment / unreadable /
                 wrong_doc_type / missing_value (why a human is needed)
        report   the text report
        details  short lines saying what is wrong (for NEEDS_REVIEW)
        rows, mismatch_fields, unsure_fields, low_conf   for callers that want more
    """
    problems = []
    for name, path in (("SI", si_path), ("BL", bl_path)):
        if path is None:
            other = "BL" if name == "SI" else "SI"
            problems.append((MISSING_ATTACHMENT, f"{name}: no file received (only the {other} was found)"))
    if problems:
        return _escalate(problems)

    si_fields, si_review, si_problem = extract_fields(si_path, "SI")
    bl_fields, bl_review, bl_problem = extract_fields(bl_path, "BL")

    # If either document can't be used, don't attempt a comparison at all --
    # comparing against an empty extraction would produce a misleading
    # "everything is missing" report. Flag it for a person instead.
    for name, path, problem in (("SI", si_path, si_problem), ("BL", bl_path, bl_problem)):
        if problem:
            reason, message = problem
            problems.append((reason, f"{name}: {_rel(path)} -- {message}"))
    if problems:
        return _escalate(problems)

    rows = compare_documents(si_fields, bl_fields)
    status, reason = pair_status(rows)
    return {
        "status": status,
        "reason": reason,
        "report": format_report(rows, si_review, bl_review),
        "details": [f"[{r['field']}] SI: {r['si_value']} | BL: {r['bl_value']}"
                    for r in rows if r["status"] == UNSURE],
        "rows": rows,
        "mismatch_fields": {FIELD_BY_DISPLAY[r["field"]] for r in rows if r["status"] == MISMATCH},
        "unsure_fields": {FIELD_BY_DISPLAY[r["field"]] for r in rows if r["status"] == UNSURE},
        "low_conf": [(label, round(float(conf), 2)) for label, _, conf in si_review + bl_review],
    }


def run_pair(si_path, bl_path):
    print(f"\n{'=' * 70}")
    print(f"SI: {si_path or '(not received)'}")
    print(f"BL: {bl_path or '(not received)'}")
    print("=" * 70)
    result = analyze_pair(si_path, bl_path)
    print(result["report"])
    return result


def _rel(path):
    """A path as text relative to the project root (None stays None), so the saved file is portable."""
    if path is None:
        return None
    try:
        return Path(path).resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return str(path)


def result_to_json(si_path, bl_path, result):
    """One pair's result in the same shape as an entry in data/ground_truth.json
    (category, status, review_reason, defect_fields, has_defect), followed by the
    files and the per-field comparison behind the verdict."""
    # ground_truth.json lists fields only when the verdict is MISMATCH, and calls gross weight "gross_weight_kg"
    defects = []
    if result["status"] == PAIR_MISMATCH:
        defects = [TO_GT_FIELD.get(f, f) for f in COMPARISON_FIELDS if f in result["mismatch_fields"]]
    return {
        "category": "BL_COMPARISON",
        "status": result["status"],
        "review_reason": result["reason"],
        "defect_fields": defects,
        "has_defect": bool(defects),
        "si_file": _rel(si_path),
        "bl_file": _rel(bl_path),
        "fields": result["rows"],
    }


def find_pairs(folder: Path):
    """Group files named like email_004_SI.txt / email_004_BL.pdf by email id.
    Returns {id: {"SI": path, "BL": path}}; an id with only one file has only one key."""
    by_id = defaultdict(dict)
    for p in sorted(Path(folder).iterdir()):
        m = re.match(r"(.+)_(SI|BL)$", p.stem, re.IGNORECASE)
        if m:
            by_id[m.group(1)][m.group(2).upper()] = p
    return dict(by_id)


def run_all(folder):
    pairs = find_pairs(folder)
    if not pairs:
        print(f"No SI/BL files found in {folder}")
        return

    tally = Counter()
    for pair_id, docs in pairs.items():
        result = analyze_pair(docs.get("SI"), docs.get("BL"))
        label = result["status"] + (f" ({result['reason']})" if result["reason"] else "")
        tally[label] += 1
        print(f"{pair_id:<12} {label}")
        if result["status"] == PAIR_REVIEW:
            for line in result["details"]:
                print(f"    {line}")

    print(f"\n{len(pairs)} email(s): " + ", ".join(f"{n} x {v}" for v, n in tally.most_common()))


def demo():
    DEMO_DIR = ROOT / "data" / "demo_docs"
    pairs = find_pairs(DEMO_DIR)
    if not pairs:
        print(f"No SI/BL files found in {DEMO_DIR}")
        return

    saved = {}
    for pair_id, docs in pairs.items():
        si_path, bl_path = docs.get("SI"), docs.get("BL")
        saved[pair_id] = result_to_json(si_path, bl_path, run_pair(si_path, bl_path))

    DEMO_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    DEMO_OUTPUT.write_text(json.dumps(saved, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nSaved {len(saved)} result(s) to {_rel(DEMO_OUTPUT)}")


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--all":
        run_all(sys.argv[2])
    elif len(sys.argv) == 3:
        run_pair(sys.argv[1], sys.argv[2])
    else:
        demo()
