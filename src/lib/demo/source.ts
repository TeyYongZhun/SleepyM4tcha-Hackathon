import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import {
  type ImportManifest,
  readAttachmentBytes,
  readInboxRecord,
  readManifest,
} from "./import-store";

/**
 * Which sample inbox the demo account is showing, and how to read it.
 *
 * `public/dummy` is the bundled 520-email dataset and the default. Importing a pair of zips
 * (POST /api/import) replaces it: from then on the demo shows exactly what was imported and
 * nothing else, with no merging of the two.
 *
 * Callers read through this module rather than touching the filesystem, because imported
 * data is on disk on your own machine and in Blob storage on a serverless host, and the
 * difference should stop here.
 */

export const DUMMY_DIR = path.join(process.cwd(), "public", "dummy");

export interface DemoSource {
  imported: boolean;
  /** Cleared on purpose: the inbox has no emails, and it is not the bundled sample either. */
  empty: boolean;
  /**
   * Cache key for everything derived from this data. 0 is the bundled sample; an import
   * uses its manifest version, which every instance sees, not just the one that wrote it.
   */
  version: number;
  /**
   * URL prefix for attachment links. The bundled set is a static file under `public/`.
   * Imported files are written after the build, so they are served by a route instead.
   */
  urlBase: string;
  /** The inbox's `.json` filenames, sorted. */
  listInbox(): Promise<string[]>;
  readInbox(name: string): Promise<string>;
  /** `rel` is as written in the email record, e.g. "attachments/email_001_SI.txt". */
  readAttachment(rel: string): Promise<Buffer>;
}

function bundled(): DemoSource {
  return {
    imported: false,
    empty: false,
    version: 0,
    urlBase: "/dummy",
    listInbox: async () =>
      (await fs.readdir(path.join(DUMMY_DIR, "inbox"))).filter((f) => f.endsWith(".json")).sort(),
    readInbox: (name) => fs.readFile(path.join(DUMMY_DIR, "inbox", name), "utf8"),
    readAttachment: (rel) => fs.readFile(path.join(DUMMY_DIR, rel)),
  };
}

function imported(m: ImportManifest): DemoSource {
  return {
    imported: true,
    empty: false,
    version: m.version,
    urlBase: "/api/import/file",
    listInbox: async () => Object.keys(m.inbox).sort(),
    readInbox: (name) => readInboxRecord(m, name),
    readAttachment: (rel) => readAttachmentBytes(m, path.basename(rel)),
  };
}

/** Nothing in it. Its version is the manifest's, so caches of the previous inbox rebuild. */
function cleared(m: ImportManifest): DemoSource {
  return {
    imported: true,
    empty: true,
    version: m.version,
    urlBase: "/api/import/file",
    listInbox: async () => [],
    readInbox: async (name) => {
      throw new Error(`The inbox is empty: no ${name}`);
    },
    readAttachment: async (rel) => {
      throw new Error(`The inbox is empty: no ${rel}`);
    },
  };
}

export async function demoSource(): Promise<DemoSource> {
  const m = await readManifest();
  if (m?.empty) return cleared(m);
  // An import with no emails in it is not something to show; keep the sample instead
  return m && Object.keys(m.inbox).length > 0 ? imported(m) : bundled();
}
