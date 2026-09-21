# Deploying WayBoxAI

Production: [https://wayboxai.vercel.app](https://wayboxai.vercel.app). For what the project is see
[README.md](README.md); for running it on your machine see [LOCAL.md](LOCAL.md).

One repo, two deployments:

| Platform | Builds                                    | Required |
| -------- | ----------------------------------------- | -------- |
| Vercel   | `package.json`, `src/`, `public/`         | Yes      |
| Railway  | `requirements.txt`, `backend/`, `sdoc_*/` | Optional |

---

## Step 1 — Google Cloud Console

### 1.1 Credentials

Go to `APIs & Services > Credentials > OAuth 2.0 Client IDs > your Web client`.

Add:

- **Authorised JavaScript origins**

  ```text
  https://wayboxai.vercel.app
  ```
- **Authorised redirect URIs**

  ```text
  https://wayboxai.vercel.app/api/auth/callback/google
  http://localhost:3000/api/auth/callback/google
  ```

Save, then wait a few minutes before testing.

### 1.2 Branding

Go to `Google Auth Platform > Branding`. Fill in **only** these three fields:

| Field                         | Value        |
| ----------------------------- | ------------ |
| App name                      | `WayBoxAI` |
| User support email            | your address |
| Developer contact information | your address |

Leave the homepage, privacy policy and terms URLs **empty**, and do not upload a
logo. Save.

### 1.3 Audience

Go to `Google Auth Platform > Audience`.

1. Confirm the status reads **Testing**. Do not click **Publish app**.
2. Under **Test users**, add every Google address that will sign in — yours,
   your teammates', and the judges'.
3. Add them within 7 days of the demo.

At sign-in these accounts see a "Google hasn't verified this app" warning. Click
**Advanced**, then **Continue**.

### 1.4 Enabled APIs

Go to `APIs & Services > Enabled APIs & services` and confirm the **Gmail API**
is enabled on this project.

### 1.5 Data Access

No action needed. An empty table here does not affect sign-in.

---

## Step 2 — Vercel environment variables

Go to `Vercel > your project > Settings > Environment Variables` and set:

| Variable               | Value                                                                       |
| ---------------------- | --------------------------------------------------------------------------- |
| `AUTH_SECRET`        | output of`npx auth secret`                                                |
| `AUTH_GOOGLE_ID`     | from Google Console                                                         |
| `AUTH_GOOGLE_SECRET` | from Google Console                                                         |
| `GEMINI_API_KEY`     | from[https://aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| `GEMINI_MODEL`       | `gemini-3.5-flash-lite`                                                   |
| `ENABLE_DEMO`        | `true`                                                                    |
| `CLASSIFIER_API_URL` | leave empty (or see Step 3)                                                 |
| `BACKEND_API_URL`    | leave empty                                                                 |
| `BLOB_READ_WRITE_TOKEN` | set for you by the Blob store (see Step 2.1)                             |

Then redeploy: `Deployments > ... > Redeploy`. Environment changes do not reach
deployments that already exist.

### 2.1 Blob store — needed for the demo's Import and Clear buttons

The demo account can replace the bundled 520-email sample with two zips of its own
(**Import data** in the account menu), or empty the inbox (**Clear data**). Locally those files are written to
`public/import`. A deployed app cannot do that: its filesystem is read-only, and
anything written to it would be gone on the next request anyway. The files go to
Vercel Blob instead.

Skip this and everything else still works; only Import and Clear do not, and they say so
rather than failing quietly. **Try demo data** (put the 520 sample back) and **Try the demo**
still work, since there is nothing stored to remove.

1. `Vercel > your project > Storage > Create Database > Blob`.
2. Name it and connect it to the project.
3. Vercel adds **`BLOB_READ_WRITE_TOKEN`** to the environment for you.
4. Redeploy, so the running deployment picks the variable up.

You can confirm which one is in use: signed in as the demo account,
`/api/import` reports `"storage":"blob"` once the token is there, and
`"storage":"disk"` when it is not.

Imports are limited to about 4.5 MB of zips in total on a deployed app: that is Vercel's
request-body limit for functions, and the import panel says so when it is hit. A larger data
set has to be imported on a machine running the app itself.

An import (or a Clear) is shared, not per-visitor: it changes the inbox for everyone using
the demo account until someone presses **Reset to sample data** or **Try demo data**.
Pressing **Try the demo** on the landing or sign-in page also puts the sample back, so a new
visitor never arrives at an inbox the last one cleared. Other instances of the app notice a
change within about ten seconds (the person who made it sees it at once).

Zip layout, the email record shape and the API are in [IMPORT.md](IMPORT.md).

### Choosing `ENABLE_DEMO`

This one decides whether strangers can use the site at all, so pick it
deliberately. Only the exact string `false` turns the demo off — unset, `true`,
or anything else leaves it **on**.

**`ENABLE_DEMO=true` (or unset) — the demo login is available**

- The login page shows **Try the demo** next to the Google button.
- Clicking it signs the visitor in as a fake "Demo User" with no Google account,
  no password, and no test-user list.
- They browse the 520 seeded emails in `public/dummy` — classifications,
  SI-vs-BL comparisons, TL;DRs and all.
- No Gmail is read and no real mail is ever touched, because the demo session
  never reaches the Gmail API.
- Anyone with the URL can do this. The data is fabricated, so nothing private
  leaks — but they can trigger **AI Draft**, which spends your Gemini quota.

Use this for the hackathon. Judges see the full product without being added to
the OAuth test-user list, and it works even if Google sign-in is misconfigured.

**`ENABLE_DEMO=false` — Google sign-in only**

- The **Try the demo** button disappears from the login page.
- The demo provider is not registered at all, so a request to
  `/api/auth/callback/demo` is rejected rather than merely hidden.
- Every visitor must sign in with Google **and** be on the test-user list from
  Step 1.3. Anyone else is blocked by Google before reaching the app.
- The app then only ever shows a signed-in user their own real Gmail.

Use this after the hackathon, or any time the URL is public and you do not want
strangers browsing it or spending your Gemini quota.

Either way, redeploy after changing it.

---

## Step 3 — Host the Python backend (optional)

Skip this and the site still works; the demo inbox needs no Python service.
Do it to have real Gmail classified by the trained model instead of keyword
rules.

Deploy the **same GitHub repo** to Railway, with the **repo root** as the build
context. Pointing it at `backend/` will fail: `backend/app.py` reaches up to
`sdoc_classifier/`, `sdoc_comparator/` and `public/dummy/` at runtime.

### 3.1 Create the service

1. **New Project > Deploy from GitHub repo**, and pick this repo.
2. Railway detects Python from `requirements.txt` and installs it. No build
   command needed.
3. `Settings > Source > Root Directory` — leave it empty. That is the repo root.
4. `Settings > Deploy > Custom Start Command`:

   ```text
   uvicorn backend.app:app --host 0.0.0.0 --port $PORT
   ```

   Do not hardcode the port. Railway assigns `$PORT`, and binding anything else
   means the service starts but nothing can reach it.

### 3.2 Generate a public domain

`Settings > Networking > Generate Domain`

**Railway does not expose a service publicly until you do this.** Without a
domain the deploy goes green, the logs look healthy, and Vercel still cannot
reach it.

Copy the URL. It looks like `https://your-app.up.railway.app`.

### 3.3 Check it before wiring anything

```bash
curl https://your-app.up.railway.app/health
```

Expected: `{"status":"ok","emails":520}`.

| Response                  | Meaning                                                          |
| ------------------------- | ---------------------------------------------------------------- |
| `{"status":"ok","emails":520}` | Working. Continue.                                          |
| `{"status":"ok","emails":0}`   | Root directory is wrong. Clear it so it builds from the repo root. |
| Connection refused / no response | No domain generated yet, or the start command binds the wrong port. |
| Build failure             | Check the deploy logs — usually a missing dependency in `requirements.txt`. |

Do not move on until `emails` reads `520`.

### 3.4 Connect Railway to Vercel

The link is **one environment variable on the Vercel side**. Nothing is
configured on Railway, and Railway never calls Vercel — traffic only flows
Vercel → Railway.

1. Copy the Railway domain from 3.2.
2. In `Vercel > your project > Settings > Environment Variables`, set:

   ```text
   CLASSIFIER_API_URL=https://your-app.up.railway.app
   ```

   Include `https://`. No trailing slash, no path — not `/classify`.
3. Scope it to **Production** (tick Preview too if you want preview deployments
   to use it).
4. Redeploy: `Deployments > ... > Redeploy`. The variable does not reach the
   deployment that is already running.

Nothing needs to be set on Railway. You do not allowlist Vercel's domain and you
do not touch CORS — the calls come from Vercel's Node server, not from the
browser, so they are not subject to it.

### 3.5 Confirm they are talking

Sign in with Google and open the inbox, then check Vercel's runtime logs:

- **Working** — no classifier warnings, and categories vary across messages.
- **Not working** — a line like
  `[gmail] classifier at https://... unreachable (...); falling back to keyword
  rules for this inbox`. The inbox still renders, so this is easy to miss.

That fallback is deliberate: a Python service being down must not empty someone's
mailbox. It also means a broken connection looks like a working app with worse
categories, which is why 3.3 comes before 3.4.

### Afterwards

Shut the service down — `/classify` and `/compare` are unauthenticated, and
Railway bills by usage while it runs.

---

## Step 4 — Verify

- [ ] `https://wayboxai.vercel.app` loads
- [ ] **Try the demo** works in an incognito window
- [ ] Google sign-in completes with a test-user account
- [ ] Opening an email shows a TL;DR and confidence bar
- [ ] **AI Draft** on + **Reply** produces a written draft, not a template
- [ ] Sending a reply shows the toast, and it appears in the notification tray
- [ ] If Step 3 was done: `/health` returns `emails: 520`

---

## Troubleshooting

| Symptom                                                | Fix                                                                                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `Error 400: redirect_uri_mismatch`                   | Add the redirect URI in Step 1.1 and wait a few minutes.                                                            |
| `Access blocked: app has not completed verification` | The account is not a test user. Add it in Step 1.3.                                                                 |
| Branding page will not save                            | Clear the homepage / privacy / terms URLs and remove the logo.                                                      |
| Signed-in user sees an empty inbox                     | `BACKEND_API_URL` is set. Clear it and redeploy.                                                                  |
| Drafts read like a template                            | `GEMINI_API_KEY` missing, or `GEMINI_MODEL` pinned to `gemini-2.5-flash-lite`. Use `gemini-3.5-flash-lite`. |
| Env change had no effect                               | Redeploy — existing deployments keep the old values.                                                               |
| Backend unreachable in logs                            | `CLASSIFIER_API_URL` points at `localhost`. Clear it or use the Railway URL.                                     |
| `/health` returns `emails: 0`                      | Railway root directory is set to `backend`. Clear it so it builds from the repo root.                                                               |
