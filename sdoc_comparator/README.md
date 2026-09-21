# sdoc_comparator — SI/BL document comparison

**Stage 2 of the pipeline.** For each email the classifier marks `BL_COMPARISON`, this compares the Shipping Instruction (SI) with the draft Bill of Lading (BL) attached to it and flags the fields that don't agree, so a person only has to look at the pairs that need it.

It is one half of the ML side of WayBoxAI. The other half, [`../sdoc_classifier/`](../sdoc_classifier/README.md), decides which emails are `BL_COMPARISON` in the first place. The [root README](../README.md) covers the whole system. The step-by-step flow, a diagram and a map of the code are in [WORKFLOW.md](WORKFLOW.md).

## What it decides

Every pair gets one verdict, in the vocabulary of the organisers' `ground_truth.json`:

| Verdict | When |
|---------|------|
| `OK` | All seven compared fields match. |
| `MISMATCH` | At least one field differs, and none are unsure. The report lists SI vs BL for each. |
| `NEEDS_REVIEW` | A person is needed. The reason is one of `missing_attachment`, `unreadable`, `wrong_doc_type` or `missing_value`. |

**The seven compared fields:** shipper, consignee, notify party, port of loading, port of discharge, container count and gross weight. Each is marked `match`, `mismatch`, or `unsure` (blank or a placeholder such as `TBA` or `N/A` on either side). An unsure field takes priority: a pair with both a mismatch and an unsure field is `NEEDS_REVIEW` (`missing_value`), and the report still lists the mismatch.

**It prefers to ask a person over guessing.** A missing file, an unreadable file, the wrong kind of document, or a blank value all stop the comparison and go to a human with a stated reason, rather than producing a misleading "everything differs" report.

## Results

Run on the organisers' 520-email dataset through the gateway (each `BL_COMPARISON` email's real SI and BL attachments), and compared with `ground_truth.json`:

| What is measured | Result |
|---|---|
| Verdict, review reason and defect fields, all 520 emails | **519 / 520** exactly right |
| Of the 46 mismatches, found with exactly the right fields | **45 / 46** |
| Of the 20 needs-review cases (5 for each reason), given the right reason | **20 / 20** |
| The 454 `OK` emails, left alone | **454 / 454** |
| The 20 edge cases `email_501`–`email_520` | **20 / 20** |

The one miss is **`email_499`**: its BL PDF is truncated (`Unexpected EOF`), so it can't be opened and goes to a person as `unreadable`, where the ground truth expects a gross-weight mismatch. Sending an unopenable file to a person is the intended behaviour; it still counts as wrong against the answer key.

The dataset's 46 mismatches are spread over the fields as: container count 19, port of discharge 13, gross weight 12, notify party 8, consignee 7, shipper 7, port of loading 6.

