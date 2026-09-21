import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
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

let cached: { at: number; manifest: ImportManifest | null } | undefined;

/** Called by the instance that just wrote, so its own next read is never stale. */
export function invalidateManifest(): void {
  cached = undefined;
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
  if (cached && Date.now() - cached.at < MANIFEST_TTL_MS) return cached.manifest;
  const manifest = await readManifestUncached();
  cached = { at: Date.now(), manifest };
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
    if (blobs.length) await del(blobs.map((b) => b.url));
  } else {
    await fs.rm(IMPORT_DIR, { recursive: true, force: true });
  }
  invalidateManifest();
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

    await put(MANIFEST_PATH, JSON.stringify(manifest), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
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
    await fs.writeFile(DISK_MANIFEST, JSON.stringify(manifest));
  }

  invalidateManifest();
  return manifest;
}
