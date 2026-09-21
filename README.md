# WayBoxAI

**AI email triage for logistics.** WayBoxAI is the web frontend for a system that reads the mail coming in from carriers, freight forwarders and customs brokers, sorts every message, and shows it next to an AI summary so a person can act in seconds.

Built for the Averis x Monash Hackathon 2026.

## What it does

- **Sign in with Google**, or click **Try the demo** to explore without any credentials.
- **Filter the inbox**: All, BL Comparison, SI Request, Invoice Query, General, Spam — the five categories the classifier predicts, each with a live count.
- **Paged list**: 50 messages a page with **← Newer / Older →** at the bottom, like Gmail. Pages load on demand, so a big inbox is never fetched in bulk.
- **Three-pane dashboard**: inbox list on the left, the full email in the middle (text or HTML body, images, PDFs and text files previewed inline, attachments you can minimize), and a summary on the right.
- **Shipment document checks** at the top of the summary, on every email:
  - is there a Shipping Instruction (SI)? a Bill of Lading (BL)?
  - does it carry the 14 mandatory SI fields (Shipper/Exporter, Consignee, Notify Party, ports, containers, weight, vessel, voyage, goods, HS code, booking ref, OC No., freight)?
  - a field-by-field table of what the SI, BL and the email text each say, with anything missing flagged in red.
- **Resizable split** between the email and the summary, and a **light/dark mode** toggle. Both are remembered.
- **Responsive**: on phones the list, email and summary stack.

## Tech stack

**Website:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Auth.js (`next-auth` v5) for Google login, Lucide icons.

**ML services:** Python 3.13, FastAPI, scikit-learn. The classifier is a balanced logistic regression over TF-IDF plus engineered flags; the comparator extracts document fields with a trained label classifier, then compares them with deterministic normalisation rules.

## Running it

The app is **two processes**: the Next.js website, and a Python service that
runs the two ML models. Open **two terminals**, both in the project root
(`SleepyM4tcha-Hackathon/` — the folder with `package.json`, not its parent).

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

> Use `localhost`, not `127.0.0.1`, or Google sign-in rejects the redirect.
> If you see `Port 3000 is in use ... using available port 3001 instead`, **stop
> and free port 3000** (see Troubleshooting) — Google OAuth is registered for
> 3000 only, so sign-in breaks on any other port.

### Terminal 2 — the ML service

```bash
.venv/Scripts/python.exe -m uvicorn backend.app:app --port 8000
```

Wait for `Uvicorn running on http://127.0.0.1:8000`. Check it with:

```bash
curl http://localhost:8000/health        # {"status":"ok","emails":520}
```

This one serves the email classifier (`sdoc_classifier/`) and the SI-vs-BL
comparator (`sdoc_comparator/`). Without it the website still runs, but
classification silently falls back to keyword rules and no document comparison
happens.

**On Windows PowerShell** use backslashes: `.venv\Scripts\python.exe -m uvicorn ...`

### Which inbox you get

Two variables in `.env.local` decide this. They interact — setting
`BACKEND_API_URL` switches the Gmail path off entirely:

| `BACKEND_API_URL`       | `CLASSIFIER_API_URL`      | What you see                                 |
| ----------------------- | ------------------------- | -------------------------------------------- |
| *(empty)*               | `http://localhost:8000` | **Your real Gmail**, classified live         |
| `http://localhost:8000` | *(ignored)*               | The seeded 520-email dataset                 |
| *(empty)*               | *(empty)*                 | Your real Gmail, keyword rules only          |

Restart `npm run dev` after changing either — env vars are read at startup.

**For a demo, prefer the seeded dataset.** It is what the models were trained
on: the classifier scores 520/520 on it and `email_004` shows a real SI-vs-BL
mismatch. On a personal inbox the classifier is out of its depth (see
"Classification on real mail" below).

**No Google credentials at all?** Set only `AUTH_SECRET` and click **Try the
demo** — no Google needed, and it browses the 520 sample emails in
`public/dummy`.

### Stopping

Press **Ctrl+C** in each terminal. If a port is stuck, see Troubleshooting.

### Scripts

| Command           | What it does                       |
| ----------------- | ---------------------------------- |
| `npm run dev`   | Development server with hot reload |
| `npm run build` | Production build                   |
| `npm start`     | Serve the production build         |
| `npm run lint`  | ESLint                             |

### The ML side

