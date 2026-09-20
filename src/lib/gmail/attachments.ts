import "server-only";
import { bufferToText, kindFromFilename, READABLE_EXTENSIONS } from "../demo/extract";
import { detectDocKind, parseShipmentText } from "../demo/parse";
import type { Email, ShipmentDocument, ShipmentFieldComparison } from "../types";
import { mapPool } from "./api";
import { fetchAttachment } from "./index";

/**
 * Reads a Gmail message's attachments, identifies the shipping documents in
 * them, and runs the SI-vs-BL comparison -- so a real inbox gets the analysis
 * the seeded inbox has had all along. The demo reads its fixtures off disk
 * (`demo/extract.ts`); these bytes only ever exist in memory, which is the
 * whole difference between the two.
 *
 * Attachment bytes are sent to CLASSIFIER_API_URL (the local FastAPI gateway)
 * because the comparator is Python and reads files from disk. Nothing leaves
 * the machine, and the gateway deletes its temp copies when the request ends.
 */

const CLASSIFIER_API_URL = process.env.CLASSIFIER_API_URL?.replace(/\/+$/, "") || undefined;

/** Gmail's own quota pacing lives in gmailGet; this just avoids a burst. */
const CONCURRENCY = 4;

/** Scanned PDFs have no text layer, so there is nothing to compare. */
const MIN_USEFUL_TEXT = 20;

/** Comparing two documents is slower than classifying text, but still well under the page budget. */
const COMPARE_TIMEOUT_MS = 20_000;

/** The document plus the bytes it came from, so comparing doesn't re-download. */
interface Analysed {
  doc: ShipmentDocument;
  data: Buffer;
}

async function analyseOne(
  token: string,
  messageId: string,
  a: Email["attachments"][number],
): Promise<Analysed | null> {
  const ext = a.filename.split(".").pop()?.toLowerCase() ?? "";
  if (!READABLE_EXTENSIONS.includes(ext)) return null;

  const file = await fetchAttachment(token, messageId, a.id).catch(() => null);
  if (!file) return null;

  try {
    const text = await bufferToText(file.data, ext);
    if (text.trim().length < MIN_USEFUL_TEXT) throw new Error("no text");
    return {
      data: file.data,
      doc: {
        // Content first: real attachments are not named email_001_SI.txt.
        kind: detectDocKind(text),
        filename: a.filename,
        readable: true,
        fields: parseShipmentText(text),
      },
    };
  } catch {
    // Unreadable is a real answer, not a failure -- the comparator reports it
    // as NEEDS_REVIEW so a person looks at it. Losing the email would be worse.
    return {
      data: file.data,
      doc: { kind: kindFromFilename(a.filename), filename: a.filename, readable: false, fields: {} },
    };
  }
}

interface ComparisonResult {
  status: Email["status"];
  review_reason: Email["review_reason"];
  defect_fields: string[];
  shipment_comparison: ShipmentFieldComparison[];
}

async function compare(si: Analysed, bl: Analysed): Promise<ComparisonResult | null> {
  if (!CLASSIFIER_API_URL) return null;
  const body = new FormData();
  body.append("si", new Blob([new Uint8Array(si.data)]), si.doc.filename);
  body.append("bl", new Blob([new Uint8Array(bl.data)]), bl.doc.filename);

  try {
    const res = await fetch(`${CLASSIFIER_API_URL}/compare`, {
      method: "POST",
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(COMPARE_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as ComparisonResult;
  } catch (e) {
    // The email still opens, just without a verdict: reading mail must not
    // depend on the comparator being up.
    console.warn(`[gmail] comparison unavailable (${e instanceof Error ? e.message : e})`);
    return null;
  }
}

/**
 * Adds `shipment_documents`, and the SI-vs-BL verdict when the message carries
 * exactly one of each. Detail view only -- far too slow for the inbox list.
 */
export async function withShipmentAnalysis(token: string, email: Email): Promise<Email> {
  if (!email.attachments.length) return email;

  const analysed = (
    await mapPool(email.attachments, CONCURRENCY, (a) => analyseOne(token, email.email_id, a))
  ).filter((x): x is Analysed => x !== null);
  if (!analysed.length) return email;

  const out: Email = { ...email, shipment_documents: analysed.map((x) => x.doc) };

  // One of each, or there is no pair to compare. Two BLs and no SI is a
  // question for a person, not something to guess at.
  const sis = analysed.filter((x) => x.doc.kind === "SI");
  const bls = analysed.filter((x) => x.doc.kind === "BL");
  if (sis.length !== 1 || bls.length !== 1) return out;

  const comparison = await compare(sis[0], bls[0]);
  return comparison ? { ...out, ...comparison } : out;
}
