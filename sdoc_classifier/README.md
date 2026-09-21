# sdoc_classifier — email category classification

**Stage 1 of the pipeline.** Reads each inbox email and decides which of the five categories it belongs to, so the right emails move on to the SI-vs-BL check and the rest are filed.

| Category | What the email is about | In the dataset |
|---|---|---|
| `BL_COMPARISON` | Check a draft bill of lading (BL) against the shipping instruction (SI) | 220 / 520 |
| `SI_REQUEST` | Someone asks for an SI to be prepared, issued or submitted | 125 / 520 |
| `INVOICE_QUERY` | Billing, charges, credit notes, payment, missing GR | 75 / 520 |
| `GENERAL` | Operational notices, reports, HR/office news, automated bot messages | 60 / 520 |
| `SPAM` | Phishing, prize/parcel scams, marketing | 40 / 520 |

It is one half of the ML side of WayBoxAI. The other half, [`../sdoc_comparator/`](../sdoc_comparator/README.md), compares the SI and BL of the emails this model sends to `BL_COMPARISON`. The [root README](../README.md) covers the whole system. How and why each step works is in [WORKFLOW.md](WORKFLOW.md).

## Results

Scored against `data/ground_truth.json`, the file the organisers supplied. These were re-measured for this README.

| Test | Score |
|---|---|
| All 520 emails, saved model | **520 / 520** (macro-F1 1.000) |
| 5-fold cross-validation on the 500 training emails (out-of-fold, so each email is scored by a model that never saw it) | **500 / 500** |
| The 20 edge cases `email_501`–`email_520`, never trained on | **20 / 20** |

Every category is fully correct. The SI + BL attachment rule decides 124 of the 520 emails; the model decides the other 396, and the rule never disagrees with it, so the model has learned that pattern itself.

