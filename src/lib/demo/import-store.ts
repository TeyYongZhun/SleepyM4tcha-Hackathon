import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { cookies } from "next/headers";
import { del, head, list, put } from "@vercel/blob";

/**
 * Where imported sample data is kept.
 *
 * Two backends, chosen by whether a Blob store is configured:
 *
 *   disk   `public/import/` -- a machine you run yourself, and the default
 *   blob   Vercel Blob      -- a serverless host, whose own filesystem is read-only
 *
 * Both write a `manifest.json` listing what was imported. Its `version` is the cache key
 * every reader uses: on Vercel the app runs as several instances that cannot tell each
 * other anything, so an instance notices an import by seeing a version it has not read
 * yet, rather than by being told.
 */

export interface ImportManifest {
  /** Changes on every import. Caches keyed by it rebuild themselves. */
  version: number;
  /**
   * Set by Clear: an inbox with nothing in it, on purpose. Without this an empty manifest
   * would be indistinguishable from "nothing imported" and the bundled sample would come back.
   */
  empty?: boolean;
  /** filename -> where to fetch it. Empty string means "read it from disk". */
  inbox: Record<string, string>;
  attachments: Record<string, string>;
}

export interface SavedFile {
  name: string;
  bytes: Buffer;
  contentType: string;
}

const BLOB_PREFIX = "wayboxai/import";
const MANIFEST_PATH = `${BLOB_PREFIX}/manifest.json`;

export const IMPORT_DIR = path.join(process.cwd(), "public", "import");
const DISK_MANIFEST = path.join(IMPORT_DIR, "manifest.json");

/** A Blob store is configured by Vercel as soon as one is attached to the project. */
export const usingBlob = (): boolean => !!process.env.BLOB_READ_WRITE_TOKEN;

/**
 * Re-reading the manifest on every render would put a network round trip in front of the
 * inbox. Ten seconds is short enough that an import shows up on the other instances while
 * the person is still looking at the page, and long enough to cost nothing while browsing.
 */
const MANIFEST_TTL_MS = 10_000;

type Cached = { at: number; manifest: ImportManifest | null };

// On globalThis, not module scope: pages and API routes are bundled separately and would each
// get their own copy, so a change made in a route would never be seen by the page that renders
// the inbox until its own copy expired.
const g = globalThis as unknown as { __wayboxImportManifest?: Cached };

/**
 * Set on the browser that changed the data (import, clear, sample back) to the moment it did.
 * Another serverless instance may be holding the manifest it read before the change, and a
 * person who has just pressed Clear should see an empty inbox, not the old one for up to
 * MANIFEST_TTL_MS. Any instance seeing a request that carries this, dated after its own read,
 * reads the store again -- so a change is seen at once by whoever made it, wherever their next
 * request lands, and within the TTL by everyone else.
 */
const CHANGED_COOKIE = "wayboxai-demo-data-changed";

async function changedAtByThisBrowser(): Promise<number> {
  try {
    return Number((await cookies()).get(CHANGED_COOKIE)?.value) || 0;
  } catch {
    return 0; // not inside a request (a build, a script)
  }
}

/**
 * Called by the code that just wrote: drops what this instance holds, and tells the browser
 * that made the change (see CHANGED_COOKIE) so other instances re-read for it.
 */
export async function invalidateManifest(): Promise<void> {
  g.__wayboxImportManifest = undefined;
  try {
    (await cookies()).set(CHANGED_COOKIE, String(Date.now()), {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 120,
    });
  } catch {
    // not inside a request: nobody's browser to tell
  }
}

async function readManifestUncached(): Promise<ImportManifest | null> {
  if (usingBlob()) {
    try {
      const meta = await head(MANIFEST_PATH);
      const res = await fetch(meta.url, { cache: "no-store" });
      if (!res.ok) return null;
      return (await res.json()) as ImportManifest;
    } catch {
      return null; // nothing imported, or the store is unreachable: fall back to the sample
    }
  }
  try {
    return JSON.parse(await fs.readFile(DISK_MANIFEST, "utf8")) as ImportManifest;
  } catch {
    return null;
  }
}

