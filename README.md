# WayBoxAI

**AI email triage for logistics.** WayBoxAI is the web frontend for a system that reads the mail coming in from carriers, freight forwarders and customs brokers, sorts every message, and shows it next to an AI summary so a person can act in seconds.

Built for the Averis x Monash Hackathon 2026.

## What it does

- **Sign in with Google**, or click **Try the demo** to explore without any credentials.
- **Filter the inbox**: All, Relevant, Spam, Requires Human Intervention, Unrelated, each with a live count.
- **Paged list**: 50 messages a page with **← Newer / Older →** at the bottom, like Gmail. Pages load on demand, so a big inbox is never fetched in bulk.
- **Three-pane dashboard**: inbox list on the left, the full email in the middle (text or HTML body, images, PDFs and text files previewed inline, attachments you can minimize), and a summary on the right.
- **Shipment document checks** at the top of the summary, on every email:
  - is there a Shipping Instruction (SI)? a Bill of Lading (BL)?
  - does it carry the 14 mandatory SI fields (Shipper/Exporter, Consignee, Notify Party, ports, containers, weight, vessel, voyage, goods, HS code, booking ref, OC No., freight)?
  - a field-by-field table of what the SI, BL and the email text each say, with anything missing flagged in red.
- **Resizable split** between the email and the summary, and a **light/dark mode** toggle. Both are remembered.
- **Responsive**: on phones the list, email and summary stack.

## Tech stack

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Auth.js (`next-auth` v5) for Google login, Lucide icons. Designed to deploy on Vercel.

## Quick start

You need Node 20 or newer.

```bash
npm install
cp .env.example .env.local   # then fill it in, see "Environment variables"
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) (use `localhost`, not `127.0.0.1`, or Google sign-in will reject the redirect).

**No credentials yet?** Set only `AUTH_SECRET` and click **Try the demo**. That works without Google, and shows the 520 sample emails in `public/dummy`.

### Scripts

| Command           | What it does                       |
| ----------------- | ---------------------------------- |
| `npm run dev`   | Development server with hot reload |
| `npm run build` | Production build                   |
| `npm start`     | Serve the production build         |
| `npm run lint`  | ESLint                             |

## Environment variables

### Where they go

| Where you run it | Put the variables in                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Your machine     | **`.env.local`** in the project root (next to `package.json`). It is git-ignored. Start from `.env.example`. |
| Vercel           | **Project > Settings > Environment Variables** (or `vercel env add NAME`). `.env.local` is not uploaded.       |

One `NAME=value` per line, no quotes and no spaces around `=`. Variables are read when the server starts, so **restart `npm run dev`** (or redeploy on Vercel) after changing them.

```shell
# .env.local
AUTH_SECRET=...
AUTH_GOOGLE_ID=...
AUTH_GOOGLE_SECRET=...
BACKEND_API_URL=
ENABLE_DEMO=false
```

### Reference

| Variable               | Required         | Default  | What it does                                                                                                                                                                                                 |
| ---------------------- | ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AUTH_SECRET`        | Yes              | -        | Random string that signs login sessions. Generate with`npx auth secret`. Use a different one per environment.                                                                                              |
| `AUTH_GOOGLE_ID`     | For Google login | -        | OAuth client ID from Google Cloud (see "Setting up Google sign-in").                                                                                                                                         |
| `AUTH_GOOGLE_SECRET` | For Google login | -        | OAuth client secret from the same place. Keep it private.                                                                                                                                                    |
| `BACKEND_API_URL`    | No               | empty    | Your backend's origin, e.g.`https://api.example.com`. **Empty = the app reads the signed-in user's Gmail itself.** Set = every email comes from your backend instead (see "Connecting the backend"). |
| `ENABLE_DEMO`        | No               | `true` | The "Try the demo" login and its sample inbox. Set to exactly`false` to turn it off (the button disappears and the demo login is rejected). Any other value leaves it on.                                  |

On Vercel, `NEXTAUTH_URL` / `AUTH_URL` is not needed; Auth.js detects the domain there. Locally, open the app at `http://localhost:3000` (not `127.0.0.1`).

There is also `GMAIL_API_URL`, which points the Gmail source at a fake server for automated tests. Leave it unset.

## Setting up Google sign-in

