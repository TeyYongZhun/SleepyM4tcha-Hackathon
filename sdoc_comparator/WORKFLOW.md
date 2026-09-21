# Pipeline Workflow

How one Shipping Instruction (SI) and draft Bill of Lading (BL) are compared.

**Input:** an SI and a BL attachment from the same email.
**Output:** a verdict of `OK`, `MISMATCH` or `NEEDS_REVIEW`, plus a text report.

**Design rule:** ML is used in one place only, to decide which field a raw label means (step 3). Everything else is deterministic code, so every verdict can be explained.

**In short, for the organisers:**

- **What it does:** takes the SI and draft BL of an email and returns `OK`, `MISMATCH` (with the fields that differ) or `NEEDS_REVIEW` (with a reason), using the same vocabulary as `ground_truth.json`.
- **How well:** 519 of 520 emails come out exactly right (verdict, review reason and defect fields); see [Results](#results).
- **Its stance:** when a pair can't be compared reliably (a file is missing, unreadable, the wrong document, or a value is blank) it escalates to a person with a stated reason instead of guessing.
- **Why it can be audited:** the only machine-learned step is deciding which field a raw label means. Everything after that is plain rules, so any verdict can be traced to the two values that caused it.

This is the second stage: [`../sdoc_classifier/`](../sdoc_classifier/WORKFLOW.md) decides which emails are `BL_COMPARISON`, and the FastAPI gateway in `../backend/` runs this comparison on them for the website (see [Where it is used](#where-it-is-used)). Setup and commands are in the [README](README.md).

---

## Flow

```mermaid
flowchart TD
    A[SI + BL attachments] --> B{0. Both received?}
    B -- no --> R1[NEEDS_REVIEW<br/>missing_attachment]
    B -- yes --> C{1. Readable?<br/>opens, not empty, has text layer}
    C -- no --> R2[NEEDS_REVIEW<br/>unreadable]
    C -- yes --> D{1b. Right document type?<br/>SI in SI slot, BL in BL slot}
    D -- no --> R3[NEEDS_REVIEW<br/>wrong_doc_type]
    D -- yes --> E[2. Extract text<br/>.txt / .pdf / .xlsx / .docx]
    E --> F[3. Classify labels into canonical fields<br/>TF-IDF + Logistic Regression]
    F --> G[4. Clean values<br/>case, punctuation, units, port codes]
    G --> H[5. Compare field by field]
    H --> I{Any field blank or<br/>placeholder on either side?}
    I -- yes --> R4[NEEDS_REVIEW<br/>missing_value]
    I -- no --> J{Any field differs?}
    J -- yes --> M[MISMATCH<br/>SI vs BL values listed]
    J -- no --> OK[OK<br/>No mismatch]
    R1 & R2 & R3 & R4 & M & OK --> S[6. Summary report]
```

## Steps

### 0. Both attachments present?
If either the SI or the BL was never received, the pair goes to a human as `missing_attachment`. Nothing else is attempted.

### 1. Readability check
A file is `unreadable` if it can't be opened (corrupted, password-protected, unsupported type), is empty, or is a scanned picture with no text layer. The comparison is skipped, because comparing against an empty extraction would produce a misleading "everything is missing" report.

### 1b. Document type check
The title (first few non-empty lines) must fit the slot: an SI in the SI slot, a BL in the BL slot. An invoice, packing list or certificate of origin is `wrong_doc_type`. A title that isn't recognised is not rejected.

### 2. Extract text
Text is read from `.txt`, `.pdf`, `.xlsx` or `.docx`, then split into `(label, value)` pairs. Two splitters are used: `Label: Value` lines, and a "glued" splitter for PDFs where the label and value run together.

### 3. Classify labels
Each raw label is mapped to a canonical field by the trained classifier, so "Load Port", "POL" and "Port of Loading" all become `port_of_loading`. The classifier knows 14 fields: the 7 that are compared, plus vessel/voyage, commodity, HS code, BL number, booking no., freight and OC number, which are extracted but not compared. Bilingual labels such as `Gross Weight毛重(KGS)` are split by script and each part is scored separately. Labels below the confidence threshold (0.20) are listed for review instead of being used.

When a label appears more than once (a header and a total line, for example), the first value that looks right is kept. Gross weight must look like a bare number plus unit, which stops a table header from being read as the value.

### 4. Clean values
Values are normalised so formatting noise doesn't cause false mismatches: case, punctuation, thousands separators, units, port codes such as `(CNNTG)`, and line-break separators between a name and its address.

### 5. Compare
Each of the 7 fields ends in exactly one state:

| State | Meaning |
|-------|---------|
| `match` | Both documents have the field and the cleaned values are identical. |
| `mismatch` | Both have it, but the values differ. |
| `unsure` | Blank or a placeholder (`TBA`, `N/A`, `____MT`) on one or both documents. |

**The 7 fields:** shipper, consignee, notify party, port of loading, port of discharge, container count, gross weight.

The pair verdict is then:

| Condition | Verdict |
|-----------|---------|
| Any field `unsure` | `NEEDS_REVIEW`, reason `missing_value` (takes priority even if other fields also mismatch) |
| Else any field `mismatch` | `MISMATCH` |
| Else | `OK` |

### 6. Report
- All match: `No mismatch.`
- Any mismatch: `Mismatch detected.` followed by `[Field] SI: ... | BL: ...` for each one.
- Any unsure: `Require Human Intervention. Reason: missing_value`, with `{empty}` on the side that is missing.
- Any escalation: the same header with the reason and a line per problem.
- A comparison that ran also ends with the full field-by-field table, and lists any labels the classifier wasn't confident about.

`analyze_pair` returns all of this as one dict, so callers can use what they need:

| Key | Holds |
|-----|-------|
| `status`, `reason` | The verdict, and the review reason (`None` unless `NEEDS_REVIEW`). |
| `report` | The text report above. |
| `details` | Short lines saying what is wrong (the unsure fields, or each escalation problem). |
| `rows` | One `{field, si_value, bl_value, status}` per compared field (empty when the pair was escalated before comparing). |
| `mismatch_fields`, `unsure_fields` | The canonical names of the fields in each state. |
| `low_conf` | `(label, confidence)` for labels below the threshold. |

## Review reasons

Every pair that needs a human says why. If several apply, the first in this order is the main reason and the rest are listed as details.

| Order | Reason | Cause |
|-------|--------|-------|
| 1 | `missing_attachment` | Only one of the SI / BL was received. |
| 2 | `unreadable` | Can't be opened, is empty, or is a scan with no text layer. |
| 3 | `wrong_doc_type` | Opened fine but isn't an SI / BL. |
| 4 | `missing_value` | A compared field is blank or a placeholder on either side. |

## Results

Run on the organisers' 520 emails through the gateway (each `BL_COMPARISON` email's real SI and BL), and compared with `data/ground_truth.json`:

| Measure | Result |
|---------|--------|
| Verdict, review reason and defect fields, all 520 emails | **519 / 520** exactly right |
| Mismatches found with exactly the right fields | **45 / 46** |
| Needs-review cases given the right reason (5 per reason) | **20 / 20** |
| `OK` emails left alone | **454 / 454** |
| Edge cases `email_501` to `email_520` | **20 / 20** |

The one miss is `email_499`. Its BL PDF is truncated (`Unexpected EOF`), so step 1 can't open it and the pair goes to a person as `unreadable`; the ground truth expects a gross-weight mismatch. That is the design working as intended (escalate, don't guess), and it still counts as wrong against the answer key.

The comparator's own `evaluate.py`, run on a 119-pair folder of samples, gives 118 correct. Its second disagreement is `email_518`, whose SI file is missing from that folder although it exists in the full attachment set.

These are results on the data the system was built against. The label classifier and the cleaning rules were developed on these documents, so treat the figures as showing that it does the job on the data supplied, not as a promise for formats it has not seen.

## Limitations

- **Scans and damaged files are not read.** A scanned PDF with no text layer, or a truncated one, is `unreadable` and goes to a person. OCR would fix scans.
- **Seven fields only.** A difference in the vessel, HS code or freight is not flagged, though those fields are extracted.
- **Tables are read as flat text**, so a container-table header can be mistaken for a value. Such fields end up `unsure` rather than wrongly matched.
- **New label wordings** below the 0.20 confidence threshold are set aside for review, not guessed. `find_new_labels.py` lists them so they can be added to the training data.

## Where it is used

`analyze_pair(si_path, bl_path)` in `src/main.py` is the one entry point; a path of `None` means that attachment was never received. Three things call it:

| Caller | How |
|--------|-----|
| The command line (`src/main.py`, `src/evaluate.py`) | Files on disk, paired by name (`email_004_SI.txt` with `email_004_BL.pdf`). |
| Gateway `GET /emails/{id}` | The SI and BL of a seeded `BL_COMPARISON` email, read from disk. If the email has no documents at all but its body says they are attached, the gateway itself reports `NEEDS_REVIEW` / `missing_attachment`; the comparator is not involved. |
| Gateway `POST /compare` | An SI and a BL uploaded from a real Gmail message. They are written to a temp folder, compared, and deleted when the request ends. |

The gateway turns the result into the website's shape in `backend/assemble.py`: it renames fields (`container_count` becomes `containers`, `gross_weight` stays `gross_weight`), and reports `defect_fields` only for a `MISMATCH`, since a `NEEDS_REVIEW` pair was never fully compared.

**The website has a TypeScript copy of steps 4 to 5** in `../src/lib/demo/compare.ts`. The demo account uses it, and so does real Gmail when the gateway isn't running. It mirrors `src/compare.py` (same seven fields, same cleaning, same verdicts), so a change to one has to be made in the other.

**The model is loaded by module name.** `models/label_classifier.joblib` refers to `label_vocab`, so `src/` keeps flat imports and the gateway puts it on `sys.path`. Turning it into a package would stop the model from loading.

## Running it

```bash
python src/main.py                                   # demo on bundled pairs
python src/main.py path/to/SI.txt path/to/BL.txt     # one pair
python src/main.py --all data/demo_docs              # every SI/BL pair in a folder
python src/evaluate.py                               # score against data/ground_truth.json
```

No training step is needed on a fresh clone: `models/label_classifier.joblib` is committed. Retrain it only after editing `data/label_training_data.csv`, with `python src/train_label_classifier.py`.

`evaluate.py` needs `data/sample_docs/`, which is git-ignored here; copy it from the repository root first (`cp -r ../data/sample_docs data/sample_docs`). On those 119 pairs, 118 verdicts agree with the ground truth. The README has the breakdown.

---

## Code map

Which file and function does each step of the flow.

| Step | File | Function / symbol |
|------|------|-------------------|
| Entry point, argument handling | `src/main.py` | `__main__` block, `run_pair`, `run_all`, `demo` |
| Orchestrates steps 0 to 6 for one pair | `src/main.py` | `analyze_pair` |
| Builds the `NEEDS_REVIEW` result | `src/main.py` | `_escalate` |
| Pairs `_SI` / `_BL` files by email id | `src/main.py` | `find_pairs` |
| Saves a pair's result in the ground-truth shape (demo output) | `src/main.py` | `result_to_json`, `DEMO_OUTPUT` |
| 0. Missing attachment | `src/main.py` | `analyze_pair` (checks for `None` paths) |
| 1. Readability check, 2. read text | `src/extractor.py` | `extract_text`, `_read_txt_text`, `_read_xlsx_text`, `_read_docx_text`, `_read_pdf_text`, `UnreadableFile` |
| 1b. Document type check | `src/extractor.py` | `detect_doc_type`, `DOC_TYPE_NAME` |
| 2. Split text into label/value pairs | `src/extractor.py` | `read_document_pairs`, `_text_to_pairs`, `_delimited_pairs`, `_glued_pairs`, `_anchor_pattern` |
| 3. Classify labels | `src/extractor.py` | `classify_label`, `_label_variants`, `_get_model`, `CONFIDENCE_THRESHOLD` |
| 3. Pick one value per field | `src/extractor.py` | `_pick_value`, `_VALUE_SHAPE` |
| 1 to 3 combined per document | `src/extractor.py` | `extract_fields` |
| 4. Clean values | `src/compare.py` | `clean_value`, `PLACEHOLDER`, `PORT_FIELDS` |
| 5. Field-by-field comparison | `src/compare.py` | `compare_documents` (states `MATCH`, `MISMATCH`, `UNSURE`) |
| 5. Pair verdict | `src/compare.py` | `pair_status` (verdicts `PAIR_OK`, `PAIR_MISMATCH`, `PAIR_REVIEW`) |
| 6. Report text | `src/compare.py` | `format_report`, `format_escalation` |
| The 7 fields, review reasons, display names | `src/label_vocab.py` | `COMPARISON_FIELDS`, `ALL_FIELDS`, `REVIEW_REASONS`, `DISPLAY_NAME` |
| Label normalisation (shared by training and prediction) | `src/label_vocab.py` | `normalize_label` |

### Supporting scripts (not part of the per-pair flow)

| File | Purpose |
|------|---------|
| `src/train_label_classifier.py` | Trains the label classifier from `data/label_training_data.csv` and saves `models/label_classifier.joblib`. |
| `src/find_new_labels.py` | Scans a folder for unfamiliar labels and writes `data/candidate_labels.csv` for review. |
| `src/evaluate.py` | Runs the pipeline on `data/sample_docs` and scores it against `data/ground_truth.json`. |

### Data and model files

| Path | Role |
|------|------|
| `data/label_training_data.csv` | `(label_text, canonical_field)` training examples for the classifier. |
| `data/candidate_labels.csv` | Output of `find_new_labels.py`, to be reviewed and merged into the training data. |
| `data/ground_truth.json` | Expected verdicts per email. Read only by `evaluate.py`, never by the pipeline. |
| `data/sample_docs/` | SI/BL sample pairs used for evaluation. Git-ignored here; copy from the repository root's `data/sample_docs`. |
| `data/demo_docs/` | Pairs used by the no-argument demo, covering each review reason. |
| `models/label_classifier.joblib` | Trained classifier. Committed, so it runs from a fresh clone; rebuild it only after editing the training data. |
| `output/demo_results.json` | Written by the demo. Git-ignored. |

### Where to change things

| To change... | Edit |
|--------------|------|
| Which fields are compared, or the review reasons | `src/label_vocab.py` |
| Which label maps to which field | `data/label_training_data.csv`, then retrain |
| How values are normalised | `src/compare.py` (`clean_value`) |
| How files are read or document types detected | `src/extractor.py` |
| Report wording | `src/compare.py` (`format_report`, `format_escalation`) |
| How the website shows a result, or the field names it uses | `../backend/assemble.py` |
| The comparison rules the demo and the Gmail fallback use | `../src/lib/demo/compare.ts` (keep in step with `src/compare.py`) |
