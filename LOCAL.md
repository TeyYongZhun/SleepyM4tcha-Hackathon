# Running WayBoxAI locally

For what the project is, see [README.md](README.md). For the deployed site, see
[DEPLOYMENT.md](DEPLOYMENT.md).

The app is **two processes**: the Next.js website, and a Python service that runs
the two models. Open **two terminals**, both in the project root — the folder with
`package.json`, not its parent.

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

> Use `localhost`, not `127.0.0.1`, or Google sign-in rejects the redirect. If you
> see `Port 3000 is in use ... using available port 3001 instead`, **stop and free
> port 3000** (see [Troubleshooting](#troubleshooting)): Google OAuth is registered
> for 3000 only.

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

Without this service the website still runs, but classification falls back to
keyword rules and comparison uses the website's built-in copy of the comparison
rules.

## Which inbox you get

Two variables in `.env.local` decide this. They interact: setting
`BACKEND_API_URL` switches the Gmail path off entirely.

| `BACKEND_API_URL`       | `CLASSIFIER_API_URL`    | What you see                         |
| ----------------------- | ----------------------- | ------------------------------------ |
| *(empty)*               | `http://localhost:8000` | **Your real Gmail**, classified live |
| `http://localhost:8000` | *(ignored)*             | The seeded 520-email dataset         |
| *(empty)*               | *(empty)*               | Your real Gmail, keyword rules only  |

Restart `npm run dev` after changing either. **For judging, prefer the seeded
dataset**: it is what the models were trained on and where the results in the
README come from. **No Google credentials at all?** Set only `AUTH_SECRET` and
click **Try the demo**.

## Stopping, and scripts

Press **Ctrl+C** in each terminal. If a port is stuck, see
[Troubleshooting](#troubleshooting).

| Command         | What it does                       |
| --------------- | ---------------------------------- |
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

Put them in **`.env.local`** in the project root, next to `package.json`. It is
git-ignored; start from `.env.example`. One `NAME=value` per line, no quotes and
no spaces around `=`. They are read at startup, so **restart `npm run dev`** after
changing them.

| Variable             | Required         | Default                 | What it does                                                                                                                                                                                                                              |
| -------------------- | ---------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AUTH_SECRET`        | Yes              | –                       | Random string that signs login sessions. Generate with `npx auth secret`. Use a different one per environment.                                                                                                                             |
| `AUTH_GOOGLE_ID`     | For Google login | –                       | OAuth client ID from Google Cloud (see "Setting up Google sign-in").                                                                                                                                                                       |
| `AUTH_GOOGLE_SECRET` | For Google login | –                       | OAuth client secret from the same place. Keep it private.                                                                                                                                                                                  |
| `BACKEND_API_URL`    | No               | empty                   | The gateway's origin, e.g. `http://localhost:8000`. **Empty = the app reads the signed-in user's Gmail itself.** Set = every email comes from the gateway's seeded inbox instead.                                                          |
| `CLASSIFIER_API_URL` | No               | empty                   | Where `POST /classify` and `POST /compare` live, normally `http://localhost:8000`. Used **only on the Gmail path**. Unset or unreachable falls back to keyword rules rather than failing.                                                  |
| `GEMINI_API_KEY`     | No               | empty                   | Lets the **AI Draft** switch have Gemini write the reply ([get a key](https://aistudio.google.com/apikey)). The email's text is sent to Google, and only when you press Reply with the switch on. Without a key a rule-based draft is used. |
| `GEMINI_MODEL`       | No               | `gemini-3.5-flash-lite` | Which Gemini model writes the drafts.                                                                                                                                                                                                      |
| `ENABLE_DEMO`        | No               | `true`                  | The "Try the demo" login. Set to exactly `false` to turn it off. Any other value leaves it on.                                                                                                                                             |

Two more exist for testing and tuning; leave them unset normally: `GMAIL_API_URL`
points the Gmail source at a fake server, and `GMAIL_MIN_INTERVAL_MS` (default 25)
sets the gap between Gmail requests.

## Setting up Google sign-in

Only needed for a real Gmail inbox.

1. In [Google Cloud Console](https://console.cloud.google.com) create a project
   and enable the **Gmail API**.
2. **OAuth consent screen**: user type External. Add the scope
   `.../auth/gmail.modify`. While the app is in *Testing* status, add every Google
   account that will sign in under **Test users**, otherwise Google shows "access
   blocked".
3. **Credentials > Create credentials > OAuth client ID > Web application.** Add
   the authorised redirect URI `http://localhost:3000/api/auth/callback/google`.
4. Copy the client ID and secret into `.env.local`.
5. Google shows a "hasn't verified this app" warning in Testing mode. Click
   **Advanced**, then **Continue**.

For the production equivalent, see [DEPLOYMENT.md](DEPLOYMENT.md).

## Reference

### Where the emails come from

`src/lib/emails.ts` picks the source, in this order:

1. **Demo account** → the sample inbox in `public/dummy` (520 emails, 250
   attachment files).
2. **`BACKEND_API_URL` set** → the gateway's seeded inbox.
3. **Signed in with Google, no backend** → the user's own **Gmail inbox**
   (`src/lib/gmail/`), fetched **50 messages at a time, on demand**. Nothing is
   fetched ahead of time, which keeps a big inbox well inside Gmail's quota of
   15,000 units per minute per user. Loaded messages are kept for an hour,
   requests are paced, and a quota error waits and retries.
4. Otherwise → the built-in mock emails.

The demo, mock and backend sources hold their whole list, so the server filters by
tab and then slices: tab counts and "1-50 of 137" are exact. Gmail can't do that
without reading everything, so each tab filters the 50 messages on screen
(stepping on to the next page if that has nothing to show) and the tab numbers
come from the background count of the newest 1,000.

For Gmail, `src/lib/gmail/enrich.ts` calls the classifier (`POST /classify`), and
`src/lib/gmail/attachments.ts` works out from their contents which attachment is
the SI and which the BL, then calls the comparator (`POST /compare`) when there is
exactly one of each. If the ML service is down both fall back to the website's own
rules, so the inbox still renders.

**Attachments are never stored.** The email carries a URL like
`/api/attachments/<emailId>/<partId>`; when the browser opens it, the route asks
Gmail for that one file with the user's token and passes it through. Only images,
PDFs and plain text open inline; everything else downloads, and files are served
with a sandbox CSP so a hostile attachment cannot run scripts on your origin.

### The demo account

**Try the demo** logs in as a fake "Demo User" and browses `public/dummy/inbox`.
The dummy data carries no labels, so `src/lib/demo/classify.ts` assigns categories
with keyword rules tuned against the ground truth; they are fitted to the
organisers' templates, so read that as "the no-backend demo looks right", not as a
second classifier. `src/lib/demo/parse.ts` and `extract.ts` read SI/BL fields from
the email text and the `.txt` / `.pdf` / `.docx` / `.xlsx` attachments, and
`compare.ts` gives the verdict. Some sample PDFs are deliberately corrupt or
scanned, to show the "couldn't be read" state. Reply works on a timer here, since
there is no Sent mail to check.

### Importing your own sample data

The demo account's menu has **Import data**: two zips, one of inbox `.json` records
and one of the attachments they name. Whatever is imported replaces the bundled
sample entirely, and **Reset to sample data** puts the 520 emails back. Locally the
files land in `public/import/` (git-ignored).

Full details — zip layout, the record shape, storage on a deployed app, and the API —
are in [IMPORT.md](IMPORT.md).

### The gateway API

`backend/app.py` serves these to the website. Types are in `src/lib/types.ts`, and
`src/lib/api/adapters.ts` validates every response.

| Route                              | What it returns                                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `GET /health`                      | `{status, emails}`                                                                                                       |
| `GET /emails`                      | The seeded inbox, classified. Category and summary only, no attachment parsing (the website's client gives up after 15 s) |
| `GET /emails/{id}`                 | One email, plus its SI-vs-BL comparison                                                                                  |
| `GET /api/demo-attachments/{name}` | One seeded attachment file                                                                                               |
| `POST /classify`                   | One message → `{category, confidence, model_category, low_confidence, summary}`                                          |
| `POST /compare`                    | An SI and a BL file → `{status, review_reason, defect_fields, shipment_comparison}`                                      |

A `BL_COMPARISON` email with no attachments at all still comes back
`NEEDS_REVIEW` / `missing_attachment` when its body says documents are attached.

| Per-email field                                            | Meaning                                                                                            |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `email_id`, `from`, `to`, `subject`, `body`, `received_at` | The email itself. `body_type` is `html` or `text`                                                  |
| `attachments`                                              | `[{ id, filename, mime_type, size, url }]`                                                         |
| `category`                                                 | `BL_COMPARISON`, `SI_REQUEST`, `INVOICE_QUERY`, `GENERAL` or `SPAM`                                |
| `summary`                                                  | `{ headline, summary, confidence, reason, fields[], actions[], sentiment }`                        |
| `shipment_info`, `shipment_documents`                      | Fields stated in the email text; and the SI/BL documents found, each with its fields               |
| `status`, `review_reason`, `defect_fields`                 | The verdict (`OK`, `MISMATCH`, `NEEDS_REVIEW`), why a person is needed, and the fields that differ |
| `shipment_comparison`                                      | `[{ field, si_value, bl_value, status }]`, status `match`, `mismatch` or `unsure`                  |

### Project structure

| Path                                            | What                                                                                                                                                      |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/`                                      | Pages (landing, login, dashboard) and API routes: `inbox/` (pages, counts, mark read), `attachments/`, `draft/`, `reply-status/`, `reply-bounce/`, `auth/` |
| `src/auth.ts`                                   | Auth.js: Google (Gmail scope, token refresh) and the demo login                                                                                           |
| `src/lib/emails.ts`                             | Chooses the source: demo, backend, Gmail, or mock                                                                                                         |
| `src/lib/gmail/`                                | Gmail source: paged inbox, tab counts, parsing, attachments, read memory                                                                                  |
| `src/lib/api/`                                  | Backend routing and response validation                                                                                                                   |
| `src/lib/demo/`                                 | Demo loader, keyword classifier and comparison, plus document readers Gmail shares                                                                        |
| `src/lib/summarize.ts`, `draft.ts`, `gemini.ts` | The local TL;DR, and reply drafts (Gemini or rule-based)                                                                                                  |
| `src/lib/notifications.ts`, `resolved.ts`, `read-state.ts` | Browser-held state, kept per account                                                                                                           |
| `src/components/`                               | Inbox list, summary panel, shipment checklist, reply bar, toasts, and the rest of the UI                                                                  |
| `public/dummy/`, `public/mock/`                 | Sample emails and attachments                                                                                                                             |

Contributors: this is not the Next.js of older tutorials. `AGENTS.md` says to read
the guide in `node_modules/next/dist/docs/` (after `npm install`) before writing
code.

## Troubleshooting

| Symptom                                                                             | Fix                                                                                                                                                                    |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `redirect_uri_mismatch`                                                             | The URI in Google Cloud must exactly match `http://localhost:3000/api/auth/callback/google`                                                                             |
| "Access blocked" / `access_denied`                                                  | Add your account under Test users on the OAuth consent screen                                                                                                          |
| `MissingSecret` error                                                               | `AUTH_SECRET` is empty in `.env.local`                                                                                                                                 |
| Env changes have no effect                                                          | Restart `npm run dev`                                                                                                                                                  |
| Sent back to the landing page after login                                           | The Google refresh token failed. Sign out and sign in again                                                                                                            |
| `Port 3000 is in use ... using 3001`                                                | Free the port, don't accept 3001. See below                                                                                                                            |
| `Jest worker encountered N child process exceptions`                                | A stale dev server whose workers died. Restart it                                                                                                                      |
| `FATAL: An unexpected Turbopack error occurred`, or every page 500s on a fresh start | Corrupt build cache. `rm -rf .next` and restart; it is regenerated and git-ignored                                                                                     |
| Inbox shows the 520 sample emails, not your real mail                               | `BACKEND_API_URL` is set. Blank it and restart to read Gmail                                                                                                           |
| Categories look wrong / everything is General                                        | The ML service isn't running, so it fell back to keyword rules. Start terminal 2                                                                                       |
| No SI/BL comparison on a Gmail email                                                | Needs exactly one readable SI **and** one readable BL attachment. With the ML service down you get the built-in comparison instead of the model's                       |
| Tab numbers show "N+" or keep filling in                                            | Normal on a big inbox: only the newest 1,000 messages are counted, in the background                                                                                   |
| Sample PDFs report "couldn't be read" on Windows                                    | A clone made before `.gitattributes` existed: Git rewrote line endings inside the PDFs and shifted their internal offsets. Repair with `git rm --cached -r . && git reset --hard` |
| AI Draft is a short generic reply                                                   | No `GEMINI_API_KEY`, or the Gemini call failed, so the rule-based draft was used                                                                                        |
| `403 insufficient authentication scopes`                                            | Gmail API not enabled, or `gmail.modify` missing from the consent screen, or Google reused an old grant. Revoke it at myaccount.google.com/permissions and sign in again |

**Freeing a stuck port** (PowerShell):

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```
