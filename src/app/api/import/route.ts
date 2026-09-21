import path from "node:path";
import { BlobAccessError } from "@vercel/blob";
import JSZip from "jszip";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { type SavedFile, clearImport, saveEmpty, saveImport, usingBlob } from "@/lib/demo/import-store";
import { demoSource } from "@/lib/demo/source";

/**
 * The demo account's own sample data.
 *
 *   GET     what is being shown now, and how many emails it holds
 *   POST    two zips (inbox + attachments) -> replaces the bundled sample
 *   PUT     empty the inbox: no emails at all until something is imported or the sample is back
 *   DELETE  throw the import away and go back to the bundled sample
 *
 * Demo only. A signed-in Google user is reading their real mailbox, where a sample inbox
 * would have nothing to replace.
 *
 * Where it is kept depends on the host: `public/import/` on a machine you run yourself,
 * Vercel Blob when a store is attached. `import-store.ts` decides; this route does not care.
 */

// Everything here is served back from the app's own origin, so the list is what the readers
// understand plus common harmless documents -- never .html, .svg or .js, which would run.
const TYPES: Record<string, string> = {
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

const INBOX_EXT = [".json"];
const ATTACHMENT_EXT = Object.keys(TYPES);

const MAX_ZIP_BYTES = 100 * 1024 * 1024;

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function demoOnly() {
  const session = await auth();
  if (!session?.user) return "Not signed in";
  if (!session.demo) return "Importing sample data is for the demo account only";
  return null;
}

/**
 * Reads one zip into memory. Entries are taken by basename alone: it flattens a zip that
 * wraps everything in a folder, and it makes a path like `../../.env` impossible to write.
 */
async function readZip(file: File, allowed: string[]) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const files: SavedFile[] = [];
  let skipped = 0;

  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const name = path.basename(entry.name);
    // "._foo" and ".DS_Store" come from __MACOSX folders in zips made on a Mac
    if (!name || name.startsWith(".")) continue;
    const ext = path.extname(name).toLowerCase();
    if (!allowed.includes(ext)) {
      skipped++;
      continue;
    }
    files.push({
      name,
      bytes: Buffer.from(await entry.async("arraybuffer")),
      contentType: TYPES[ext] ?? "application/octet-stream",
    });
  }
  return { files, skipped };
}

/**
 * The response for a write the store refused. A host whose disk is read-only and that has no
 * Blob store has nowhere to keep anything, and saying so points at the fix; every other
 * failure is reported as what it is.
 */
function storageFailure(e: unknown, what: string) {
  const err = e as NodeJS.ErrnoException;
  console.error(`[import] ${what}`, err);
  if (err.code === "EROFS" || err.code === "EACCES" || err.code === "EPERM") {
    return json(
      {
        error:
          "This deployment's files are read-only. Attach a Vercel Blob store to the " +
          "project so imported data has somewhere to live, then redeploy.",
      },
      501,
    );
  }
  // The store refusing the token is the one failure with a specific fix, and the SDK's own
  // wording ("provide a valid token for this resource") reads like a coding mistake rather
  // than a setting to change, so say what to change.
  if (e instanceof BlobAccessError) {
    return json(
      {
        error:
          "Vercel Blob refused the write: BLOB_READ_WRITE_TOKEN is missing, read-only, or " +
          "belongs to a different store. In Storage, connect the Blob store with " +
          "“Add a read-write token env var” ticked, then redeploy so the running " +
          "deployment picks the new token up.",
      },
      502,
    );
  }
  return json(
    {
      error: usingBlob()
        ? `Blob storage rejected the change: ${(err as Error).message}`
        : `Could not ${what}`,
    },
    502,
  );
}

export async function GET() {
  const denied = await demoOnly();
  if (denied) return new Response(denied, { status: 403 });

  const src = await demoSource();
  return json({
    imported: src.imported && !src.empty,
    cleared: src.empty,
    emails: (await src.listInbox()).length,
    // The panel says where an import would be kept, since that decides whether it survives
    storage: usingBlob() ? "blob" : "disk",
  });
}

export async function POST(req: NextRequest) {
  const denied = await demoOnly();
  if (denied) return new Response(denied, { status: 403 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "Could not read the upload" }, 400);
  }

  const inbox = form.get("inbox");
  const attachments = form.get("attachments");
  if (!(inbox instanceof File) || inbox.size === 0) {
    return json({ error: "Choose a zip of the inbox JSON files" }, 400);
  }
  if (attachments !== null && !(attachments instanceof File)) {
    return json({ error: "Attachments must be a zip file" }, 400);
  }
  for (const f of [inbox, attachments]) {
    if (f instanceof File && f.size > MAX_ZIP_BYTES) {
      return json({ error: `${f.name} is larger than 100 MB` }, 413);
    }
  }

  // Reading the zips and storing them fail for unrelated reasons, and saying "could not read
  // that zip" when the storage rejected a perfectly good one sends people to fix the wrong
  // thing. The two steps report separately.
  let inboxZip, attachmentZip;
  try {
    // Both zips are read before anything is written, so a bad attachments zip cannot leave
    // the demo holding an inbox whose files never arrived.
    inboxZip = await readZip(inbox, INBOX_EXT);
    attachmentZip =
      attachments instanceof File && attachments.size > 0
        ? await readZip(attachments, ATTACHMENT_EXT)
        : { files: [], skipped: 0 };
  } catch (e) {
    console.error("[import] zip", e);
    return json({ error: "Could not read that zip file" }, 400);
  }

  if (inboxZip.files.length === 0) {
    return json({ error: "That zip holds no .json email files" }, 400);
  }

  try {
    await saveImport(inboxZip.files, attachmentZip.files);
  } catch (e) {
    return storageFailure(e, "save the imported files");
  }

  return json({
    imported: true,
    emails: inboxZip.files.length,
    attachments: attachmentZip.files.length,
    skipped: inboxZip.skipped + attachmentZip.skipped,
    storage: usingBlob() ? "blob" : "disk",
  });
}

export async function PUT() {
  const denied = await demoOnly();
  if (denied) return new Response(denied, { status: 403 });

  try {
    await saveEmpty();
  } catch (e) {
    return storageFailure(e, "clear the inbox");
  }
  return json({ imported: false, cleared: true, emails: 0, storage: usingBlob() ? "blob" : "disk" });
}

export async function DELETE() {
  const denied = await demoOnly();
  if (denied) return new Response(denied, { status: 403 });

  try {
    await clearImport();
  } catch (e) {
    console.error("[import] reset", e);
    return json({ error: "Could not remove the imported data" }, 500);
  }
  return json({ imported: false });
}