**How to read this.** The label classifier and the cleaning rules were developed against these documents, so this shows the system does the job on the data provided rather than how it does on formats it has never seen. New label wordings are handled by `find_new_labels.py` and retraining; see [Limitations](#limitations).

### Reproduce it

The whole-dataset check is a short script in the [root README](../README.md#check-it-yourself). For this project alone, from this directory:

```bash
python src/main.py                      # demo: 9 pairs, one of each outcome, saved to output/demo_results.json
python src/main.py --all data/demo_docs # the same pairs, one line each
```

The demo gives 2 `OK`, 3 `MISMATCH`, and one `NEEDS_REVIEW` for each reason: a missing value (`email_516`), the wrong document type (`email_503`, a certificate of origin in the BL slot), an unreadable scan (`email_513`) and a missing attachment (`email_506`). `email_004` is the clearest mismatch: consignee and notify party differ.

`evaluate.py` scores against the ground truth, but reads its pairs from `data/sample_docs/`, which is git-ignored here. Copy the sample pairs from the repository root first:

```bash
cp -r ../data/sample_docs data/sample_docs
python src/evaluate.py                  # add --quiet to hide the per-pair disagreements
```

On those 119 pairs it reports 118 correct (99.2%). Its two disagreements are `email_499` (above) and `email_518`, whose SI file is missing from that folder although it exists in the full attachment set, so it reads as a missing attachment instead of a missing value. The other 117 pairs agree, and the whole-dataset run above is the fuller check.

## How the comparison works

1. **Checks the files.** Both must be present, readable (not corrupt, empty or a scanned image) and the right kind of document (an SI and a BL, not an invoice or packing list).
2. **Extracts the fields** from `.txt`, `.pdf`, `.xlsx` or `.docx` files. A small trained classifier maps each raw label to a standard field, so "Load Port", "POL" and "Port of Loading" all mean the same thing. It also handles bilingual labels such as `Gross Weight毛重(KGS)`. It knows 14 fields; the 7 above are compared and the other 7 (vessel/voyage, commodity, HS code, BL number, booking no., freight, OC number) are extracted but not.
3. **Cleans the values** so formatting doesn't cause false alarms: case, punctuation, thousands separators, units and port codes like `(CNNTG)`.
4. **Compares** the seven fields and gives the verdict above.

Machine learning is used only to decide which field a label means. Everything else is plain, explainable code, so every verdict can be traced to the values that caused it.

## How the website uses it

- **`GET /emails/{id}`** on the gateway runs `analyze_pair()` for a seeded `BL_COMPARISON` email whose SI and BL are on disk.
- **`POST /compare`** takes an SI and a BL as uploads, so a real Gmail message's attachments get the same comparison. The files are written to a temp folder that is deleted when the request ends.
- **`analyze_pair(si_path, bl_path)`** in `src/main.py` is the one entry point; a path of `None` means that attachment was never received.
- The gateway maps the field names to the website's (`container_count` becomes `containers`, and so on) in `backend/assemble.py`.

The website also carries a TypeScript copy of the comparison rules in `../src/lib/demo/compare.ts`, used by the demo account and as the fallback when the gateway is not running. It mirrors `compare.py`: same seven fields, same cleaning, same verdicts. **Change one, change the other.**

## Limitations

- Container tables are read as flat text, so a table header can be mistaken for a value. Such fields end up `unsure` rather than wrongly matched.
- Scanned PDFs go to a person as `unreadable`. OCR would fix this. A truncated PDF is treated the same way (`email_499`).
- Only the seven listed fields are compared; a difference in, say, the vessel or HS code is not flagged.
- Labels the classifier has never seen are set aside for review (below a 0.20 confidence threshold) rather than guessed. Run `find_new_labels.py` on new documents to list them, then add them to the training data.
- Pairing is by file name in the demo and the batch runner. On real Gmail the website works out which attachment is the SI and which the BL from their contents, and only compares a message with exactly one of each.

---

## Reference

### Setup

From the repository root, one environment covers both ML projects and the gateway:

```bash
py -3.13 -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt
```

`sdoc_comparator/requirements.txt` still works if you only want this project. There is no training step on a fresh clone: `models/label_classifier.joblib` is committed. Retrain only after editing `data/label_training_data.csv`:

```bash
python src/train_label_classifier.py
```

### Commands

Run from this directory (`sdoc_comparator/`):

```bash
python src/main.py                                # demo on data/demo_docs
python src/main.py path/to/SI.txt path/to/BL.txt  # one pair
python src/main.py --all path/to/folder           # every *_SI.* / *_BL.* pair in a folder
python src/evaluate.py                            # score against data/ground_truth.json
python src/find_new_labels.py path/to/new_docs    # list labels the classifier doesn't know yet
```

`find_new_labels.py` scans a folder of new documents, prints each unfamiliar label with the classifier's best guess and writes `data/candidate_labels.csv` for review. Check every row, add the good ones to `data/label_training_data.csv`, then retrain.

### Layout

```
src/
  main.py                    entry point (analyze_pair) and the CLI
  extractor.py               file reading, label classification, field extraction
  compare.py                 value cleaning, field comparison, report text
  label_vocab.py             the fields and review reasons
  train_label_classifier.py  trains the label classifier
  find_new_labels.py         lists unfamiliar labels in new documents
  evaluate.py                scores the pipeline against ground truth
data/
  demo_docs/                 pairs used by the demo
  label_training_data.csv    label examples the classifier learns from
  candidate_labels.csv       output of find_new_labels.py, for review
  ground_truth.json          expected verdicts, read only by evaluate.py
  sample_docs/               evaluation pairs (git-ignored; see Reproduce it)
models/                      label_classifier.joblib (committed)
output/                      demo results (created by the demo, git-ignored)
```

Both saved models are loaded by module name (this one needs `label_vocab`), so `src/` keeps flat imports and the gateway puts it on `sys.path`. Turning it into a package would stop the model from loading.