**What this does and does not show.** The dataset was generated from a small set of templates, and the model learned some of their shortcuts (for example, that SI requests come from an internal sender). A perfect score therefore shows the system does the task on the data provided, not that it reads arbitrary mail well. See [Limits on real mail](#limits-on-real-mail).

## Reproduce it

From the repository root, install once:

```bash
py -3.13 -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt
```

Then, from this directory (`sdoc_classifier/`):

```bash
python -m pytest              # 25 tests: cleaning and features
python -m src.evaluate        # 5-fold cross-validation report and confusion matrix; nothing is saved
python -m src.predict         # classify data/inbox -> out/submission.json + out/predictions.json
python -m src.evaluate --predictions out/predictions.json   # score that file against ground truth
```

Everything needed is committed: `data/inbox/` (the 520 emails), `data/ground_truth.json` and `models/classifier.joblib`. Set `SDOC_DATA_DIR` to point at another dataset with the same layout, for example a fresh generator draw, to see how it does on unseen data.

**The submission file.** `out/submission.json` uses the organisers' format: one entry per email with `category`, `status`, `review_reason`, `defect_fields` and `has_defect`. This stage fills in only `category`; the other four are left at their defaults (`""`, `null`, `[]`, `false`) for the comparison stage. `out/predictions.json` carries the same plus `confidence`, `source` and `model_category`, for inspection.

## How it decides

1. **Cleaning** — the security banner, quoted thread, signature and greeting are removed, and `RE_`/`FW_`/`[EXTERNAL]` are stripped from subjects, so the model sees the message itself.
2. **Model** — TF-IDF over the subject (1–3-word phrases) and body (1–2-word phrases), plus engineered flags such as attachment names, sender domain and keyword hits, into a balanced logistic regression. It outputs a probability for each category; the highest is the prediction and its value is the **confidence**.
3. **Rule** — an SI + BL attachment pair forces `BL_COMPARISON` with confidence 1.0. This follows from the dataset's own documentation (only BL_COMPARISON emails carry attachments), so it is a stated fact of the data, not a heuristic.

Supervised learning was chosen over hand-written rules because the organisers supplied 500 labelled emails, the model weighs the clues instead of a person guessing, and it is one system to debug. A calibrated LinearSVC was also tested and scored the same, so the simpler model was kept.

## Training data

The model trains on `email_001`–`email_500` only. `email_501`–`email_520` are attachment edge cases that are predicted but never trained on, which is what makes the 20 / 20 above a held-out result.

To add real or varied emails, create `extra_data/train_handwritten.json` (the folder isn't in the repo) holding records with a `"category"` field and an `email_id` starting with `hw_`, then re-run `python -m src.train`. If the file exists it is added to training with sample weight 5 (`HANDWRITTEN_WEIGHT`), so a few varied examples are not outvoted by 500 templated ones; if not, it is skipped. `extra_data/test_handwritten.json` is the matching held-out set: it is only ever scored (`--labelled`), never trained on.

## Limits on real mail

The model is trained on 520 generated emails, and several of the clues it learned do not occur in a real inbox: an internal `aprilasia.com` sender, an SI+BL attachment pair, the coded subject formats. Expect most ordinary mail to land in `GENERAL` or `SPAM`. In an early test, a customer email reading *"Kindly raise the SI for booking 88123"* was classified as spam for exactly this reason.

`LOW_CONFIDENCE_THRESHOLD` (0.55, in `config.py`) is used by the **gateway**, not by this package: for `POST /classify` it reports `GENERAL` instead of a low-confidence guess, keeping the model's answer in `model_category`. `predict` only lists the low-confidence emails; it does not change them. No LLM fallback is built, although `source` has room for one.

The real fix is more varied training data: label real mail into `extra_data/train_handwritten.json` and retrain.

## How the website uses it

The FastAPI gateway in [`../backend/`](../backend/app.py) loads `models/classifier.joblib` and serves it two ways: `GET /emails` and `GET /emails/{id}` classify the seeded 520-email inbox, and `POST /classify` classifies one message, which is how a real Gmail inbox gets its categories.

**Retrain from this directory.** The saved model refers to its code by module name (`src.pipeline`), and the gateway puts this directory on `sys.path` so it can load it. Running `python -m src.train` here produces a model that loads the same way; training from elsewhere, or moving `src/` into a package, would not.

---

## Reference

### Commands

Run from this directory, with the Python from your environment:

```bash
python -m pytest                                  # 25 tests
python -m src.train                               # 5-fold CV report, then fit on everything and save models/classifier.joblib
python -m src.predict                             # classify the inbox
python -m src.evaluate                            # CV only; nothing is saved
python -m src.evaluate --predictions out/predictions.json   # score a prediction file against ground truth
python -m src.evaluate --labelled <file.json>     # score the saved model on any labelled file
python -m src.predict --inbox my_emails --out my_emails_out --show   # classify your own emails, one line each
```

| Flag | On | Effect |
|------|----|--------|
| `--model svc` | `train`, `evaluate` | Use a calibrated LinearSVC instead of logistic regression (`logreg`, the default). |
| `--no-handwritten` | `train`, `evaluate` | Train on the generated emails only, ignoring `extra_data/`. |
| `--inbox DIR`, `--model PATH`, `--out DIR` | `predict` | Read a different inbox, load a different model, write elsewhere. |
| `--show` | `predict` | Print one line per email: id, category, confidence, source. |

Output goes to `out/` (git-ignored): `submission.json`, `predictions.json`, `errors.json` (the emails cross-validation got wrong) and `cv_report.json`.

`predict.classify()` returns a `Prediction` per email: `category`, `confidence` (0–1), `source` (`model`, `rule` or `error`) and `model_category` (what the model said before any rule override).

### Layout

```
src/
  config.py       paths, category list, thresholds (LOW_CONFIDENCE_THRESHOLD, HANDWRITTEN_WEIGHT, ...)
  schema.py       EmailRecord -> CleanedEmail -> Features -> Prediction
  loading.py      inbox JSON -> EmailRecord, ground truth, labelled files
  cleaning.py     step 1
  patterns.py     regexes and the coded-subject detector
  features.py     cleaned text + flag dictionary
  pipeline.py     the sklearn pipeline (logreg or calibrated LinearSVC)
  rules.py        step 3
  train.py        cross-validate, fit, save
  predict.py      classify() and the CLI
  evaluate.py     CV, confusion matrix, per-class scores, scoring files
tests/            cleaning and feature tests
data/             inbox/ (520 emails) and ground_truth.json
models/           classifier.joblib
out/              run output (git-ignored)
```

### Notes on deviations from the plan

- **Coded BL subjects**: the first field is a department code drawn from several values (`AIE`, `AFPTME`, `AFRT`, `AFEMY`), not just `AIE`. The discriminator (`patterns.coded_subject_kind`) matches the *shape* — a single 2–8 letter upper-case token leading ≥5 ` - `-delimited fields — and emits `coded_prefix_dept` / `coded_prefix_si`.
- **Signature cut**: SI_REQUEST bodies embed consignee addresses containing `P.O. BOX` and `TEL:`. Those markers only end the body when a sign-off line sits just above them; `DID :` / `Website :` / `Shipping Documentation` cut unconditionally.
- **Subject patterns** are matched with `_` turned into spaces, since `\b` does not fire inside `_Reminder_` or `_RPA_`.
- `body_len` is log-scaled and flags pass through `MaxAbsScaler` so counts sit on the same scale as TF-IDF columns.
