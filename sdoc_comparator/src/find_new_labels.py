import sys
import csv
from pathlib import Path
from collections import OrderedDict

from extractor import read_document_pairs, classify_label

ROOT = Path(__file__).resolve().parent.parent
OUT_PATH = ROOT / "data" / "candidate_labels.csv"

SUPPORTED_SUFFIXES = {".txt", ".xlsx", ".pdf"}


def scan_folder(folder: Path):
    """Returns an OrderedDict of unique raw_label -> example_value,
    keeping the first value seen for each label as a preview."""
    seen = OrderedDict()
    files = sorted(p for p in folder.rglob("*") if p.suffix.lower() in SUPPORTED_SUFFIXES)

    if not files:
        print(f"No .txt / .xlsx / .pdf files found under {folder}")
        return seen

    for path in files:
        try:
            pairs = read_document_pairs(path)
        except Exception as e:
            print(f"  [skipped, could not read] {path.name}: {type(e).__name__}: {e}")
            continue

        for raw_label, value in pairs:
            raw_label = raw_label.strip()
            if raw_label and raw_label not in seen:
                seen[raw_label] = value

    print(f"Scanned {len(files)} file(s), found {len(seen)} distinct raw labels.\n")
    return seen


def main():
    if len(sys.argv) != 2:
        print("Usage: python src/find_new_labels.py path/to/folder_of_new_docs")
        sys.exit(1)

    folder = Path(sys.argv[1])
    if not folder.is_dir():
        print(f"Not a folder: {folder}")
        sys.exit(1)

    labels = scan_folder(folder)
    if not labels:
        return

    rows = []
    print(f"{'RAW LABEL':<45} {'GUESS':<20} {'CONF':<6} EXAMPLE VALUE")
    print("-" * 100)
    for raw_label, example_value in labels.items():
        field, confidence = classify_label(raw_label)
        guess_display = field if field else "(unknown)"
        conf_display = f"{confidence:.2f}"
        example_preview = str(example_value)[:40].replace("\n", " ")
        print(f"{raw_label:<45} {guess_display:<20} {conf_display:<6} {example_preview}")

        # Pre-fill with the classifier's best guess whenever it made one
        # at all (extractor.classify_label already applies its own
        # confidence floor before returning a field instead of None).
        # This is a REVIEW file, not final training data -- prefilling
        # low-confidence-but-plausible guesses means you're correcting
        # mistakes instead of typing every field from scratch, but you
        # should still eyeball every row before merging it in.
        prefill = field if field else ""
        rows.append({"label_text": raw_label, "canonical_field": prefill})

    OUT_PATH.parent.mkdir(exist_ok=True)
    with open(OUT_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["label_text", "canonical_field"])
        writer.writeheader()
        writer.writerows(rows)

    blanks = sum(1 for r in rows if not r["canonical_field"])
    print(f"\nWrote {len(rows)} candidate rows to {OUT_PATH}")
    print(f"({blanks} left blank for you to fill in -- everything else was a confident guess, double-check it anyway)")


if __name__ == "__main__":
    main()