export async function readManifest(): Promise<ImportManifest | null> {
  const held = g.__wayboxImportManifest;
  if (held && Date.now() - held.at < MANIFEST_TTL_MS && held.at >= (await changedAtByThisBrowser())) {
    return held.manifest;
  }
  const manifest = await readManifestUncached();
  g.__wayboxImportManifest = { at: Date.now(), manifest };
  return manifest;
}

async function fetchBytes(url: string): Promise<Buffer> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`blob ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** One imported email record, as JSON text. */
export async function readInboxRecord(m: ImportManifest, name: string): Promise<string> {
  const url = m.inbox[name];
  if (url) return (await fetchBytes(url)).toString("utf8");
  return fs.readFile(path.join(IMPORT_DIR, "inbox", name), "utf8");
}

/** One imported attachment, as bytes. */
export async function readAttachmentBytes(m: ImportManifest, name: string): Promise<Buffer> {
  const url = m.attachments[name];
  if (url) return fetchBytes(url);
  return fs.readFile(path.join(IMPORT_DIR, "attachments", name));
}

export async function clearImport(): Promise<void> {
  if (usingBlob()) {
    const { blobs } = await list({ prefix: BLOB_PREFIX });
    // By pathname, not by URL. A URL names the store it was written to, so one left behind by
    // a store that has since been replaced is refused as someone else's resource and nothing
    // can ever be cleared. A pathname is resolved against whichever store the token owns.
    if (blobs.length) await del(blobs.map((b) => b.pathname));
  } else {
    await fs.rm(IMPORT_DIR, { recursive: true, force: true });
  }
  await invalidateManifest();
}

/** Replaces whatever was imported before. Returns the manifest that is now live. */
export async function saveImport(
  inbox: SavedFile[],
  attachments: SavedFile[],
): Promise<ImportManifest> {
  await clearImport();
  const manifest: ImportManifest = { version: Date.now(), inbox: {}, attachments: {} };

  if (usingBlob()) {
    const upload = async (folder: "inbox" | "attachments", f: SavedFile) => {
      const { url } = await put(`${BLOB_PREFIX}/${folder}/${f.name}`, f.bytes, {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: f.contentType,
      });
      manifest[folder][f.name] = url;
    };
    // Sequential on purpose: a few hundred small uploads at once trips the store's rate limit
    for (const f of inbox) await upload("inbox", f);
    for (const f of attachments) await upload("attachments", f);
  } else {
    for (const [folder, files] of [
      ["inbox", inbox],
      ["attachments", attachments],
    ] as const) {
      await fs.mkdir(path.join(IMPORT_DIR, folder), { recursive: true });
      for (const f of files) {
        await fs.writeFile(path.join(IMPORT_DIR, folder, f.name), f.bytes);
        manifest[folder][f.name] = ""; // on disk: the path is implied by the folder
      }
    }
  }

  await writeManifest(manifest);
  await invalidateManifest();
  return manifest;
}

/**
 * Empties the inbox: everything imported is thrown away and the demo is left showing no emails
 * at all -- neither the imported data nor the bundled sample -- until something is imported or
 * the sample is brought back (`clearImport`). Kept the same way an import is, so it holds on a
 * serverless host exactly as it does on disk.
 */
export async function saveEmpty(): Promise<ImportManifest> {
  await clearImport();
  const manifest: ImportManifest = { version: Date.now(), inbox: {}, attachments: {}, empty: true };
  await writeManifest(manifest);
  await invalidateManifest();
  return manifest;
}

/**
 * Puts the manifest where readers look for it. It is the one file that is overwritten in
 * place, so its cache lifetime is kept short (60s is the store's minimum): the default is a
 * month, which could leave other instances reading the previous state for as long.
 */
async function writeManifest(manifest: ImportManifest): Promise<void> {
  if (usingBlob()) {
    await put(MANIFEST_PATH, JSON.stringify(manifest), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      cacheControlMaxAge: 60,
    });
  } else {
    await fs.mkdir(IMPORT_DIR, { recursive: true });
    await fs.writeFile(DISK_MANIFEST, JSON.stringify(manifest));
  }
}
