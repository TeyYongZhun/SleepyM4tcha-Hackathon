import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { extractText, getDocumentProxy } from "unpdf";
import { detectDocKind, kindFromFilename, parseShipmentText } from "./parse";
import type { Attachment, ShipmentDocument } from "../types";

const DUMMY_DIR = path.join(process.cwd(), "public", "dummy");

const decodeXml = (s: string) =>
  s
    // Numeric entities: bilingual templates store "毛重" as "&#27611;&#37325;"
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

const stripTags = (s: string) => decodeXml(s.replace(/<[^>]+>/g, ""));

async function pdfToText(buf: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buf), { verbosity: 0 });
  return (await extractText(pdf, { mergePages: true })).text;
}

async function docxToText(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) throw new Error("not a docx");
  return stripTags(xml.replace(/<w:tab\/>/g, " ").replace(/<w:br\/>|<\/w:p>/g, "\n"));
}

/** First sheet only; each row becomes "A | B | C" so labels and values stay together. */
async function xlsxToText(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const sheet = await zip.file("xl/worksheets/sheet1.xml")?.async("string");
  if (!sheet) throw new Error("not an xlsx");
  const sharedXml = await zip.file("xl/sharedStrings.xml")?.async("string");
  const shared = sharedXml
    ? [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => stripTags(m[1]))
    : [];

  return [...sheet.matchAll(/<row [^>]*>([\s\S]*?)<\/row>/g)]
    .map((row) =>
      [...row[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)]
        .map(([, attrs, inner = ""]) => {
          if (/t="s"/.test(attrs)) return shared[Number(inner.match(/<v>(\d+)<\/v>/)?.[1])] ?? "";
          return stripTags(inner);
        })
        .join(" | "),
    )
    .join("\n");
}

/** The file types we can read at all. Anything else is skipped, not failed. */
export const READABLE_EXTENSIONS = ["txt", "pdf", "docx", "xlsx"];

/**
 * Bytes -> text. Kept separate from any file path so the same readers serve
 * both the demo's on-disk fixtures and Gmail attachments, which only ever
 * exist in memory.
 */
export function bufferToText(buf: Buffer, ext: string): Promise<string> {
  if (ext === "txt") return Promise.resolve(buf.toString("utf8"));
  if (ext === "pdf") return pdfToText(buf);
  if (ext === "docx") return docxToText(buf);
  if (ext === "xlsx") return xlsxToText(buf);
  throw new Error(`unsupported type: ${ext}`);
}

async function fileToText(abs: string, ext: string): Promise<string> {
  return bufferToText(await fs.readFile(abs), ext);
}

// Lives in parse.ts so the comparison can use it without pulling in this server-only module
export { kindFromFilename };

const cache = new Map<string, Promise<ShipmentDocument | null>>();

function analyzeOne(a: Attachment): Promise<ShipmentDocument | null> {
  const ext = a.filename.split(".").pop()?.toLowerCase() ?? "";
  if (!READABLE_EXTENSIONS.includes(ext)) return Promise.resolve(null);

  let hit = cache.get(a.id);
  if (!hit) {
    hit = (async () => {
      try {
        const text = await fileToText(path.join(DUMMY_DIR, a.id), ext);
        // Scanned/image-only PDFs have no text layer to read
        if (text.trim().length < 20) throw new Error("no text");
        return {
          kind: detectDocKind(text),
          filename: a.filename,
          readable: true,
          fields: parseShipmentText(text),
        };
      } catch {
        return {
          kind: kindFromFilename(a.filename),
          filename: a.filename,
          readable: false,
          fields: {},
        };
      }
    })();
    cache.set(a.id, hit);
  }
  return hit;
}

/** Reads and classifies an email's attachments (SI / BL / other). */
export async function analyzeAttachments(attachments: Attachment[]): Promise<ShipmentDocument[]> {
  const docs = await Promise.all(attachments.map(analyzeOne));
  return docs.filter((d): d is ShipmentDocument => d !== null);
}
