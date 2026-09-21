# WayBoxAI

**AI email triage for logistics, built for the Averis x Monash Hackathon 2026.**

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
| **Stage 2 — SI-vs-BL verdict** (status, review reason and defect fields), all 520 emails | **519 / 520** exactly right |
| Same, on the 20 edge cases `email_501`–`email_520` (never trained on) | 20 / 20 |

The dataset holds 454 `OK`, 46 `MISMATCH` and 20 `NEEDS_REVIEW` emails (five for each review reason). 45 of the 46 mismatches are found with exactly the right fields, all 20 review cases get the right reason, and all 454 `OK` emails are left alone. The one miss:

- **`email_499`** is a mismatch the system did not report. Its BL PDF is truncated (`Unexpected EOF`), so it cannot be opened and the system sends it to a person as `unreadable`. The ground truth expects a gross-weight mismatch.

**How to read these numbers.** The models were built and tuned on this dataset, so they show that the system does what the brief asks on the data provided, not how it will do on unseen mail. Section [Limitations](#limitations) says where it is weaker, and the [Classification on real mail](#classification-on-real-mail) note explains why a personal inbox does worse.

### Check it yourself

You can reproduce the Stage 2 numbers without opening the website. After [the one-time setup](#one-time-setup), save this as `check.py` in the project root and run `.venv/Scripts/python.exe check.py`:

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

It prints the `email_499` miss and `520 emails: {..., 'all four': 519}`. The category half alone can also be run with `python -m src.predict` and `python -m src.evaluate` in `sdoc_classifier/` (see its [README](sdoc_classifier/README.md)).

> **What the submission file contains.** `python -m src.predict` writes `out/submission.json` in the organisers' format (`category`, `status`, `review_reason`, `defect_fields`, `has_defect` per email), but it fills in only the **category**; the four comparison fields are left at their defaults. The comparison results come from the comparator and the gateway. No single command yet writes the two halves into one 520-entry file, which the script above does in memory for scoring.

## Try it

**Fastest — the demo, no Google account.** Put a random string in `.env.local` as `AUTH_SECRET`, run the website (below) and click **Try the demo**. It browses the 520 sample emails and needs no Python service.

**Best for judging — the organisers' inbox with the real models.** Run both processes below with `BACKEND_API_URL=http://localhost:8000` set, then sign in (or use the demo). This is the version the results above describe.

**Your own Gmail.** Leave `BACKEND_API_URL` empty and sign in with Google; the same models classify your real mail. See [Which inbox you get](#which-inbox-you-get).

### What to look at

With the seeded inbox, these emails show each outcome. Open the **BL Comparison** tab:

| Email | What it shows |
|---|---|
| `email_004` | A real **mismatch**: the SI and BL disagree on consignee and notify party. The field table highlights both. |
| `email_503` | **Needs review, wrong document type**: a certificate of origin was attached where the BL should be. |
| `email_506` | **Needs review, missing attachment**: an SI but no BL. |
| `email_513` | **Needs review, unreadable**: both PDFs are scans with no text layer. |
| `email_516` | **Needs review, missing value**: the SI's gross weight is blank. |

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

| Part | What it does | Docs |
|---|---|---|
| `src/` | The website: dashboard, Gmail source, replies, notifications | this file |
| `sdoc_classifier/` | Email category model: TF-IDF and engineered flags into a balanced logistic regression, plus one rule (an SI + BL attachment pair means BL Comparison) | [README](sdoc_classifier/README.md), [WORKFLOW](sdoc_classifier/WORKFLOW.md) |
| `sdoc_comparator/` | SI-vs-BL comparison: a small label classifier finds each field, then plain, explainable rules compare seven fields | [README](sdoc_comparator/README.md), [WORKFLOW](sdoc_comparator/WORKFLOW.md) |
| `backend/` | FastAPI gateway that serves both models to the website | below |
| `PLANWORKCOMBINE.md` | How the three branches were merged (history, not a guide) | |

Machine learning is used where it helps and nowhere else: the classifier sorts mail, and the comparator uses a model only to decide which field a raw label means ("Load Port" and "POL" are both the port of loading). Every verdict comes from readable code, so a reviewer can see why a pair was flagged.

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
- **Not exercised here:** the Reply and notification flow against a live Gmail account was reviewed in code, not run end to end for this write-up.

## Running it in full

The app is **two processes**: the Next.js website, and a Python service that runs the two models. Open **two terminals**, both in the project root (`SleepyM4tcha-Hackathon/`, the folder with `package.json`).

### One-time setup

You need **Node 20+** and **Python 3.13+**.

```bash
npm install                                  # website dependencies
py -3.13 -m venv .venv                       # Python environment
.venv/Scripts/python.exe -m pip install -r requirements.txt
cp .env.example .env.local                   # then fill it in, see "Environment variables"
```

### Terminal 1 — the website

```bash
npm run dev
```

Wait for `✓ Ready in ...`, then open **[http://localhost:3000](http://localhost:3000)**.

> Use `localhost`, not `127.0.0.1`, or Google sign-in rejects the redirect. If you see `Port 3000 is in use ... using available port 3001 instead`, **stop and free port 3000** (see Troubleshooting): Google OAuth is registered for 3000 only.

### Terminal 2 — the ML service

```bash
.venv/Scripts/python.exe -m uvicorn backend.app:app --port 8000
```

Wait for `Uvicorn running on http://127.0.0.1:8000`, then check it:

```bash
curl http://localhost:8000/health        # {"status":"ok","emails":520}
```

Without this service the website still runs, but classification falls back to keyword rules and comparison uses the website's built-in copy of the comparison rules. On Windows PowerShell use backslashes: `.venv\Scripts\python.exe -m uvicorn ...`

### Which inbox you get

Two variables in `.env.local` decide this. They interact: setting `BACKEND_API_URL` switches the Gmail path off entirely.

| `BACKEND_API_URL`       | `CLASSIFIER_API_URL`      | What you see                                 |
| ----------------------- | ------------------------- | -------------------------------------------- |
| *(empty)*               | `http://localhost:8000` | **Your real Gmail**, classified live         |
| `http://localhost:8000` | *(ignored)*               | The seeded 520-email dataset                 |
| *(empty)*               | *(empty)*                 | Your real Gmail, keyword rules only          |

Restart `npm run dev` after changing either. **For judging, prefer the seeded dataset**: it is what the models were trained on and where the results above come from. **No Google credentials at all?** Set only `AUTH_SECRET` and click **Try the demo**.

### Stopping, and scripts

Press **Ctrl+C** in each terminal.

| Command           | What it does                       |
| ----------------- | ---------------------------------- |
| `npm run dev`   | Development server with hot reload |
| `npm run build` | Production build                   |
| `npm start`     | Serve the production build         |
| `npm run lint`  | ESLint                             |

The ML side, from the project root:

```bash
cd sdoc_classifier && ../.venv/Scripts/python.exe -m pytest        # 25 tests
cd sdoc_classifier && ../.venv/Scripts/python.exe -m src.train     # retrain the classifier
cd sdoc_comparator && ../.venv/Scripts/python.exe src/main.py      # run the comparison demo
```

## Environment variables

Put them in **`.env.local`** in the project root, next to `package.json`. It is git-ignored; start from `.env.example`. One `NAME=value` per line, no quotes and no spaces around `=`. They are read at startup, so **restart `npm run dev`** after changing them.

| Variable               | Required         | Default  | What it does                                                                                                                                                                                                 |
| ---------------------- | ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AUTH_SECRET`        | Yes              | -        | Random string that signs login sessions. Generate with `npx auth secret`. Use a different one per environment.                                                                                              |
| `AUTH_GOOGLE_ID`     | For Google login | -        | OAuth client ID from Google Cloud (see "Setting up Google sign-in").                                                                                                                                         |
| `AUTH_GOOGLE_SECRET` | For Google login | -        | OAuth client secret from the same place. Keep it private.                                                                                                                                                    |
| `BACKEND_API_URL`    | No               | empty    | The gateway's origin, e.g. `http://localhost:8000`. **Empty = the app reads the signed-in user's Gmail itself.** Set = every email comes from the gateway's seeded inbox instead. |
| `CLASSIFIER_API_URL` | No               | empty    | Where `POST /classify` and `POST /compare` live, normally `http://localhost:8000`. Used **only on the Gmail path**. Unset or unreachable falls back to keyword rules rather than failing. |
| `GEMINI_API_KEY`     | No               | empty    | Lets the **AI Draft** switch have Gemini write the reply ([get a key](https://aistudio.google.com/apikey)). The email's text is sent to Google, and only when you press Reply with the switch on. Without a key a rule-based draft is used. |
| `GEMINI_MODEL`       | No               | `gemini-3.5-flash-lite` | Which Gemini model writes the drafts. |
| `ENABLE_DEMO`        | No               | `true` | The "Try the demo" login. Set to exactly `false` to turn it off. Any other value leaves it on.                                  |

Two more exist for testing and tuning; leave them unset normally: `GMAIL_API_URL` points the Gmail source at a fake server, and `GMAIL_MIN_INTERVAL_MS` (default 25) sets the gap between Gmail requests.

## Setting up Google sign-in

Only needed for a real Gmail inbox.

1. In [Google Cloud Console](https://console.cloud.google.com) create a project and enable the **Gmail API**.
2. **OAuth consent screen**: user type External. Add the scope `.../auth/gmail.modify`. While the app is in *Testing* status, add every Google account that will sign in under **Test users**, otherwise Google shows "access blocked".
3. **Credentials > Create credentials > OAuth client ID > Web application.** Add the authorised redirect URI `http://localhost:3000/api/auth/callback/google`.
4. Copy the client ID and secret into `.env.local`.
5. Google shows a "hasn't verified this app" warning in Testing mode. Click Advanced, then Continue.

## Reference

### Where the emails come from

`src/lib/emails.ts` picks the source, in this order:

1. **Demo account** → the sample inbox in `public/dummy` (520 emails, 250 attachment files).
2. **`BACKEND_API_URL` set** → the gateway's seeded inbox.
3. **Signed in with Google, no backend** → the user's own **Gmail inbox** (`src/lib/gmail/`), fetched **50 messages at a time, on demand**. Nothing is fetched ahead of time, which keeps a big inbox well inside Gmail's quota of 15,000 units per minute per user. Loaded messages are kept for an hour, requests are paced, and a quota error waits and retries.
4. Otherwise → the built-in mock emails.

The demo, mock and backend sources hold their whole list, so the server filters by tab and then slices: tab counts and "1-50 of 137" are exact. Gmail can't do that without reading everything, so each tab filters the 50 messages on screen (stepping on to the next page if that has nothing to show) and the tab numbers come from the background count of the newest 1,000.

For Gmail, `src/lib/gmail/enrich.ts` calls the classifier (`POST /classify`), and `src/lib/gmail/attachments.ts` works out from their contents which attachment is the SI and which the BL, then calls the comparator (`POST /compare`) when there is exactly one of each. If the ML service is down both fall back to the website's own rules, so the inbox still renders.

### The demo account

**Try the demo** logs in as a fake "Demo User" and browses `public/dummy/inbox`. The dummy data carries no labels, so `src/lib/demo/classify.ts` assigns categories with keyword rules tuned against the ground truth; they are fitted to the organisers' templates, so read that as "the no-backend demo looks right", not as a second classifier. `src/lib/demo/parse.ts` and `extract.ts` read SI/BL fields from the email text and the `.txt` / `.pdf` / `.docx` / `.xlsx` attachments, and `compare.ts` gives the verdict. Some sample PDFs are deliberately corrupt or scanned, to show the "couldn't be read" state. Reply works on a timer here, since there is no Sent mail to check.

### The gateway API

`backend/app.py` serves these to the website. Types are in `src/lib/types.ts`, and `src/lib/api/adapters.ts` validates every response.

| Route                  | What it returns                                                              |
| ---------------------- | ---------------------------------------------------------------------------- |
| `GET /health`        | `{status, emails}`                                                            |
| `GET /emails`        | The seeded inbox, classified. Category and summary only, no attachment parsing (the website's client gives up after 15 s) |
| `GET /emails/{id}`   | One email, plus its SI-vs-BL comparison                                      |
| `GET /api/demo-attachments/{name}` | One seeded attachment file                                     |
| `POST /classify`     | One message → `{category, confidence, model_category, low_confidence, summary}` |
| `POST /compare`      | An SI and a BL file → `{status, review_reason, defect_fields, shipment_comparison}` |

A `BL_COMPARISON` email with no attachments at all still comes back `NEEDS_REVIEW` / `missing_attachment` when its body says documents are attached.

| Per-email field                                  | Meaning                                                                                        |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `email_id`, `from`, `to`, `subject`, `body`, `received_at` | The email itself. `body_type` is `html` or `text`                                |
| `attachments`                                    | `[{ id, filename, mime_type, size, url }]`                                                     |
| `category`                                       | `BL_COMPARISON`, `SI_REQUEST`, `INVOICE_QUERY`, `GENERAL` or `SPAM`                            |
| `summary`                                        | `{ headline, summary, confidence, reason, fields[], actions[], sentiment }`                    |
| `shipment_info`, `shipment_documents`            | Fields stated in the email text; and the SI/BL documents found, each with its fields           |
| `status`, `review_reason`, `defect_fields`       | The verdict (`OK`, `MISMATCH`, `NEEDS_REVIEW`), why a person is needed, and the fields that differ |
| `shipment_comparison`                            | `[{ field, si_value, bl_value, status }]`, status `match`, `mismatch` or `unsure`              |

### Project structure

| Path                                        | What                                                                                   |
| ------------------------------------------- | -------------------------------------------------------------------------------------- |
| `src/app/`                                | Pages (landing, login, dashboard) and API routes: `inbox/` (pages, counts, mark read), `attachments/`, `draft/`, `reply-status/`, `reply-bounce/`, `auth/` |
| `src/auth.ts`                             | Auth.js: Google (Gmail scope, token refresh) and the demo login                       |
| `src/lib/emails.ts`                       | Chooses the source: demo, backend, Gmail, or mock                                      |
| `src/lib/gmail/`                          | Gmail source: paged inbox, tab counts, parsing, attachments, read memory               |
| `src/lib/api/`                            | Backend routing and response validation                                                |
| `src/lib/demo/`                           | Demo loader, keyword classifier and comparison, plus document readers Gmail shares     |
| `src/lib/summarize.ts`, `draft.ts`, `gemini.ts` | The local TL;DR, and reply drafts (Gemini or rule-based)                          |
| `src/lib/notifications.ts`, `resolved.ts`, `read-state.ts` | Browser-held state, kept per account                                  |
| `src/components/`                         | Inbox list, summary panel, shipment checklist, reply bar, toasts, and the rest of the UI |
| `public/dummy/`, `public/mock/`         | Sample emails and attachments                                                          |

Contributors: this is not the Next.js of older tutorials. `AGENTS.md` says to read the guide in `node_modules/next/dist/docs/` (after `npm install`) before writing code.

### Troubleshooting

| Symptom                                   | Fix                                                                                          |
| ----------------------------------------- | -------------------------------------------------------------------------------------------- |
| `redirect_uri_mismatch`                 | The URI in Google Cloud must exactly match `http://localhost:3000/api/auth/callback/google` |
| "Access blocked" / `access_denied`      | Add your account under Test users on the OAuth consent screen                                |
| `MissingSecret` error                   | `AUTH_SECRET` is empty in `.env.local`                                                   |
| Env changes have no effect                | Restart `npm run dev`                                                                      |
| Sent back to the landing page after login | The Google refresh token failed. Sign out and sign in again                                  |
| `Port 3000 is in use ... using 3001`    | Free the port, don't accept 3001. See below                |
| `Jest worker encountered N child process exceptions` | A stale dev server whose workers died. Restart it                                |
| `FATAL: An unexpected Turbopack error occurred`, or every page 500s on a fresh start | Corrupt build cache. `rm -rf .next` and restart; it is regenerated and git-ignored |
| Inbox shows the 520 sample emails, not your real mail | `BACKEND_API_URL` is set. Blank it and restart to read Gmail                 |
| Categories look wrong / everything is General | The ML service isn't running, so it fell back to keyword rules. Start terminal 2   |
| No SI/BL comparison on a Gmail email      | Needs exactly one readable SI **and** one readable BL attachment. With the ML service down you get the built-in comparison instead of the model's |
| Tab numbers show "N+" or keep filling in  | Normal on a big inbox: only the newest 1,000 messages are counted, in the background     |
| AI Draft is a short generic reply         | No `GEMINI_API_KEY`, or the Gemini call failed, so the rule-based draft was used         |
| `403 insufficient authentication scopes` | Gmail API not enabled, or `gmail.modify` missing from the consent screen, or Google reused an old grant. Revoke it at myaccount.google.com/permissions and sign in again |

**Freeing a stuck port** (PowerShell):

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

## Classification on real mail

The classifier is trained on 520 generated emails built from a handful of templates. On the seeded dataset it scores 520/520. On a **personal** inbox it is out of its depth, because several of the features it learned do not occur there at all: an internal `aprilasia.com` sender, an SI+BL attachment pair, the coded subject formats. Expect most ordinary mail to land in **General** or **Spam**.

Predictions below `LOW_CONFIDENCE_THRESHOLD` (0.55, in `sdoc_classifier/src/config.py`) are reported as `GENERAL` by `POST /classify` rather than as a confident wrong answer, with the model's original guess kept in `model_category`. That helps, but does not fix it: the real fix is retraining on labelled real mail in `sdoc_classifier/extra_data/train_handwritten.json`, which the training code picks up automatically and weights ×5.
