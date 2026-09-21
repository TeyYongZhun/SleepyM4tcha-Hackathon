<div align="center">

# WayBoxAI

**AI email triage for logistics.**

Reads the mail coming in from carriers, freight forwarders and customs brokers,
sorts every message, and shows it next to an AI summary so a person can act in
seconds.

Built for the **Averis x Monash Hackathon 2026**

[Live demo](https://wayboxai.vercel.app) · [Run it locally](LOCAL.md) · [Deploy it](DEPLOYMENT.md)

</div>

---

## What it does

- **Sign in with Google**, or click **Try the demo** to explore without any credentials.
- **Filter the inbox**: All, BL Comparison, SI Request, Invoice Query, General, Spam — the five categories the classifier predicts, each with a live count.
- **Paged list**: 50 messages a page with **← Newer / Older →** at the bottom, like Gmail. Pages load on demand, so a big inbox is never fetched in bulk.
- **Three-pane dashboard**: inbox list on the left, the full email in the middle (text or HTML body, images, PDFs and text files previewed inline, attachments you can minimize), and a summary on the right.
- **Shipment document checks** at the top of the summary, on every email:
  - is there a Shipping Instruction (SI)? a Bill of Lading (BL)?
  - does it carry the 14 mandatory SI fields (Shipper/Exporter, Consignee, Notify Party, ports, containers, weight, vessel, voyage, goods, HS code, booking ref, OC No., freight)?
  - a field-by-field table of what the SI, BL and the email text each say, with anything missing flagged in red.
- **AI reply drafts**: the **AI Draft** switch writes a reply from the email's contents and opens it in Gmail.
- **Resizable split** between the email and the summary, and a **light/dark mode** toggle. Both are remembered.
- **Responsive**: on phones the list, email and summary stack.

## Tech stack

**Frontend** — Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4,
Lucide icons. Three-pane dashboard with a resizable split, light/dark theming,
and a paged inbox list.

**Backend** — an email is not answered by one model. It moves down a pipeline,
and that pipeline is split across two separate programs, written in two languages
and deployed independently.

**1. The Next.js server** (`src/app/api/`, `src/lib/`) — TypeScript, deployed
with the frontend. It runs the front half of the pipeline: authenticate the user
(Auth.js / `next-auth` v5, with Google token refresh), fetch the mail and its
attachments from the Gmail API, then hand each message to stage 2. It also owns
the steps that never touch the models — the TL;DR, written locally with no API
key, and Gemini reply drafts.

**2. The Python gateway** (`backend/`) — Python 3.13, FastAPI, scikit-learn,
deployed on its own. It runs the model stages and knows nothing about users: give
it a message and it returns a category; give it an SI and a BL and it returns a
comparison.

The split follows the runtimes. The models need Python and a long-lived process
to keep them loaded; the website needs Node and scales per request. It also means
the pipeline degrades instead of breaking — if the gateway is unreachable, the
model stages fall back to keyword rules and the inbox still renders.

### The ML pipeline

Inside the gateway there are two chains, one per question. Every stage can stop
the run and hand the email to a person rather than guess.

**Categorising an email** (`sdoc_classifier/`):

```
raw email ─► parse ─► clean + flag ─► logistic regression ─► rule override ─► confidence gate ─► category
            (loading) (features)      (TF-IDF probabilities)  (predict)       (config)
```

1. **Parse** — sender, subject, body and attachment names into one record.
2. **Clean and flag** — normalise the text, then compute engineered flags
   (internal sender domain, an SI+BL attachment pair, coded subject formats).
3. **Classify** — balanced logistic regression over TF-IDF gives a probability
   per category.
4. **Rule override** — deterministic rules can overrule the model where the
   signal is unambiguous.
5. **Confidence gate** — anything below `LOW_CONFIDENCE_THRESHOLD` (0.55) is
   reported as `GENERAL` rather than a confident wrong answer, with the model's
   original guess kept in `model_category`.

**Comparing an SI against a BL** (`sdoc_comparator/`):

```
SI + BL ─► both present? ─► extract fields ─► both readable? ─► normalise + compare ─► status
             │                (by file type)     │                                      │
             └── no ──────────────────────────┐  └── no ──┐                    OK / MISMATCH /
                                              └───────────┴──► NEEDS_REVIEW     NEEDS_REVIEW
```

1. **Presence check** — if only one of the pair arrived, stop. Comparing against
   nothing would report every field as missing.
2. **Extract** — a trained label classifier pulls the 14 mandatory fields out of
   each document, dispatching on file type (`.pdf`, `.docx`, `.xlsx`, `.txt`).
3. **Readability check** — a corrupt file, a scan with no text, or a document
   that turns out not to be an SI or BL stops the run here.
4. **Normalise and compare** — deterministic rules reconcile spelling, spacing
   and unit differences before two values are called a mismatch.
5. **Result** — `OK`, `MISMATCH` with the offending fields, or `NEEDS_REVIEW`
   with the reason a person is needed.

The recurring idea in both: **an honest "I don't know" beats a confident wrong
answer**, because a wrong category or a missed document discrepancy costs far
more downstream than a flag asking someone to look.

## How it works

```
  Browser ──► Next.js server ──► Gmail API
  (frontend)                     Gemini API
                    │
                    └──► FastAPI gateway ──► sdoc_classifier  (category)
                                         └──► sdoc_comparator (SI vs BL)
```

`src/lib/emails.ts` picks the email source, in this order:

1. **Demo account** → the 520 sample emails in `public/dummy`.
2. **`BACKEND_API_URL` set** → the FastAPI gateway's seeded inbox.
3. **Signed in with Google** → the user's own **Gmail inbox**, fetched 50
   messages at a time, on demand. Nothing is fetched ahead of time, which keeps a
   big inbox well inside Gmail's quota of 15,000 units per minute per user.
   Loaded messages are cached for 10 minutes, requests are paced, and a quota
   error waits and retries.
4. Otherwise → built-in mock emails.

Gmail has no categories, summaries or SI/BL fields, so `src/lib/gmail/enrich.ts`
fills them in by calling the real classifier (`POST /classify`), and
`src/lib/gmail/attachments.ts` reads the attachments and asks for the SI-vs-BL
comparison (`POST /compare`). If that service is unset or down, both fall back to
keyword rules so the inbox still renders.

**Attachments are never stored.** The email carries a URL like
`/api/attachments/<emailId>/<partId>`; when the browser opens it, the route asks
Gmail for that one file with the user's token and passes it through. Only images,
PDFs and plain text open inline; everything else downloads, and files are served
with a sandbox CSP so a hostile attachment cannot run scripts on your origin.

### The gateway API

`backend/app.py` serves these to the website. Full types are in
`src/lib/types.ts`; `src/lib/api/adapters.ts` validates every response.

| Route                | What it returns                                                                     |
| -------------------- | ----------------------------------------------------------------------------------- |
| `GET /health`        | `{status, emails}` — a quick check that the service is up                           |
| `GET /emails`        | The seeded inbox, classified. Category and summary only, no attachment parsing      |
| `GET /emails/{id}`   | One email, plus its SI-vs-BL comparison                                             |
| `POST /classify`     | One message → `{category, confidence, model_category, low_confidence, summary}`      |
| `POST /compare`      | An SI and a BL file → `{status, review_reason, defect_fields, shipment_comparison}`  |

## Project structure

| Path                 | What                                                                     |
| -------------------- | ------------------------------------------------------------------------ |
| `src/`               | Frontend and the Next.js server                                          |
| `sdoc_classifier/`   | Email category model — sorts mail into the five categories               |
| `sdoc_comparator/`   | SI-vs-BL document comparison — finds mismatched fields                   |
| `backend/`           | FastAPI gateway that serves both models to the website                   |
| `public/dummy/`      | The 520 sample emails and their attachments                              |

Inside the website:

| Path                                        | What                                                                    |
| ------------------------------------------- | ----------------------------------------------------------------------- |
| `src/app/page.tsx`                          | Landing page                                                            |
| `src/app/login/page.tsx`                    | Sign-in page (Google + demo)                                            |
| `src/app/dashboard/[category]/layout.tsx`   | Dashboard for a filter, with the persistent inbox list (left pane)      |
| `src/app/dashboard/[category]/[emailId]/`   | Email (middle pane) and summary (right pane)                            |
| `src/app/globals.css`                       | Design tokens (colours, fonts) with light and dark values               |
| `src/auth.ts`                               | Auth.js: Google (Gmail scope, token refresh) and the demo login         |
| `src/lib/api/`                              | Backend routing: `routes.ts`, `adapters.ts`, `client.ts`                |
| `src/lib/emails.ts`                         | Chooses the source: demo, backend, Gmail, or mock                       |
| `src/lib/gmail/`                            | Gmail source: paging, message parsing, attachment fetch                 |
| `src/lib/summarize.ts`                      | The TL;DR, written locally with no API key                              |
| `src/lib/gemini.ts`                         | Gemini client for AI reply drafts                                       |
| `src/lib/shipment.ts`                       | The 14 mandatory SI fields and the SI / BL / structure checks           |
| `src/lib/demo/`                             | Dummy-inbox loader and keyword classifier, plus the document readers in `extract.ts`, which Gmail shares |
| `src/components/summary-panel.tsx`          | Right pane: shipment checks, classification, key details, TL;DR, actions |
| `src/components/shipment-checklist.tsx`     | The SI / BL / structure checks and the field table                      |
| `src/components/reply-bar.tsx`              | Reply + AI Draft, and the sent/delivered watcher                        |

## Honest limits

The classifier is trained on 520 generated emails built from a handful of
templates. On the seeded dataset it scores 520/520. On a **personal** inbox it is
out of its depth, because several of the features it learned do not occur there
at all — an internal sender domain, an SI+BL attachment pair, the coded subject
formats. Expect most ordinary mail to land in **General** or **Spam**.

The confidence gate in the pipeline above keeps that from becoming confidently
wrong, but it does not make the answer right. The real fix is retraining on
labelled real mail in `sdoc_classifier/extra_data/train_handwritten.json`, which
the training code picks up automatically and weights ×5. The threshold itself
lives in `sdoc_classifier/src/config.py`.

Google sign-in is limited to accounts on the OAuth test-user list. The demo
account exists so nobody has to be added to browse the product.

## Documentation

| Document                         | For                                                        |
| -------------------------------- | ---------------------------------------------------------- |
| [LOCAL.md](LOCAL.md)             | Running it on your machine: setup, env vars, troubleshooting |
| [DEPLOYMENT.md](DEPLOYMENT.md)   | Production: Google Cloud, Vercel, hosting the ML service   |
| `sdoc_classifier/README.md`      | The email category model                                   |
| `sdoc_comparator/README.md`      | The SI-vs-BL comparator                                    |
