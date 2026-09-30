<div align="center">

# 📦 WayBoxAI

**AI email triage for shipping teams: it sorts the inbox, checks the documents, and knows when to ask a human.**

Built for the **Averis × Monash Hackathon 2026** by Team **SleepyM4tcha**

### [▶ Live demo](https://wayboxai.vercel.app) · [📄 Full report (PDF)](WayBoxAI-Report.pdf) · [💻 Run locally](LOCAL.md)

</div>

---

## ⚡ TL;DR

| | |
|---|---|
| **Problem** | Shipping teams get one inbox full of mixed mail. Every "please check the BL" request means comparing a **Shipping Instruction (SI)** against a draft **Bill of Lading (BL)** field by field, by hand. One missed difference becomes a delay or a cost. |
| **Solution** | A Gmail-style inbox where every email arrives **already sorted, already compared and already explained**. |
| **Result** | **520 / 520** emails sorted correctly · **520 / 520** SI-vs-BL verdicts exactly right · **0** false alarms |

## 🏆 Results

Scored against the organisers' `ground_truth.json`, all 520 emails:

| Task | Score |
|---|---|
| Sort each email into 1 of 5 categories | **520 / 520** ✅ |
| SI-vs-BL verdict (status, reason and exact fields) | **520 / 520** ✅ |
| Mismatches caught, with the right fields | **46 / 46** |
| "Needs review" cases given the right reason | **20 / 20** |
| False alarms on clean SI/BL pairs | **0 / 454** |
| Edge cases `email_501`–`email_520` (never trained on) | **20 / 20** |

> **Honest note:** the models were built on this dataset, so these numbers show the system does what the brief asks. They don't show how it would do on any inbox in the world. See **Limitations** below.

## 👀 Try it in 1 minute

