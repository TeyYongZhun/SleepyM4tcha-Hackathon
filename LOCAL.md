# Running WayBoxAI locally

For what the project is, see [README.md](README.md). For the deployed site, see
[DEPLOYMENT.md](DEPLOYMENT.md).

The app is **two processes**: the Next.js website, and a Python service that runs
the two ML models. Open **two terminals**, both in the project root — the folder
with `package.json`, not its parent.

## One-time setup

You need **Node 20+** and **Python 3.13+**.

```bash
npm install                                  # website dependencies
py -3.13 -m venv .venv                       # Python environment
.venv/Scripts/python.exe -m pip install -r requirements.txt
cp .env.example .env.local                   # then fill it in, see "Environment variables"
```

## Terminal 1 — the website

```bash
npm run dev
```

Wait for `✓ Ready in ...`, then open **<http://localhost:3000>**.

> Use `localhost`, not `127.0.0.1`, or Google sign-in rejects the redirect.
> If you see `Port 3000 is in use ... using available port 3001 instead`, **stop
> and free port 3000** (see [Troubleshooting](#troubleshooting)) — Google OAuth is
> registered for 3000 only, so sign-in breaks on any other port.

## Terminal 2 — the ML service

```bash
.venv/Scripts/python.exe -m uvicorn backend.app:app --port 8000
```

On **Windows PowerShell** use backslashes:
`.venv\Scripts\python.exe -m uvicorn backend.app:app --port 8000`

Wait for `Uvicorn running on http://127.0.0.1:8000`, then check it:

```bash
curl http://localhost:8000/health        # {"status":"ok","emails":520}
```

This serves the email classifier (`sdoc_classifier/`) and the SI-vs-BL comparator
(`sdoc_comparator/`). Without it the website still runs, but classification
silently falls back to keyword rules and no document comparison happens.

## Which inbox you get

Two variables in `.env.local` decide this. They interact — setting
`BACKEND_API_URL` switches the Gmail path off entirely:

| `BACKEND_API_URL`       | `CLASSIFIER_API_URL`    | What you see                         |
| ----------------------- | ----------------------- | ------------------------------------ |
| *(empty)*               | `http://localhost:8000` | **Your real Gmail**, classified live |
| `http://localhost:8000` | *(ignored)*             | The seeded 520-email dataset         |
| *(empty)*               | *(empty)*               | Your real Gmail, keyword rules only  |

Restart `npm run dev` after changing either — env vars are read at startup.

**For a demo, prefer the seeded dataset.** It is what the models were trained on:
the classifier scores 520/520 on it and `email_004` shows a real SI-vs-BL
mismatch.

**No Google credentials at all?** Set only `AUTH_SECRET` and click **Try the
demo** — no Google needed, and it browses the 520 sample emails in `public/dummy`.

## Stopping

Press **Ctrl+C** in each terminal. If a port is stuck, see
[Troubleshooting](#troubleshooting).

## Scripts

| Command         | What it does                       |
| --------------- | ---------------------------------- |
| `npm run dev`   | Development server with hot reload |
| `npm run build` | Production build                   |
| `npm start`     | Serve the production build         |
| `npm run lint`  | ESLint                             |

## The ML side

```bash
cd sdoc_classifier && ../.venv/Scripts/python.exe -m pytest      # 25 tests
cd sdoc_classifier && ../.venv/Scripts/python.exe -m src.train   # retrain the classifier
cd sdoc_comparator && ../.venv/Scripts/python.exe src/main.py    # run the comparison demo
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
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.5-flash-lite
ENABLE_DEMO=true
```

### Reference

| Variable             | Required         | Default | What it does                                                                                                                                                                 |
| -------------------- | ---------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH_SECRET`        | Yes              | –       | Random string that signs login sessions. Generate with `npx auth secret`. Use a different one per environment.                                                                |
| `AUTH_GOOGLE_ID`     | For Google login | –       | OAuth client ID from Google Cloud (see "Setting up Google sign-in").                                                                                                          |
| `AUTH_GOOGLE_SECRET` | For Google login | –       | OAuth client secret from the same place. Keep it private.                                                                                                                     |
| `BACKEND_API_URL`    | No               | empty   | The gateway's origin, e.g. `http://localhost:8000`. **Empty = the app reads the signed-in user's Gmail itself.** Set = every email comes from the gateway's seeded inbox.     |
| `CLASSIFIER_API_URL` | No               | empty   | Where `POST /classify` and `POST /compare` live, normally `http://localhost:8000`. Used **only on the Gmail path**. Unset or unreachable falls back to keyword rules.          |
| `GEMINI_API_KEY`     | No               | –       | The **AI Draft** switch. Without it, replies use a rule-based template. Get one at <https://aistudio.google.com/apikey>. The TL;DR needs no key — it is written locally.       |
| `GEMINI_MODEL`       | No               | `gemini-3.5-flash-lite` | Which model writes the drafts.                                                                                                                                |
| `ENABLE_DEMO`        | No               | `true`  | The "Try the demo" login and its sample inbox. Set to exactly `false` to turn it off. Any other value leaves it on.                                                            |

There is also `GMAIL_API_URL`, which points the Gmail source at a fake server for
automated tests. Leave it unset.

## Setting up Google sign-in

1. In [Google Cloud Console](https://console.cloud.google.com) create a project
   and enable the **Gmail API**.
2. **OAuth consent screen**: user type External. Add the Gmail scope the app
   requests (see `src/auth.ts`). While the app is in *Testing* status, add every
   Google account that will sign in under **Test users**, otherwise Google shows
   "access blocked".
3. **Credentials > Create credentials > OAuth client ID > Web application.** Add
   this authorised redirect URI:
   - `http://localhost:3000/api/auth/callback/google`
4. Copy the client ID and secret into `.env.local`.
5. Google shows a "hasn't verified this app" warning in Testing mode. Click
   **Advanced**, then **Continue**.

For the production equivalent, see [DEPLOYMENT.md](DEPLOYMENT.md).

## The demo account

**Try the demo** logs in as a fake "Demo User" and browses the emails in
`public/dummy/inbox` (attachments in `public/dummy/attachments`).

The dummy data carries no labels, so `src/lib/demo/classify.ts` assigns categories
with keyword rules. Those rules are tuned against
`sdoc_classifier/data/ground_truth.json` and currently agree with it on all 520 —
but they are fitted to the organiser's templates, so read that as "the no-backend
demo looks right", not as a second classifier.

`src/lib/demo/parse.ts` and `extract.ts` read SI/BL fields out of the email text
and the `.txt` / `.pdf` / `.docx` / `.xlsx` attachments. Despite living under
`demo/`, the readers in `extract.ts` are shared — `src/lib/gmail/attachments.ts`
uses the same ones for real Gmail attachments.

Two of the sample PDFs are deliberately corrupt and a few are scanned images, to
show the "couldn't be read" state.

## Per-email fields

| Field                                                     | Meaning                                                                                |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `email_id`, `from`, `to`, `subject`, `body`, `received_at` | The email itself. `body_type` is `html` or `text`                                      |
| `attachments`                                             | `[{ id, filename, mime_type, size, url }]`. Images and PDFs are previewed from `url`   |
| `category`                                                | `BL_COMPARISON`, `SI_REQUEST`, `INVOICE_QUERY`, `GENERAL` or `SPAM` (case-insensitive) |
| `summary`                                                 | `{ headline, summary, confidence, reason, fields[], actions[], sentiment }`             |
| `shipment_info`                                           | Shipment fields stated in the email text, e.g. `{ shipper, consignee, ... }`           |
| `shipment_documents`                                      | `[{ kind: "SI" or "BL" or "OTHER", filename, readable, fields }]`                       |

The full types are in `src/lib/types.ts`. The adapter also accepts a few
alternative spellings, so slightly different field names still render while the
contract settles.

Note that **the list is paged for every source** (`src/lib/paging.ts`, 50 a page).
The demo, mock and backend sources already hold their whole list, so the server
filters by the selected tab first and then slices, and the tab counts and
"1–50 of 137" are exact. Gmail cannot do that without downloading everything, so
its tabs filter only the page on screen.

## Troubleshooting

| Symptom                                                                              | Fix                                                                                                                                                                       |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `redirect_uri_mismatch`                                                              | The URI in Google Cloud must exactly match `http://localhost:3000/api/auth/callback/google`                                                                                |
| "Access blocked" / `access_denied`                                                   | Add your account under Test users on the OAuth consent screen                                                                                                              |
| `MissingSecret` error                                                                | `AUTH_SECRET` is empty in `.env.local`                                                                                                                                    |
| Env changes have no effect                                                           | Restart `npm run dev`                                                                                                                                                      |
| Sent back to the landing page after login                                            | The Google refresh token failed. Sign out and sign in again                                                                                                                |
| `Port 3000 is in use ... using 3001`                                                 | Free the port, don't accept 3001 — Google OAuth only allows 3000. See below                                                                                               |
| `Jest worker encountered N child process exceptions`                                 | A stale dev server whose workers died. Restart it — this is not a code error                                                                                               |
| `FATAL: An unexpected Turbopack error occurred`, or every page 500s on a fresh start | Corrupt build cache. `rm -rf .next` and restart. It is regenerated, and gitignored, so deleting it is always safe                                                          |
| Inbox shows the 520 sample emails, not your real mail                                | `BACKEND_API_URL` is set. Blank it and restart to read Gmail                                                                                                              |
| Categories look wrong / everything is General                                         | The ML service isn't running, so it fell back to keyword rules. Start terminal 2                                                                                           |
| No SI/BL comparison on a Gmail email                                                 | Needs exactly one SI **and** one BL attachment, and `CLASSIFIER_API_URL` set                                                                                              |
| AI Draft produces a template, not a written reply                                    | `GEMINI_API_KEY` missing, or `GEMINI_MODEL` pinned to a retired model. Use `gemini-3.5-flash-lite`                                                                        |
| `403 insufficient authentication scopes`                                             | Gmail API not enabled, or the scope is missing from the consent screen, or Google reused an old grant — revoke it at myaccount.google.com/permissions and sign in again    |

**Freeing a stuck port** (PowerShell):

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```