```bash
cd sdoc_classifier && ../.venv/Scripts/python.exe -m pytest      # 25 tests
cd sdoc_classifier && ../.venv/Scripts/python.exe -m src.train    # retrain the classifier
cd sdoc_comparator && ../.venv/Scripts/python.exe src/main.py     # run the comparison demo
```

## Environment variables

### Where they go

Put them in **`.env.local`** in the project root, next to `package.json`. It is
git-ignored; start from `.env.example`.

One `NAME=value` per line, no quotes and no spaces around `=`. They are read at
startup, so **restart `npm run dev`** after changing them.

```shell
# .env.local
AUTH_SECRET=...
AUTH_GOOGLE_ID=...
AUTH_GOOGLE_SECRET=...
BACKEND_API_URL=
CLASSIFIER_API_URL=http://localhost:8000
ENABLE_DEMO=false
```

### Reference

| Variable               | Required         | Default  | What it does                                                                                                                                                                                                 |
| ---------------------- | ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AUTH_SECRET`        | Yes              | -        | Random string that signs login sessions. Generate with`npx auth secret`. Use a different one per environment.                                                                                              |
| `AUTH_GOOGLE_ID`     | For Google login | -        | OAuth client ID from Google Cloud (see "Setting up Google sign-in").                                                                                                                                         |
| `AUTH_GOOGLE_SECRET` | For Google login | -        | OAuth client secret from the same place. Keep it private.                                                                                                                                                    |
| `BACKEND_API_URL`    | No               | empty    | The gateway's origin, e.g.`http://localhost:8000`. **Empty = the app reads the signed-in user's Gmail itself.** Set = every email comes from the gateway's seeded inbox instead. |
| `CLASSIFIER_API_URL` | No               | empty    | Where`POST /classify` and `POST /compare` live, normally `http://localhost:8000`. Used **only on the Gmail path**, to classify real messages and compare their SI/BL attachments. Unset or unreachable falls back to keyword rules rather than failing. |
| `ENABLE_DEMO`        | No               | `true` | The "Try the demo" login and its sample inbox. Set to exactly`false` to turn it off (the button disappears and the demo login is rejected). Any other value leaves it on.                                  |

Open the app at `http://localhost:3000`, not `127.0.0.1` — Google matches the
redirect URI exactly.

There is also `GMAIL_API_URL`, which points the Gmail source at a fake server for automated tests. Leave it unset.

## Setting up Google sign-in

