# sdoc_classifier — email category classification

Stage 1 of the SDOC pipeline: classify each inbox email as `BL_COMPARISON`,
`SI_REQUEST`, `INVOICE_QUERY`, `GENERAL` or `SPAM`. The other submission
fields are written as defaults for the later comparison stage.

## Setup

```bash
py -3.13 -m venv ../.venv
../.venv/Scripts/python -m pip install -r requirements.txt
```

Copy the dataset into `data/` (not committed):

```
data/inbox/email_001.json … email_520.json
data/ground_truth.json
```

or set `SDOC_DATA_DIR` to point at another dataset directory (e.g. a fresh
generator draw).

## Run (from this directory)

```bash
python -m pytest                  # cleaning + feature tests
python -m src.train               # 5-fold CV report, out/errors.json, fit + save models/classifier.joblib
python -m src.predict             # out/submission.json + out/predictions.json (confidence, source)
python -m src.evaluate            # CV only, no model saved   (--model svc to compare LinearSVC)
python -m src.evaluate --predictions out/predictions.json   # score a prediction file vs ground truth
python -m src.evaluate --labelled extra_data/test_handwritten.json   # saved model on the held-out hand-written set
python -m src.predict --inbox my_emails --out my_emails_out --show  # classify your own emails, one line each
```

## Hand-written emails (`extra_data/`)

The generated emails come from a few fixed templates. A model trained only
on them scored 16/30 on hand-written emails, and 0/6 on SI requests, because
it had learned template shortcuts such as "SI requests always come from an
internal sender".

- `train_handwritten.json`: 80 varied labelled emails, 16 per category, added to training
  with sample weight `HANDWRITTEN_WEIGHT` (5).
- `test_handwritten.json`: 30 *different* labelled emails, never trained on. Only
  ever scored, never tuned against.

To add more, append records with a `"category"` field and an `email_id` starting
with `hw_` to the train file, then re-run `python -m src.train`.

## Layers

1. **Cleaning** (`cleaning.py`) — security banner, quoted thread, signature,
   greeting/courtesy removed; `RE_`/`FW_`/`[EXTERNAL]` stripped from subjects.
2. **Model** (`pipeline.py`) — TF-IDF over subject (1–3-grams) and body
   (1–2-grams) plus engineered flags (`features.py`, `patterns.py`) into a
   balanced LogisticRegression.
3. **Rule** (`rules.py`) — an SI + BL attachment pair forces `BL_COMPARISON`.
   Rule/model disagreements are printed as a health metric.

## Notes on deviations from the plan

- **Coded BL subjects**: the first field is a department code drawn from
  several values (`AIE`, `AFPTME`, `AFRT`, `AFEMY`), not just `AIE`. The
  discriminator (`patterns.coded_subject_kind`) matches the *shape* — a single
  2–8 letter upper-case token leading ≥5 ` - `-delimited fields — and emits
  `coded_prefix_dept` / `coded_prefix_si`.
- **Signature cut**: SI_REQUEST bodies embed consignee addresses containing
  `P.O. BOX` and `TEL:`. Those markers only end the body when a sign-off line
  sits just above them; `DID :` / `Website :` / `Shipping Documentation` cut
  unconditionally.
- **Subject patterns** are matched with `_` turned into spaces, since `\b` does
  not fire inside `_Reminder_` or `_RPA_`.
- `body_len` is log-scaled and flags pass through `MaxAbsScaler` so counts
  sit on the same scale as TF-IDF columns.
