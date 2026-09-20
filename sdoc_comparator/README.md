# SI/BL Document Comparison

Compares a Shipping Instruction (SI) against a draft Bill of Lading (BL) and flags the fields that don't agree, so a person only has to look at the pairs that need it.

## How the comparison works

For each SI/BL pair, the pipeline:

1. **Checks the files.** Both must be present, readable (not corrupt, empty or a scanned image) and the right kind of document (an SI and a BL, not an invoice or packing list).
2. **Extracts the fields** from `.txt`, `.pdf`, `.xlsx` or `.docx` files. A small trained classifier maps each raw label to a standard field, so "Load Port", "POL" and "Port of Loading" all mean the same thing. It also handles bilingual labels such as `Gross Weight毛重(KGS)`.
3. **Cleans the values** so formatting doesn't cause false alarms: case, punctuation, thousands separators, units and port codes like `(CNNTG)`.
4. **Compares seven fields:** shipper, consignee, notify party, port of loading, port of discharge, container count and gross weight.

Each field is marked `match`, `mismatch`, or `unsure` (blank or a placeholder such as `TBA` or `N/A` on either side). The pair then gets one verdict:

| Verdict | When |
|---------|------|
| `OK` | All seven fields match. |
| `MISMATCH` | At least one field differs, and none are unsure. The report lists SI vs BL for each. |
| `NEEDS_REVIEW` | A person is needed. The reason is one of `missing_attachment`, `unreadable`, `wrong_doc_type` or `missing_value`. |

Machine learning is used only to decide which field a label means. Everything else is plain, explainable code.

For the full flow, a diagram and a map of the code, see [WORKFLOW.md](WORKFLOW.md).

## Setup

```bash
python -m venv venv
venv\Scripts\activate            # Mac/Linux: source venv/bin/activate
pip install -r requirements.txt
python src/train_label_classifier.py
```

Training builds `models/label_classifier.joblib`, which isn't stored in git. Run it once after cloning, and again after editing `data/label_training_data.csv`.

## Running it

```bash
python src/main.py                                # demo on data/demo_docs, saved to output/demo_results.json
python src/main.py path/to/SI.txt path/to/BL.txt  # one pair
python src/main.py --all path/to/folder           # every *_SI.* / *_BL.* pair in a folder
python src/evaluate.py                            # score against data/ground_truth.json
```

The demo covers each outcome: a clean match, a mismatch, a missing value, the wrong document type, an unreadable scan and a missing attachment.

## Layout

```
src/
  main.py                    entry point and per-pair flow
  extractor.py               file reading, label classification, field extraction
  compare.py                 value cleaning, field comparison, report text
  label_vocab.py             the fields and review reasons
  train_label_classifier.py  trains the label classifier
  find_new_labels.py         lists unfamiliar labels in new documents
  evaluate.py                scores the pipeline against ground truth
data/
  demo_docs/                 pairs used by the demo
  label_training_data.csv    label examples the classifier learns from
  ground_truth.json          expected verdicts, read only by evaluate.py
models/                      trained classifier (created by training)
output/                      demo results (created by the demo)
```

## Known limitations

- Container tables are read as flat text, so a table header can be mistaken for a value. Such fields end up `unsure` rather than wrongly matched.
- Scanned PDFs go to a person as `unreadable`. OCR would fix this.
- Sorting incoming emails (comparison request, new SI, invoice query, spam) isn't built yet.