1. In [Google Cloud Console](https://console.cloud.google.com) create a project and enable the **Gmail API**.
2. **OAuth consent screen**: user type External. Add the scope `.../auth/gmail.modify` (read access, plus the one change the app makes: clearing the *unread* mark on an email you open).
   While the app is in *Testing* status, add every Google account that will sign in under **Test users**, otherwise Google shows "access blocked".
3. **Credentials > Create credentials > OAuth client ID > Web application.** Add these authorised redirect URIs:
   - `http://localhost:3000/api/auth/callback/google`
4. Copy the client ID and secret into `.env.local`.
5. Google shows a "hasn't verified this app" warning in Testing mode. Click Advanced, then Continue.

## The demo account

**Try the demo** logs in as a fake "Demo User" and browses the emails in `public/dummy/inbox` (attachments in `public/dummy/attachments`).

The dummy data carries no labels, so `src/lib/demo/classify.ts` assigns categories with keyword rules. Those rules are tuned against `sdoc_classifier/data/ground_truth.json` and currently agree with it on all 520 — but they are fitted to the organiser's templates, so read that as "the no-backend demo looks right", not as a second classifier.

`src/lib/demo/parse.ts` and `extract.ts` read SI/BL fields out of the email text and the `.txt` / `.pdf` / `.docx` / `.xlsx` attachments. Despite living under `demo/`, the readers in `extract.ts` are shared — `src/lib/gmail/attachments.ts` uses the same ones for real Gmail attachments.

Two of the sample PDFs are deliberately corrupt and a few are scanned images, to show the "couldn't be read" state.

## Where the emails come from

`src/lib/emails.ts` picks the source, in this order:

1. **Demo account** → the sample inbox in `public/dummy`.
2. **`BACKEND_API_URL` set** → your backend (next section).
3. **Signed in with Google, no backend** → the user's own **Gmail inbox** (`src/lib/gmail/`). This one is genuinely fetched **50 messages at a time, on demand**: the dashboard opens with page 1 and **Older** fetches the next page only when you press it. Nothing is fetched ahead of time, which keeps a big inbox well inside Gmail's quota of 15,000 units per minute per user. Loaded messages are kept in memory for 10 minutes, so paging back and forth or reopening an email costs no Gmail calls; requests are also paced, and a quota error waits and retries.
4. Otherwise → the built-in mock emails.

**The list is paged for every source** (`src/lib/paging.ts`, 50 a page). The demo, mock and backend sources already hold their whole list, so for them the server filters by the selected tab first and then slices, and the tab counts and "1-50 of 137" are exact. Gmail can't do that without downloading everything, so its tabs filter only the page on screen.

**Attachments are never stored.** The email carries a URL like `/api/attachments/<emailId>/<partId>`; when the browser opens it, `src/app/api/attachments/` asks Gmail for that one file with the user's token and passes it through. Only images, PDFs and plain text open inline; everything else (HTML, Office files...) downloads, and files are served with a sandbox CSP so a hostile attachment can't run scripts on your origin.

Gmail has no categories, summaries or SI/BL fields, so `src/lib/gmail/enrich.ts` fills them in by calling the real classifier at `CLASSIFIER_API_URL` (`POST /classify`), and `src/lib/gmail/attachments.ts` reads the attachments and asks for the SI-vs-BL comparison (`POST /compare`). If that service is unset or down it falls back to the demo's keyword rules, so the inbox still renders.

Limits to know about: with Gmail the category tabs (BL Comparison, Spam, ...) filter the 50 messages of the page you are viewing and show no counts, because classifying the whole inbox would mean downloading all of it.

## The gateway API

`backend/app.py` serves these to the website. The full types are in
`src/lib/types.ts`, and `src/lib/api/adapters.ts` validates every response.

| Route                  | What it returns                                                              |
| ---------------------- | ---------------------------------------------------------------------------- |
| `GET /health`        | `{status, emails}` — a quick check that the service is up                    |
| `GET /emails`        | The seeded inbox, classified. Category and summary only, no attachment parsing |
| `GET /emails/{id}`   | One email, plus its SI-vs-BL comparison                                      |
| `POST /classify`     | One message → `{category, confidence, model_category, low_confidence, summary}` |
| `POST /compare`      | An SI and a BL file → `{status, review_reason, defect_fields, shipment_comparison}` |

Requests from the website run server-side and send
`Authorization: Bearer <the user's Google access token>`.

### Per-email fields

| Field                                                                  | Meaning                                                                                        |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `email_id`, `from`, `to`, `subject`, `body`, `received_at` | The email itself.`body_type` is `html` or `text`                                         |
| `attachments`                                                        | `[{ id, filename, mime_type, size, url }]`. Images and PDFs are previewed from `url`       |
| `category`                                                           | `BL_COMPARISON`, `SI_REQUEST`, `INVOICE_QUERY`, `GENERAL` or `SPAM` (case-insensitive) |
| `summary`                                                            | `{ headline, summary, confidence, reason, fields[], actions[], sentiment }`                  |
| `shipment_info`                                                      | Shipment fields stated in the email text, e.g.`{ shipper, consignee, port_of_loading, ... }` |
| `shipment_documents`                                                 | `[{ kind: "SI" or "BL" or "OTHER", filename, readable, fields }]`                            |

The full types are in `src/lib/types.ts`. The adapter also accepts a few alternative spellings, so slightly different field names still render while the contract settles.

## Project structure

Three components, merged from three branches:

| Path                  | What                                                                       |
| --------------------- | -------------------------------------------------------------------------- |
| `src/`              | The Next.js website (this README's main subject)                           |
| `sdoc_classifier/`  | Email category model — sorts mail into the five categories                  |
| `sdoc_comparator/`  | SI-vs-BL document comparison — finds mismatched fields                      |
| `backend/`          | FastAPI gateway that serves both models to the website (`backend/app.py`) |

Inside the website:

| Path                                        | What                                                                                   |
| ------------------------------------------- | -------------------------------------------------------------------------------------- |
| `src/app/page.tsx`                        | Landing page                                                                           |
| `src/app/login/page.tsx`                  | Sign-in page (Google + demo)                                                           |
| `src/app/dashboard/[category]/layout.tsx` | Dashboard for a filter, with the persistent inbox list (left pane)                     |
| `src/app/dashboard/[category]/[emailId]/` | Email (middle pane) and summary (right pane)                                           |
| `src/app/globals.css`                     | Design tokens (colours, fonts) with light and dark values                              |
| `src/auth.ts`                             | Auth.js: Google (Gmail scope, token refresh) and the demo login              |
| `src/lib/api/`                            | Backend routing:`routes.ts`, `adapters.ts`, `client.ts`                          |
| `src/lib/emails.ts`                       | Chooses the source: demo inbox, backend (if`BACKEND_API_URL` is set), Gmail, or mock |
| `src/lib/gmail/`                          | Gmail source: load the whole inbox, parse messages, fetch one attachment               |
| `src/lib/gmail/enrich.ts`                 | Classifies one Gmail message via `POST /classify` (keyword rules as fallback)        |
| `src/lib/gmail/attachments.ts`            | Reads Gmail attachments and runs the SI/BL comparison via `POST /compare`            |
| `src/app/api/inbox/`                      | One page (50) of the inbox for a tab, called by Older / Newer (all sources)            |
| `src/app/api/attachments/`                | Streams one Gmail attachment on demand (nothing stored)                                |
| `src/lib/types.ts`                        | `Email`, `Attachment`, `EmailSummary`, shipment types                            |
| `src/lib/shipment.ts`                     | The 14 mandatory SI fields and the SI / BL / structure checks (display only)           |
| `src/lib/categories.ts`                   | The filter tabs and their colours                                                      |
| `src/lib/user.ts`                         | `getUserInfo()` on the server; `useUserInfo()` in client components                |
| `src/lib/demo/`                           | Dummy-inbox loader and keyword classifier (demo), plus the document readers in `extract.ts`, which Gmail shares |
| `src/components/summary-panel.tsx`        | Right pane: shipment checks, then classification, key details, TL;DR, actions          |
| `src/components/shipment-checklist.tsx`   | The SI / BL / structure checks and the field table                                     |
| `src/components/inbox-pane.tsx`           | Left pane list                                                                         |
| `src/components/resizable-split.tsx`      | Draggable divider between the email and summary                                        |
| `src/components/theme-toggle.tsx`         | Light/dark switch (applied before first paint by a script in`layout.tsx`)            |
| `public/dummy/`, `public/mock/`         | Sample emails and attachments                                                          |

## Troubleshooting

| Symptom                                   | Fix                                                                                          |
| ----------------------------------------- | -------------------------------------------------------------------------------------------- |
| `redirect_uri_mismatch`                 | The URI in Google Cloud must exactly match`http://localhost:3000/api/auth/callback/google` |
| "Access blocked" /`access_denied`       | Add your account under Test users on the OAuth consent screen                                |
| `MissingSecret` error                   | `AUTH_SECRET` is empty in `.env.local`                                                   |
| Env changes have no effect                | Restart`npm run dev`                                                                       |
| Sent back to the landing page after login | The Google refresh token failed. Sign out and sign in again                                  |
| `Port 3000 is in use ... using 3001`    | Free the port, don't accept 3001 — Google OAuth only allows 3000. See below                |
| `Jest worker encountered N child process exceptions` | A stale dev server whose workers died. Restart it — this is not a code error   |
| `FATAL: An unexpected Turbopack error occurred`, or every page 500s on a fresh start | Corrupt build cache. `rm -rf .next` and restart. It is regenerated, and gitignored, so deleting it is always safe |
| Inbox shows the 520 sample emails, not your real mail | `BACKEND_API_URL` is set. Blank it and restart to read Gmail                 |
| Categories look wrong / everything is General | The ML service isn't running, so it fell back to keyword rules. Start terminal 2   |
| No SI/BL comparison on a Gmail email      | Needs exactly one SI **and** one BL attachment, and `CLASSIFIER_API_URL` set          |
| `403 insufficient authentication scopes` | Gmail API not enabled, or `gmail.modify` missing from the consent screen, or Google reused an old grant (an old sign-in only has read access, so opening an email can't clear its unread mark until you sign in again) — revoke it at myaccount.google.com/permissions and sign in again |

**Freeing a stuck port** (PowerShell):

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

## Classification on real mail

The classifier is trained on 520 generated emails built from a handful of
templates. On the seeded dataset it scores 520/520. On a **personal** inbox it
is out of its depth, because several of the features it learned do not occur
there at all — an internal `aprilasia.com` sender, an SI+BL attachment pair,
the coded subject formats. Expect most ordinary mail to land in **General** or
**Spam**.

Predictions below `LOW_CONFIDENCE_THRESHOLD` (0.55, in
`sdoc_classifier/src/config.py`) are reported as `GENERAL` rather than a
confident wrong answer, with the model's original guess kept in
`model_category`. That helps, but does not fix it: the real fix is retraining
on labelled real mail in `sdoc_classifier/extra_data/train_handwritten.json`,
which the training code picks up automatically and weights ×5.
