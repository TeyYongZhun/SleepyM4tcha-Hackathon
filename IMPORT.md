# Importing your own sample data

The demo account can replace the bundled 520-email dataset with an inbox of your own.
**Import data** sits in the account menu, above Sign out, and is shown for the demo
account only — a signed-in Google user is reading a real mailbox, which has nothing to
replace.

For the rest of the project see [README.md](README.md), [LOCAL.md](LOCAL.md) and
[DEPLOYMENT.md](DEPLOYMENT.md).

## What it does

You supply two zip files: one of inbox `.json` records, one of the attachments those
records name. Whatever you import **replaces** the bundled sample. The two are never
merged, so the demo then shows exactly what you imported and nothing else.

**Reset to sample data**, in the same panel, throws the import away and brings the 520
emails back. It only appears when there is an import to remove.

Two more rows sit under **Import data** in the account menu:

- **Clear data** empties the inbox: no emails at all, neither an import nor the sample, until
  something is imported or the sample is brought back. It asks first, since it throws the
  current data away.
- **Try demo data** brings the bundled 520-email sample back in one click (the same as Reset,
  without opening the panel). It also undoes a Clear.

Both are kept exactly the way an import is (`public/import/` locally, Vercel Blob when a
store is attached), so they work wherever Import does. On a deployed app with no Blob store
Clear reports that it has nowhere to write, as Import does; Try demo data still works, since
there is nothing stored to remove.

## Where the files go

This is the part worth understanding, because it is not the same in both places.

| | Destination |
| --- | --- |
| **Local** (no Blob token) | `public/import/inbox/` and `public/import/attachments/`, on disk |
| **Deployed** (Blob token set) | Vercel Blob: `wayboxai/import/inbox.json`, `wayboxai/import/attachments.zip`, `wayboxai/import/manifest.json` |

It is one or the other, never both. `src/lib/demo/import-store.ts` branches on whether
`BLOB_READ_WRITE_TOKEN` is set and only one side ever runs.

**On a deployed app nothing is written to `public/import`.** It cannot be: a serverless
filesystem is read-only, and anything written to it would be gone by the next request in
any case. That is the whole reason the Blob backend exists.

Blob holds an import as **two files, not one per email**: `inbox.json` (every email record)
and `attachments.zip` (every attachment, stored uncompressed), beside a small
`manifest.json`. Every Blob call is a network round trip, so keeping the disk layout there
made a 700-email import 1,237 uploads one after another (79 s, measured against a stand-in
Blob API at 60 ms per call) and the first inbox load 1,237 reads. As two files the same
import uploads in about half a second and loads with two reads. Disk keeps one file per
email, as the table says, because reading a file there costs nothing.

An import made by an older version of the app (one Blob per file) is still read as it was,
and Reset, Clear and Try demo data delete every blob under `wayboxai/import/`, however many
there are.

Two consequences that surprise people:

- An import on the deployed site is **not part of the deployment**. It lives in the Blob
  store beside it, survives redeploys, and never shows up in `git status`.
- Committing a `public/import` folder from your machine does **not** put that data on the
  live site. They are two separate places. (`public/import` is git-ignored for this
  reason — it is one machine's data, not the project's.)

Everything above the storage layer is identical either way. `src/lib/demo/source.ts`
exposes `listInbox()`, `readInbox()` and `readAttachment()`, and the loader, the SI/BL
comparison and the attachment previews cannot tell which backend answered.

## Setting it up on Vercel

Without this the app runs exactly as before; only the Import button stops working, and it
says so rather than failing quietly.

1. `Vercel > your project > Storage > Create Database > Blob`.
2. Name it and connect it to the project.
3. Vercel adds **`BLOB_READ_WRITE_TOKEN`** to the environment for you — there is no key to
   copy by hand.
4. Redeploy, so the running deployment picks the variable up.

Locally you need nothing: with no token it writes to `public/import`.

To check which backend is live, sign in as the demo account and open `/api/import`. It
reports `"storage":"blob"` or `"storage":"disk"`.

## What the zips must contain

**Folder structure inside the zip does not matter.** Files are taken by name, so a zip
that wraps everything in an `inbox/` folder behaves the same as a flat one. `__MACOSX`
entries and dotfiles are ignored.

**Inbox** — `.json` only, one file per email, in the shape used by `public/dummy/inbox`:

```json
{
  "email_id": "email_001",
  "from": "someone@example.com",
  "subject": "TO CONFIRM DOCS _ 5RSG-00133 _ CALLAO_PERU",
  "body": "Attached are the SI and draft BL. Please check the details and confirm.",
  "attachments": [
    "attachments/email_001_SI.txt",
    "attachments/email_001_BL.txt"
  ]
}
```

Each path in `attachments` is matched by its filename against the attachments zip.

**Attachments** — `.txt`, `.pdf`, `.docx`, `.xlsx`, `.doc`, `.xls`, `.csv`, `.png`,
`.jpg`, `.jpeg`.

Anything else in either zip is skipped and counted in the result, so an import that
reports `"skipped": 2` is telling you two files were not taken. The limit is 100 MB per
zip.

The allowlist is deliberate. Imported files are served back from the app's own origin, so
`.html`, `.svg` and `.js` are refused: they would otherwise be able to run as a page
against your own domain.

## How the data is served

Bundled sample attachments are static files under `public/dummy`, linked as `/dummy/…`.

Imported attachments are linked as `/api/import/file/attachments/<name>` instead, and read
through the store on request. Two reasons:

- A production server only serves the `public/` files that existed when it was **built**.
  A file written afterwards 404s, so a static link would be broken even on a machine where
  the file really is on disk.
- Blob storage hands out public URLs, but those are not what gets linked. Going through the
  route keeps every imported attachment behind the same sign-in check, and gives it the
  same `X-Content-Type-Options: nosniff` and sandbox CSP that a Gmail attachment gets.

## Behaviour to be aware of

**The deployed site takes about 4.5 MB per upload.** Vercel turns a bigger request away
before the app sees it, and the two zips travel in one request, so their combined size is
what counts (the panel says so when it happens). Run locally there is no such limit beyond
100 MB per zip.

**An import is shared, not per-visitor.** It replaces the sample for everyone using the
demo account until someone presses Reset. If two people are on the deployed site at once
and one imports, the other sees the new inbox too.

**Try the demo starts on the sample.** Pressing **Try the demo** on the landing or sign-in page
first puts the bundled 520 emails back, so a new visitor never arrives at an inbox that the last
one imported or cleared. Because the setting is shared, that also resets it for anyone already
in the demo (they see the sample within ten seconds, or on their next click). If the store
cannot be reached the demo still opens, on whatever it was last showing.

**Other instances take a few seconds to notice.** A deployed app runs as several instances
that cannot tell each other anything, so each one spots an import by reading a
`manifest.json` version it has not seen before. That manifest is re-read at most every ten
seconds, which keeps a network round trip out of every page render — so an import
propagates everywhere within about ten seconds rather than instantly.

**The person who made the change sees it at once, though.** Import, Clear and Try demo data
each leave a short-lived cookie (`wayboxai-demo-data-changed`, the time of the change). An
instance that receives a request carrying one, dated after its own read of the manifest,
reads the store again, so the page you land on after pressing Clear is empty whichever
instance serves it. Other visitors catch up within the ten seconds.

**Both zips are read before anything is written**, so a broken attachments zip cannot leave
the demo holding an inbox whose files never arrived.

## The API

Demo account only; everything else gets `403`, and signed-out gets `401`.

| Request | Does |
| --- | --- |
| `GET /api/import` | `{ imported, cleared, emails, storage }` — what is being shown now (`cleared`: emptied on purpose) |
| `POST /api/import` | multipart with `inbox` and `attachments` zips; replaces the sample |
| `PUT /api/import` | empties the inbox (Clear data): a manifest with `empty: true` and no emails |
| `DELETE /api/import` | removes the import or the clear, back to the bundled sample |
| `GET /api/import/file/attachments/:name` | one imported attachment |

A successful import returns how much was taken:

```json
{ "imported": true, "emails": 2, "attachments": 4, "skipped": 2, "storage": "disk" }
```

## If it goes wrong

| Message | Means |
| --- | --- |
| `That zip holds no .json email files` | The inbox zip had no `.json` entries. Check you picked the right one. |
| `Could not read that zip file` | The upload is not a readable zip. |
| `This deployment's files are read-only…` | Deployed with no Blob store attached. Do the setup above. |
| `Blob storage rejected the upload: …` | The store exists but refused it; the message is the store's own. |
| `That upload is too large for the deployed site…` | The two zips together are over Vercel's ~4.5 MB request limit. |
| `Importing sample data is for the demo account only` | Signed in with Google, not the demo account. |

If an import ever leaves the demo in a state you did not intend, **Reset to sample data**
is always safe: it removes the import and restores the bundled 520 emails.
