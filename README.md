<div align="center">

# WayBoxAI

**AI email triage for logistics.**

Built for the **Averis x Monash Hackathon 2026**

[Live demo](https://wayboxai.vercel.app) · [Run it locally](LOCAL.md) · [Deploy it](DEPLOYMENT.md)

</div>

---

Shipping teams spend their day on mail from carriers, forwarders and customs brokers, and a slip in a Shipping Instruction (SI) or Bill of Lading (BL) is costly. WayBoxAI does two jobs on that mail:

1. **Sorts every email** into one of five categories: BL Comparison, SI Request, Invoice Query, General or Spam.
2. **Checks the SI against the draft BL** on each BL Comparison email and says whether they match, where they differ, or why a person has to look.

The result is a three-pane inbox (list, email, AI summary) that a person can work through quickly. It runs on the organisers' 520-email dataset and, separately, on a real Gmail inbox.

## Results on the organisers' dataset

Scored against `sdoc_classifier/data/ground_truth.json`, the file the organisers supplied:

| What is measured | Result |
|---|---|
| **Stage 1 — category**, all 520 emails | **520 / 520** correct (macro-F1 1.000) |
| Category, 5-fold cross-validation on the 500 training emails | **500 / 500** |
| **Stage 2 — SI-vs-BL verdict** (status, review reason and defect fields), all 520 emails | **520 / 520** exactly right |
| Same, on the 20 edge cases `email_501`–`email_520` (never trained on) | 20 / 20 |

The dataset holds 454 `OK`, 46 `MISMATCH` and 20 `NEEDS_REVIEW` emails (five for each review reason). All 46 mismatches are found with exactly the right fields, all 20 review cases get the right reason, and all 454 `OK` emails are left alone.

**How to read these numbers.** The models were built and tuned on this dataset, so they show that the system does what the brief asks on the data provided, not how it will do on unseen mail. Section [Limitations](#limitations) says where it is weaker, and the [Classification on real mail](#classification-on-real-mail) note explains why a personal inbox does worse.

### Check it yourself

You can reproduce the Stage 2 numbers without opening the website. After [the one-time setup](LOCAL.md#one-time-setup), save this as `check.py` in the project root and run `.venv/Scripts/python.exe check.py`:

```python
import json, sys
sys.path.insert(0, ".")
from backend import app

truth = json.load(open("sdoc_classifier/data/ground_truth.json", encoding="utf-8"))
RENAME = {"containers": "container_count", "gross_weight": "gross_weight_kg"}   # website names -> ground-truth names
right = {"category": 0, "status": 0, "review_reason": 0, "defect_fields": 0, "all four": 0}
for email_id, want in truth.items():
    got = app.get_email(email_id)
    have = {
        "category": got["category"],
        "status": got.get("status") or "OK",      # emails with nothing to compare are OK
        "review_reason": got.get("review_reason"),
        "defect_fields": sorted(RENAME.get(f, f) for f in got.get("defect_fields", [])),
    }
    hits = {k: have[k] == (sorted(want[k]) if k == "defect_fields" else want[k]) for k in have}
    for k, ok in hits.items():
        right[k] += ok
    right["all four"] += all(hits.values())
    if not all(hits.values()):
        print("miss:", email_id, "expected", want["status"], want["review_reason"], want["defect_fields"], "got", have)
print(f"{len(truth)} emails:", right)
```

It prints `520 emails: {'category': 520, 'status': 520, 'review_reason': 520, 'defect_fields': 520, 'all four': 520}` and no misses. The category half alone can also be run with `python -m src.predict` and `python -m src.evaluate` in `sdoc_classifier/` (see its [README](sdoc_classifier/README.md)).

**On Windows, clone after `.gitattributes` was added.** Without it Git rewrites line endings inside the sample PDFs, which shifts the byte offsets they index themselves by, and readable documents start reporting as "couldn't be read". An older clone can be repaired with `git rm --cached -r . && git reset --hard`.

> **Exporting the submission file.** The **Export** button in the top bar (beside the notification bell) downloads `submission.json` in the organisers' format: one entry per email with `category`, `status`, `review_reason`, `defect_fields` and `has_defect`, built from what the app has worked out at that moment, so it can be scored straight away with the organisers' `score_cli.py` or `POST /submit`. What goes in depends on the inbox the account shows: the demo account exports the whole inbox it is showing (the bundled 520, or whatever was imported); with `BACKEND_API_URL` set the Python gateway builds it with the ML models (`GET /submission`, which compares every BL pair the first time); a real Gmail account exports its newest 1000 messages, keyed by Gmail message id, so that one is for eyeballing rather than scoring. (`python -m src.predict` also writes an `out/submission.json`, but it fills in only the category.)

## Try it

**Fastest — the demo, no Google account.** Put a random string in `.env.local` as `AUTH_SECRET`, run the website ([LOCAL.md](LOCAL.md)) and click **Try the demo**. It browses the 520 sample emails and needs no Python service. The [live deployment](https://wayboxai.vercel.app) has this ready to click.

**Best for judging — the organisers' inbox with the real models.** Run both processes with `BACKEND_API_URL=http://localhost:8000` set, then sign in (or use the demo). This is the version the results above describe.

**Your own Gmail.** Leave `BACKEND_API_URL` empty and sign in with Google; the same models classify your real mail. See [Which inbox you get](LOCAL.md#which-inbox-you-get).

### What to look at

With the seeded inbox, these emails show each outcome. Open the **BL Comparison** tab:

| Email         | What it shows                                                                                                    |
| ------------- | ---------------------------------------------------------------------------------------------------------------- |
| `email_004` | A real**mismatch**: the SI and BL disagree on consignee and notify party. The field table highlights both. |
| `email_503` | **Needs review, wrong document type**: a certificate of origin was attached where the BL should be.        |
| `email_506` | **Needs review, missing attachment**: an SI but no BL.                                                     |
| `email_513` | **Needs review, unreadable**: both PDFs are scans with no text layer.                                      |
| `email_516` | **Needs review, missing value**: the SI's gross weight is blank.                                           |

Try **Resolve** on a mismatch, the **Match / Mismatch / Draft BL / Needs review / Resolved** filters above the list, and **Reply**, which opens Gmail's compose window with an optional AI-written draft.

## What it does

- **Five-way sorting** with a confidence score, and a count on every tab.
- **Shipment document checks** on every email: is there an SI? a BL? does the SI carry the 14 mandatory fields (Shipper/Exporter, Consignee, Notify Party, ports, containers, weight, vessel, voyage, goods, HS code, booking ref, OC No., freight)? A field-by-field table shows what the SI, the BL and the email text each say, with anything missing flagged.
- **SI-vs-BL verdict** on BL Comparison emails: **Match**, **Mismatch** (with the fields that differ) or **Needs review** (with the reason). A request for a draft BL with no pair to compare yet is labelled **Draft BL**.
- **Resolve** a Mismatch or Needs-review email once dealt with; it moves to a Resolved filter and can be put back.
- **AI summary**: category and confidence, the Booking and Carrier ref, and a TL;DR. The TL;DR is written locally by an extractive summariser, so it needs no API key.
- **Reply in Gmail** from under the email, with an **AI Draft** switch (Gemini when a key is set, otherwise a rule-based draft). The app only writes text; a person presses send. It then watches Sent mail and reports the result as a toast and in a notification bell: sent, delivered, not sent or bounced.
- **Paged list** (50 a page, newer/older, Refresh), unread dots that stay cleared, attachments previewed inline, a resizable split, light/dark mode, and a layout that stacks on phones.

## How it fits together

```
 Browser ── Next.js website (src/) ──┬── Gmail API (your mailbox, with your own token)
                                     │
                                     └── FastAPI gateway (backend/)  :8000
                                            ├── sdoc_classifier/   email → one of 5 categories
                                            └── sdoc_comparator/   SI + BL → OK / MISMATCH / NEEDS_REVIEW
```

| Part                   | What it does                                                                                                                                          | Docs                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `src/`               | The website: dashboard, Gmail source, replies, notifications                                                                                          | this file                                                                  |
| `sdoc_classifier/`   | Email category model: TF-IDF and engineered flags into a balanced logistic regression, plus one rule (an SI + BL attachment pair means BL Comparison) | [README](sdoc_classifier/README.md), [WORKFLOW](sdoc_classifier/WORKFLOW.md) |
| `sdoc_comparator/`   | SI-vs-BL comparison: a small label classifier finds each field, then plain, explainable rules compare seven fields                                    | [README](sdoc_comparator/README.md), [WORKFLOW](sdoc_comparator/WORKFLOW.md) |
| `backend/`           | FastAPI gateway that serves both models to the website                                                                                                | [LOCAL.md](LOCAL.md#the-gateway-api)                                        |
| `PLANWORKCOMBINE.md` | How the three branches were merged (history, not a guide)                                                                                             |                                                                            |

Machine learning is used where it helps and nowhere else: the classifier sorts mail, and the comparator uses a model only to decide which field a raw label means ("Load Port" and "POL" are both the port of loading). Every verdict comes from readable code, so a reviewer can see why a pair was flagged.

### Frontend and backend

**Frontend** — Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Lucide icons. Three-pane dashboard with a resizable split, light/dark theming, and a paged inbox list.

**Backend** — an email is not answered by one model. It moves down a pipeline, and that pipeline is split across two separate programs, written in two languages and deployed independently.

**1. The Next.js server** (`src/app/api/`, `src/lib/`) — TypeScript, deployed with the frontend. It runs the front half of the pipeline: authenticate the user (Auth.js / `next-auth` v5, with Google token refresh), fetch the mail and its attachments from the Gmail API, then hand each message to stage 2. It also owns the steps that never touch the models — the TL;DR, written locally with no API key, and Gemini reply drafts.

**2. The Python gateway** (`backend/`) — Python 3.13, FastAPI, scikit-learn, deployed on its own. It runs the model stages and knows nothing about users: give it a message and it returns a category; give it an SI and a BL and it returns a comparison.

The split follows the runtimes. The models need Python and a long-lived process to keep them loaded; the website needs Node and scales per request. It also means the pipeline degrades instead of breaking — if the gateway is unreachable, the model stages fall back to the website's own rules and the inbox still renders.

### The ML pipeline

Inside the gateway there are two chains, one per question. Every stage can stop the run and hand the email to a person rather than guess.

**Categorising an email** (`sdoc_classifier/`):

```
raw email ─► parse ─► clean + flag ─► logistic regression ─► rule override ─► confidence gate ─► category
            (loading) (features)      (TF-IDF probabilities)  (predict)       (config)
```

1. **Parse** — sender, subject, body and attachment names into one record.
2. **Clean and flag** — normalise the text, then compute engineered flags (internal sender domain, an SI+BL attachment pair, coded subject formats).
3. **Classify** — balanced logistic regression over TF-IDF gives a probability per category.
4. **Rule override** — deterministic rules can overrule the model where the signal is unambiguous.
5. **Confidence gate** — anything below `LOW_CONFIDENCE_THRESHOLD` (0.55) is reported as `GENERAL` rather than a confident wrong answer, with the model's original guess kept in `model_category`.

**Comparing an SI against a BL** (`sdoc_comparator/`):

```
SI + BL ─► both present? ─► extract fields ─► both readable? ─► normalise + compare ─► status
             │                (by file type)     │                                      │
             └── no ──────────────────────────┐  └── no ──┐                    OK / MISMATCH /
                                              └───────────┴──► NEEDS_REVIEW     NEEDS_REVIEW
```

1. **Presence check** — if only one of the pair arrived, stop. Comparing against nothing would report every field as missing.
2. **Extract** — a small label classifier pulls the mandatory fields out of each document, dispatching on file type (`.pdf`, `.docx`, `.xlsx`, `.txt`).
3. **Readability check** — a corrupt file, a scan with no text, or a document that turns out not to be an SI or BL stops the run here.
4. **Normalise and compare** — deterministic rules reconcile spelling, spacing and unit differences before two values are called a mismatch.
5. **Result** — `OK`, `MISMATCH` with the offending fields, or `NEEDS_REVIEW` with the reason a person is needed.

The recurring idea in both: **an honest "I don't know" beats a confident wrong answer**, because a wrong category or a missed document discrepancy costs far more downstream than a flag asking someone to look.

## Privacy and access

- **Read access, one small change.** Google sign-in asks for `gmail.modify`, used to read the inbox and to clear the *unread* mark on an email you open. The app never sends, deletes or edits mail. Replying opens Gmail's own compose window.
- **Nothing is stored.** Attachments are fetched from Gmail when a page needs them, held in memory and passed through; they are not written to disk. Messages are held in the server's memory for up to an hour.
- **What is written to disk.** The server keeps a list of message ids you have opened per account in `.data/read-messages.json` (git-ignored) so the unread dots stay cleared. Resolved flags and notifications live in your browser only.
- **Where email content goes.** Classification and comparison go to the gateway you run yourself (`CLASSIFIER_API_URL`, normally `localhost`); it deletes its temporary copies of attachments when each request ends. The only other destination is Google's Gemini API, and only when `GEMINI_API_KEY` is set *and* you press Reply with **AI Draft** on. The TL;DR never leaves the server.
- **The demo account** touches no Google service at all.

## Limitations

- **Fitted to the organisers' data.** The dataset was generated from a small set of templates, so a perfect score on it is not evidence the model can read arbitrary mail. See [Classification on real mail](#classification-on-real-mail).
- **Scanned PDFs are not read.** A document with no text layer, or one that cannot be opened, goes to a person as `unreadable`. OCR would fix the scans; it is not built.
- **Seven fields are compared.** Shipper, consignee, notify party, ports, container count and gross weight. A difference in, say, the vessel or HS code is not flagged.
- **Gmail tab counts cover the newest 1,000 messages**, counted in the background, and read "N+" beyond that.
- **The comparison has a second implementation.** The website carries a TypeScript copy of the comparison rules (`src/lib/demo/compare.ts`), used by the demo account and as the fallback when the Python service is down. The two are kept in step by hand.
- **No single command builds the merged submission file** (see the note above).
- **Google sign-in is limited** to accounts on the OAuth test-user list; the demo account exists so nobody has to be added to browse the product.
- **Not exercised here:** the Reply and notification flow against a live Gmail account was reviewed in code, not run end to end for this write-up.

## Classification on real mail

The classifier is trained on 520 generated emails built from a handful of templates. On the seeded dataset it scores 520/520. On a **personal** inbox it is out of its depth, because several of the features it learned do not occur there at all: an internal `aprilasia.com` sender, an SI+BL attachment pair, the coded subject formats. Expect most ordinary mail to land in **General** or **Spam**.

The confidence gate in the pipeline above keeps that from becoming confidently wrong, but it does not make the answer right. The real fix is retraining on labelled real mail in `sdoc_classifier/extra_data/train_handwritten.json`, which the training code picks up automatically and weights ×5. The threshold itself lives in `sdoc_classifier/src/config.py`.

## Documentation

| Document                                              | For                                                                           |
| ----------------------------------------------------- | ----------------------------------------------------------------------------- |
| [LOCAL.md](LOCAL.md)                                   | Running it on your machine: setup, env vars, the gateway API, troubleshooting |
| [DEPLOYMENT.md](DEPLOYMENT.md)                         | Production: Google Cloud, Vercel, hosting the gateway on Railway              |
| [IMPORT.md](IMPORT.md)                                 | Replacing the demo's sample inbox with your own data                          |
| [sdoc_classifier/README.md](sdoc_classifier/README.md) | The email category model                                                      |
| [sdoc_comparator/README.md](sdoc_comparator/README.md) | The SI-vs-BL comparator                                                       |
| `PLANWORKCOMBINE.md`                                | How the three branches were merged (history, not a guide)                     |

Contributors: this is not the Next.js of older tutorials. `AGENTS.md` says to read the guide in `node_modules/next/dist/docs/` (after `npm install`) before writing code.