1. In [Google Cloud Console](https://console.cloud.google.com) create a project and enable the **Gmail API**.
2. **OAuth consent screen**: user type External. Add the scope `.../auth/gmail.readonly`.
   While the app is in *Testing* status, add every Google account that will sign in under **Test users**, otherwise Google shows "access blocked".
3. **Credentials > Create credentials > OAuth client ID > Web application.** Add these authorised redirect URIs:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://<your-vercel-domain>/api/auth/callback/google`
4. Copy the client ID and secret into `.env.local`.
5. Google shows a "hasn't verified this app" warning in Testing mode. Click Advanced, then Continue.

## Demo credentials

These are the credentials currently used for the hackathon demo. They are here for convenience: paste them into `.env.local` and Google sign-in works locally at `http://localhost:3000`.

```shell
# Generate with: npx auth secret   (or: openssl rand -base64 33)
AUTH_SECRET=

# Google Cloud Console > APIs & Services > Credentials > OAuth client (Web)
# Authorised redirect URIs:
#   http://localhost:3000/api/auth/callback/google
#   https://<your-vercel-domain>/api/auth/callback/google
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=

# Leave empty to use built-in mock emails. Set once the backend is ready.
BACKEND_API_URL=

# "Try the demo" button: logs in as a fake user and browses public/dummy.
# Set to false to disable (e.g. on a production deployment).
ENABLE_DEMO=true
```

> **Demo only.** This file is tracked by git. If this repository is ever pushed somewhere public, rotate the Google client secret and generate a new `AUTH_SECRET` first, then delete this section.

## The demo account

**Try the demo** logs in as a fake "Demo User" and browses the emails in `public/dummy/inbox` (attachments in `public/dummy/attachments`).

The dummy data carries no labels, so `src/lib/demo/classify.ts` assigns categories and summaries with keyword rules, and `src/lib/demo/parse.ts` + `extract.ts` read the SI/BL fields out of the email text and the `.txt` / `.pdf` / `.docx` / `.xlsx` attachments. This is **demo only**: with real data the backend sends all of this already extracted. Two of the sample PDFs are deliberately corrupt and a few are scanned images, to show the "couldn't be read" state.

## Where the emails come from

`src/lib/emails.ts` picks the source, in this order:

1. **Demo account** → the sample inbox in `public/dummy`.
2. **`BACKEND_API_URL` set** → your backend (next section).
3. **Signed in with Google, no backend** → the user's own **Gmail inbox** (`src/lib/gmail/`). This one is genuinely fetched **50 messages at a time, on demand**: the dashboard opens with page 1 and **Older** fetches the next page only when you press it. Nothing is fetched ahead of time, which keeps a big inbox well inside Gmail's quota of 15,000 units per minute per user. Loaded messages are kept in memory for 10 minutes, so paging back and forth or reopening an email costs no Gmail calls; requests are also paced, and a quota error waits and retries.
4. Otherwise → the built-in mock emails.

**The list is paged for every source** (`src/lib/paging.ts`, 50 a page). The demo, mock and backend sources already hold their whole list, so for them the server filters by the selected tab first and then slices, and the tab counts and "1-50 of 137" are exact. Gmail can't do that without downloading everything, so its tabs filter only the page on screen.

**Attachments are never stored.** The email carries a URL like `/api/attachments/<emailId>/<partId>`; when the browser opens it, `src/app/api/attachments/` asks Gmail for that one file with the user's token and passes it through. Only images, PDFs and plain text open inline; everything else (HTML, Office files...) downloads, and files are served with a sandbox CSP so a hostile attachment can't run scripts on your origin.

Gmail has no categories, summaries or SI/BL fields, so `src/lib/gmail/enrich.ts` fills them in with the demo's keyword rules as a **stand-in**. Replace it with the real classifier when it exists.

Limits to know about: with Gmail the category tabs (Relevant, Spam, ...) filter the 50 messages of the page you are viewing and show no counts, because classifying the whole inbox would mean downloading all of it. Vercel also caps a function response at about 4.5 MB, so attachments bigger than that won't come through the route.

## Connecting the backend

The frontend does no classification or parsing of its own; it renders what the backend sends.

1. Set `BACKEND_API_URL` (for example `https://api.example.com`). Unset means mock data.
2. Open **`src/lib/api/routes.ts`**, the routing file. It declares the endpoints the UI needs (`GET /emails` and `GET /emails/:id`). Change the paths if yours differ.
3. Open **`src/lib/api/adapters.ts`** and point the field reads at your real response shape. Everything downstream (list, email, summary, shipment table) stays as it is.
4. To add another endpoint, add an entry to `routes`, then call `request(routes.yourRoute, ...args)` from server code.

Requests run on the server and send `Authorization: Bearer <the user's Google access token>`.

### What the backend should send per email

| Field                                                                  | Meaning                                                                                        |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `email_id`, `from`, `to`, `subject`, `body`, `received_at` | The email itself.`body_type` is `html` or `text`                                         |
| `attachments`                                                        | `[{ id, filename, mime_type, size, url }]`. Images and PDFs are previewed from `url`       |
| `category`                                                           | `relevant`, `spam`, `human_intervention` or `unrelated`                                |
| `summary`                                                            | `{ headline, summary, confidence, reason, fields[], actions[], sentiment }`                  |
| `shipment_info`                                                      | Shipment fields stated in the email text, e.g.`{ shipper, consignee, port_of_loading, ... }` |
| `shipment_documents`                                                 | `[{ kind: "SI" or "BL" or "OTHER", filename, readable, fields }]`                            |

The full types are in `src/lib/types.ts`. The adapter also accepts a few alternative spellings, so slightly different field names still render while the contract settles.

## Project structure

| Path                                        | What                                                                                   |
| ------------------------------------------- | -------------------------------------------------------------------------------------- |
| `src/app/page.tsx`                        | Landing page                                                                           |
| `src/app/login/page.tsx`                  | Sign-in page (Google + demo)                                                           |
| `src/app/dashboard/[category]/layout.tsx` | Dashboard for a filter, with the persistent inbox list (left pane)                     |
| `src/app/dashboard/[category]/[emailId]/` | Email (middle pane) and summary (right pane)                                           |
| `src/app/globals.css`                     | Design tokens (colours, fonts) with light and dark values                              |
| `src/auth.ts`                             | Auth.js: Google (Gmail read-only scope, token refresh) and the demo login              |
| `src/lib/api/`                            | Backend routing:`routes.ts`, `adapters.ts`, `client.ts`                          |
| `src/lib/emails.ts`                       | Chooses the source: demo inbox, backend (if`BACKEND_API_URL` is set), Gmail, or mock |
| `src/lib/gmail/`                          | Gmail source: load the whole inbox, parse messages, fetch one attachment               |
| `src/app/api/inbox/`                      | One page (50) of the inbox for a tab, called by Older / Newer (all sources)            |
| `src/app/api/attachments/`                | Streams one Gmail attachment on demand (nothing stored)                                |
| `src/lib/types.ts`                        | `Email`, `Attachment`, `EmailSummary`, shipment types                            |
| `src/lib/shipment.ts`                     | The 14 mandatory SI fields and the SI / BL / structure checks (display only)           |
| `src/lib/categories.ts`                   | The filter tabs and their colours                                                      |
| `src/lib/user.ts`                         | `getUserInfo()` on the server; `useUserInfo()` in client components                |
| `src/lib/demo/`                           | **Demo only**: dummy-inbox loader, keyword classifier, SI/BL text extraction     |
| `src/components/summary-panel.tsx`        | Right pane: shipment checks, then classification, key details, TL;DR, actions          |
| `src/components/shipment-checklist.tsx`   | The SI / BL / structure checks and the field table                                     |
| `src/components/inbox-pane.tsx`           | Left pane list                                                                         |
| `src/components/resizable-split.tsx`      | Draggable divider between the email and summary                                        |
| `src/components/theme-toggle.tsx`         | Light/dark switch (applied before first paint by a script in`layout.tsx`)            |
| `public/dummy/`, `public/mock/`         | Sample emails and attachments                                                          |

## Deploying to Vercel

1. Import the repository in Vercel (framework preset: Next.js).
2. Add the environment variables from `.env.local` in the project settings.
3. Add `https://<your-domain>/api/auth/callback/google` as an authorised redirect URI in Google Cloud.
4. Consider setting `ENABLE_DEMO=false` for a production deployment.

## Troubleshooting

| Symptom                                   | Fix                                                                                          |
| ----------------------------------------- | -------------------------------------------------------------------------------------------- |
| `redirect_uri_mismatch`                 | The URI in Google Cloud must exactly match`http://localhost:3000/api/auth/callback/google` |
| "Access blocked" /`access_denied`       | Add your account under Test users on the OAuth consent screen                                |
| `MissingSecret` error                   | `AUTH_SECRET` is empty in `.env.local`                                                   |
| Env changes have no effect                | Restart`npm run dev`                                                                       |
| Sent back to the landing page after login | The Google refresh token failed. Sign out and sign in again                                  |