1. Open **[wayboxai.vercel.app](https://wayboxai.vercel.app)**
2. Click **Try the demo** (no Google account needed)
3. Go to the **BL Comparison** tab and open these emails:

| Email | What you'll see |
|---|---|
| `email_004` | ❌ **Mismatch**: SI and BL disagree on consignee and notify party, both highlighted |
| `email_503` | ⚠️ **Needs review**: wrong document attached (a certificate of origin, not a BL) |
| `email_506` | ⚠️ **Needs review**: the SI arrived but the BL is missing |
| `email_513` | ⚠️ **Needs review**: both PDFs are scans with no readable text |
| `email_516` | ⚠️ **Needs review**: the SI's gross weight is blank |

Then try **Resolve**, the **Match / Mismatch / Needs review** filters, **Reply** with an AI draft, and **Export** (top bar), which downloads `submission.json` in the organisers' scoring format.

> The demo inbox is shared between visitors. If it looks empty or different, click **Try the demo** again to reset it to the 520 sample emails.

## ✨ Features

- 📬 **5-way sorting**: BL Comparison, SI Request, Invoice Query, General, Spam, with a confidence score and live counts on every tab
- 🔍 **SI vs BL check**: reads `.pdf`, `.docx`, `.xlsx` and `.txt` attachments and puts the fields side by side. The verdict is **Match**, **Mismatch** (which fields) or **Needs review** (why)
- 🙋 **Asks instead of guessing**: 4 escalation reasons (missing attachment, wrong document, unreadable file, missing value)
- 📝 **AI summary**: category, booking and carrier refs, and a TL;DR written locally with no API key
- ✉️ **Reply in Gmail**: optional AI-written draft (Gemini), then tracks whether the reply was sent, delivered or bounced. A person always presses Send
- ✅ **Resolve** workflow · 📤 **Export** for scoring · 🌗 light/dark mode · 📱 works on phones
- 🔌 **Works on real Gmail too**: sign in with Google and the same models sort your own inbox

## 🧠 How it works

```
Browser ─► Next.js website ─┬─► Gmail API (your inbox)
                            └─► Python ML service (FastAPI)
                                  ├─ Classifier : email   → 1 of 5 categories
                                  └─ Comparator : SI + BL → OK / MISMATCH / NEEDS_REVIEW
```

1. **Classify**: TF-IDF and logistic regression, plus a few clear rules (an SI + BL attachment pair means BL Comparison). If confidence is below 0.55, the email goes to *General* instead of getting a confident wrong label.
2. **Compare**: a small ML model works out which field a label means ("POL" = "Load Port" = "Port of Loading"). Plain, readable rules then compare the values, so every verdict can be traced to a rule.

**Design principle:** *an honest "I don't know" beats a confident wrong answer.* Any step can stop and hand the email to a person, with the reason attached. If the ML service goes down, the website falls back to built-in rules and the inbox keeps working.

| Layer | Tech |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| Backend / ML | Python 3.13, FastAPI, scikit-learn |
| Integrations | Gmail API, Google OAuth (Auth.js), Gemini |
| Hosting | Vercel (website), Railway (ML service) |

## 🎯 For the judges

| Criterion | Where to see it |
|---|---|
| End-to-end functionality | Live site: inbox → sort → extract → compare → verdict → resolve → reply, with no manual step between |
| Architecture & scalability | Two services deployed separately; a stateless ML gateway; falls back cleanly when it is down |
| Technology integration | Gmail API, Google OAuth, Gemini, 2 trained models, 4 file formats, 2 cloud platforms |
| Engineering quality | 25 passing tests; every score can be reproduced with one script (below) |
| Effectiveness & user value | 520/520 verdicts, 0 false alarms; the operator sees the answer and the reason without opening a document |
| UX & differentiation | A real mail client, not a results table: 3 panes, inline previews, side-by-side field diff, no-login demo |
| Impact & future | The roadmap turns every operator "Resolve" into training data, so accuracy improves with use |

## 💻 Run it locally

You need **Node 20+** and **Python 3.13+**. The full guide is in [LOCAL.md](LOCAL.md).

```bash
# one-time setup
npm install
py -3.13 -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt
cp .env.example .env.local   # set AUTH_SECRET (npx auth secret) and BACKEND_API_URL=http://localhost:8000

# terminal 1: ML service
.venv/Scripts/python.exe -m uvicorn backend.app:app --port 8000

# terminal 2: website
npm run dev                  # open http://localhost:3000 and click "Try the demo"
```

With `BACKEND_API_URL` set, the inbox runs on the real Python models, which is the setup the results above come from. Without it, the demo uses the website's built-in rules.

> **On Windows, use a fresh clone.** Older clones predate `.gitattributes`; Git then rewrites line endings inside the sample PDFs and they show up as "couldn't be read". To repair one: `git rm --cached -r . && git reset --hard`.

<details>
<summary><b>🔬 Reproduce the scores yourself</b></summary>

After setup, save this as `check.py` in the project root and run `.venv/Scripts/python.exe check.py`:

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

Expected output, with no misses:

```
520 emails: {'category': 520, 'status': 520, 'review_reason': 520, 'defect_fields': 520, 'all four': 520}
```

The category model can also be checked on its own with `python -m src.predict` and `python -m src.evaluate` inside `sdoc_classifier/` (see its [README](sdoc_classifier/README.md)).

</details>

## ⚠️ Limitations

- **Fitted to the organisers' dataset.** It was generated from a small set of templates, so on a personal inbox most mail lands in *General* or *Spam*.
- **No OCR yet.** Scanned PDFs are flagged "unreadable" and sent to a person.
- **7 fields compared**: shipper, consignee, notify party, port of loading, port of discharge, container count and gross weight. Differences in vessel or HS code are not flagged.
- **Google sign-in** only works for accounts on our OAuth test-user list. Judges should use **Try the demo**.

## 🚀 Roadmap

- **OCR** for scanned documents, so the biggest group of "needs review" cases can be checked automatically
- **Learn from operators**: every Resolve becomes a labelled training example
- **Per-carrier rules**: configurable field sets for different carriers and trade lanes
- **Team features**: assignment, audit trail and a dashboard of turnaround times

## 🔒 Privacy

- The app never sends, deletes or edits mail. Its only change is clearing the *unread* mark on an email you open.
- Attachments are processed in memory and never saved.
- Email text goes to Gemini only when you press Reply with **AI Draft** switched on.

## 📚 More docs

| Doc | What's in it |
|---|---|
| [WayBoxAI-Report.pdf](WayBoxAI-Report.pdf) | The full technical report: architecture, challenges, roadmap |
| [LOCAL.md](LOCAL.md) | Local setup, environment variables, troubleshooting |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Deploying to Vercel and Railway |
| [IMPORT.md](IMPORT.md) | Loading your own inbox into the demo |
| [sdoc_classifier/](sdoc_classifier/README.md) | The email category model |
| [sdoc_comparator/](sdoc_comparator/README.md) | The SI-vs-BL comparator |
