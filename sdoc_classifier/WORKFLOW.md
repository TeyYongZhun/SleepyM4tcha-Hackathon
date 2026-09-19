# Email classification: how it works

Stage 1 of the SDOC pipeline sorts every incoming shipping-documentation email
into one of five categories, so that the right emails move on to the
SI-versus-BL comparison stage.

| Category | What the email is about | Share of dataset |
|---|---|---|
| `BL_COMPARISON` | Check a draft bill of lading (BL) against the shipping instruction (SI) | 220 / 520 |
| `SI_REQUEST` | Someone asks for a shipping instruction to be prepared, issued or submitted | 125 / 520 |
| `INVOICE_QUERY` | Billing, charges, credit notes, payment, missing GR | 75 / 520 |
| `GENERAL` | Operational notices, reports, HR/office news, automated bot messages | 60 / 520 |
| `SPAM` | Phishing, prize/parcel scams, marketing | 40 / 520 |

**Result:** 520/520 on the organiser's dataset and 500/500 in 5-fold
cross-validation. Details are in [Results](#results).

---

## 1. Workflow at a glance

```
 inbox/email_XXX.json
        │
        ▼
 ┌─────────────┐   ┌──────────────┐   ┌───────────────────────┐   ┌──────────────────────┐   ┌────────────┐
 │ 1. Load     │──▶│ 2. Clean     │──▶│ 3. Extract features   │──▶│ 4. ML model          │──▶│ 5. Rule    │──▶ submission.json
 │ JSON → rec. │   │ strip noise  │   │ TF-IDF + signal flags │   │ Logistic Regression  │   │ override   │    predictions.json
 └─────────────┘   └──────────────┘   └───────────────────────┘   └──────────────────────┘   └────────────┘
   loading.py        cleaning.py        features.py, patterns.py     pipeline.py, train.py      rules.py
```

Each stage passes a typed object to the next
(`EmailRecord → CleanedEmail → Features → Prediction`, defined in
`src/schema.py`), so no stage reaches back into the raw JSON.

We chose **supervised machine learning** over hand-written rules for three
reasons:

- The organiser supplied 500 labelled emails, which is enough to learn from.
- The model decides how much each clue matters, rather than a person guessing.
- It is one system to debug, not hundreds of competing `if` statements.

---

## 2. Step 1 and 2: loading and cleaning

Real emails are mostly wrapping. Cleaning removes on average **about 50% of
each body**, so the model sees the message itself rather than boilerplate.

| Step | What gets removed | Why it matters |
|---|---|---|
| Security banner | `WARNING: This email originated outside of our organisation…` | Appears on every external email whatever its category, so it is noise. Only removed if real content follows it. |
| Quoted thread | Everything after `____`, `-----Original Message-----`, `From:…Sent:` or `On … wrote:` | Older messages in a reply chain can belong to a different topic. |
| Signature | `Best Regards, Name, DID : …, P.O. Box …, Website : …` | Identical on every staff email. |
| Greeting / courtesy | `Hi X,`, `Dear Team,`, trailing `Thank you.` | Carries no category information. |
| Subject prefixes | `RE_`, `FW_`, `FWD:`, `[EXTERNAL]` | Kept separately as an `is_reply` flag. |

Two traps we found in the data and guard against, each with a regression test in
`tests/test_cleaning.py`:

- **SI emails contain addresses with `P.O. BOX` and `TEL:`.** A naive
  signature cutter would delete the consignee details. We therefore only treat
  those markers as a signature when a sign-off line such as "Best Regards"
  sits just above them.
- **One-line emails that say "do not click".** The banner remover never
  deletes the only block of an email.

---

## 3. Step 3: features, the clues the model sees

Each email becomes about 2,900 numeric features from three sources.

### 3a. TF-IDF text features

TF-IDF converts text into word and phrase weights. Words that are frequent in
this email but rare across the inbox score high.

- **Subject: 1 to 3-word phrases.** Subjects carry the strongest signal, and
  key phrases such as `TO CONFIRM DOCS` are three words long.
- **Body: 1 to 2-word phrases.**
- `sublinear_tf` damps repeated words, which matters because templated emails
  repeat themselves.

### 3b. Keyword pattern signals (`src/patterns.py`)

A table of regular expressions per category, with subject and body kept
separate. They are **features, not rules**: each email gets a count of hits per
category (`subject_hit_SPAM = 2`, and so on), and the model decides how much
each count is worth.

### 3c. Engineered flags

| Flag | Meaning |
|---|---|
| `coded_prefix_dept` / `coded_prefix_si` | The coded-subject discriminator (see section 5) |
| `n_attachments`, `has_si_file`, `has_bl_file`, `has_doc_pair` | Attachment filenames. Only BL_COMPARISON emails carry SI + BL pairs. |
| `body_claims_attachment` | Body says "attached" or "enclosed" |
| `is_reply`, `is_external`, `has_quoted_thread` | Thread and gateway context |
| `sender_is_internal` | Sender domain is `aprilasia.com` |
| `body_len_log`, `subject_field_count` | Shape of the email |

All flags are scaled to the same 0–1 range as the TF-IDF columns so that no
single raw count dominates.

---

## 4. Step 4 and 5: model and rule

**Model:** `LogisticRegression(class_weight="balanced")`. It is a linear model:
it learns one weight per feature per category, adds up the weights for an
email, and turns the totals into five probabilities. The highest probability
wins, and that probability is the model's **confidence**.

- *Why logistic regression:* it is fast, works well on text with a few
  hundred examples, gives calibrated probabilities, and its weights can be read
  (see section 5).
- *Why `balanced`:* SPAM is only 8% of the data. Balancing stops the model
  from ignoring the small classes.
- We also tested a calibrated LinearSVC. It scored the same, so we kept the
  simpler model.

**Rule override (`src/rules.py`):** exactly one. If an email carries **both an
SI file and a BL file**, it is `BL_COMPARISON`. This comes straight from the
dataset documentation ("only BL_COMPARISON emails carry attachments"), so it
outranks the model. Every case where the rule and the model disagree is
logged. The count is **0**, which means the model learned this fact on its own.

---

## 5. How each of the five categories is recognised

These are the features with the **highest learned weights** in the trained
model (`subject:` and `body:` are TF-IDF phrases, `flags:` are engineered
features), alongside the human-readable clues behind them.

### `BL_COMPARISON`: "check this BL against the SI"
- **Subject templates:** `TO CONFIRM DOCS`, `REQUEST BL DRAFT`, `Draft BL … amend BL`, and the coded format `AIE - POD - CARRIER(BL#) - OC - INV - CUSTOMER - TERM`
- **Body language:** "attached are the SI and draft BL", "verify the BL matches", "compare the SI and draft BL", "check the details and confirm"
- **Attachments:** an SI + BL file pair triggers the rule
- **Top learned features:** `subject:bl` · `subject_hit_BL_COMPARISON` · `body_hit_BL_COMPARISON` · `has_bl_file` · `subject:check` · `subject:draft`

### `SI_REQUEST`: "please prepare / issue / submit the SI"
- **Subject templates:** `SI - <bl> - DIRECT(<carrier>) - …`, `CUST SI`, `REQUEST SI`, `SI NEEDED`
- **Body language:** "raise / issue / prepare the SI", "SI for booking", and SI details typed into the body (`POL:`, `POD:`, `Notify Party:`, `Description of Goods`, `H.S. CODE`)
- **Top learned features:** `body_hit_SI_REQUEST` · `subject:si` · `subject:booking` · `subject:shipping instruction` · `body:prepare`

### `INVOICE_QUERY`: money
- **Subject templates:** `BILLING … MISSING GR`, `CANCEL INVOICE`, `LOCAL CHARGES`, `D & D charges`, `Total Freight`, `TELEX RELEASE`
- **Body language:** invoice, THC, charges, breakdown, credit note, billed, GR, PGI, detention, payment
- **Top learned features:** `body_hit_INVOICE_QUERY` (the strongest single weight in the model) · `subject:invoice` · `subject:payment` · `subject:charges` · `subject:freight`

### `GENERAL`: notices and internal news
- **Subject templates:** `UPDATE SUMMARY`, `Berthing Report`, `_Reminder_`, `_RPA_` bot notices, `Outstanding BL`, `Pending BL Release`, holiday and time-off messages
- **Body language:** "automated notification", "no action required", berthing, vessel schedule, office resumes, new year
- **Top learned features:** `body_hit_GENERAL` · `body_claims_attachment` ("please find attached the report") · `subject:office` · `sender_is_internal`

### `SPAM`: scams and marketing
- **Subject signals:** won, prize, claim, gift card, parcel on hold, mailbox full, verify your account, URGENT, `90% OFF`, bank details, bitcoin
- **Body signals:** "click here", "claim your", "within 24 hours", "wire transfer", raw `http://` links
- **Top learned features:** `body_hit_SPAM` · `subject_hit_SPAM` · `subject:today` · `body:your` · `body:password` · `body:http`

### The hard pairs and how they are separated

| Confusable pair | Why it is hard | What separates them |
|---|---|---|
| BL_COMPARISON ↔ SI_REQUEST | Both are full of "SI", "BL", booking and OC numbers | **Direction of work.** BL_COMPARISON *checks* an existing BL; SI_REQUEST *asks for* an SI. The coded-subject discriminator (below) and the SI + BL attachment rule settle most cases. |
| GENERAL ↔ SPAM | Both are unsolicited, one-way messages | Phishing vocabulary (verify, claim, links), plus sender and signature context |
| INVOICE_QUERY ↔ SPAM | Invoice-payment phishing ("confirm your bank details") | Spam wording and the sender domain outweigh the word "invoice" |

**Coded-subject discriminator.** Both coded subject formats look alike
(`X - … - … - … - …`). The first field decides: `SI` means SI_REQUEST, and a
short upper-case department code means BL_COMPARISON. The plan assumed that
code is always `AIE`, but the generator also uses `AFPTME`, `AFRT` and
`AFEMY`. Matching only `AIE` would have missed about 75% of coded BL subjects,
so we match the *shape* of the field instead. It fired 71 times, all on
BL_COMPARISON, and 45 times, all on SI_REQUEST.

---

## 6. Results

The model is trained on `email_001` to `email_500` only. The 20 attachment
edge cases (`email_501` to `email_520`) are predicted but never trained on.

| Test | Score |
|---|---|
| Organiser dataset, 520 emails | **520/520** |
| 5-fold cross-validation, generated emails | **500/500** |
| Official organiser scorer, Stage 1 macro-F1 | **1.000** |

The official final score is 0.30 because classification is worth 30%. The other
70% comes from the defect-comparison stage, which is out of scope here.

---

## 7. Known limitations and next steps

- **The training emails come from a few fixed templates.** A 100% score on
  them does not prove the model can read real email. In an early test, a
  customer email reading *"Kindly raise the SI for booking 88123"* was
  classified as **SPAM**: in the generated data every SI request comes from an
  internal sender and every spam from an external one, so "external sender"
  had become a spam clue.
- **Add real labelled emails before going live.** Collect and label a sample
  of real messages, put them in a JSON file at
  `extra_data/train_handwritten.json` (each record with a `"category"` and an
  `email_id` starting with `hw_`), and re-run `python -m src.train`. The
  training code picks the file up automatically and counts each of those
  emails 5 times (`HANDWRITTEN_WEIGHT`) so the 500 template emails don't
  outvote them. Keep a separate labelled set that is never trained on, and
  score it with `python -m src.evaluate --labelled <file>`.
- **Planned: a small LLM for low-confidence emails.** When the model's
  confidence is below 0.55, a small LLM re-classifies the email. For real
  company email, a **local model** (for example via Ollama) keeps email
  content on our own machine and costs nothing; a cloud API such as Claude
  Haiku is more accurate but sends email text to an outside service and is
  paid per use.

---

## 8. Running it

From `sdoc_classifier/`, with the project's virtual environment:

```powershell
..\.venv\Scripts\python.exe -m pytest                     # 25 tests
..\.venv\Scripts\python.exe -m src.train                  # cross-validate, fit, save models/classifier.joblib
..\.venv\Scripts\python.exe -m src.predict                # classify data/inbox -> out/submission.json
..\.venv\Scripts\python.exe -m src.predict --inbox my_emails --out my_emails_out --show  # try your own emails
```

## 9. Code map

| File | Role |
|---|---|
| `src/config.py` | Paths, category list, thresholds, weight for optional extra training emails |
| `src/schema.py` | Data contracts: `EmailRecord`, `CleanedEmail`, `Features`, `Prediction` |
| `src/loading.py` | Inbox JSON, ground truth and labelled files → records |
| `src/cleaning.py` | Banner, thread, signature and greeting removal |
| `src/patterns.py` | Keyword tables and the coded-subject discriminator |
| `src/features.py` | Record → cleaned text + flag dictionary |
| `src/pipeline.py` | TF-IDF + flags + Logistic Regression |
| `src/rules.py` | SI + BL attachment override and disagreement counter |
| `src/train.py` | Cross-validation, final fit, save model |
| `src/predict.py` | Classify an inbox, write submission, fault-tolerant per email |
| `src/evaluate.py` | Reports, confusion matrix, error dump, scoring files |
| `tests/` | Cleaning and feature regression tests |
