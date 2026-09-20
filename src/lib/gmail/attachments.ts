import "server-only";
import { bufferToText, kindFromFilename, READABLE_EXTENSIONS } from "../demo/extract";
import { assessShipmentDocuments, bodyClaimsAttachment } from "../demo/compare";
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

/** What the analysis adds to an Email, so it can be cached apart from one. */
type Analysis = Pick<
  Email,
  "shipment_documents" | "status" | "review_reason" | "defect_fields" | "shipment_comparison"
>;

/**
 * Keyed by message id. The inbox list and the opened email both want this, and
 * downloading the same attachments twice would double the Gmail calls for no
 * reason. Entries expire with the message cache in ./index, so a message is
 * re-read at most as often as it is re-fetched.
 */
const analysisCache = new Map<string, { at: number; value: Promise<Analysis | null> }>();
const ANALYSIS_TTL_MS = 10 * 60_000;
/** A page is 50; this keeps a long session from growing without bound. */
const ANALYSIS_MAX = 500;

function cachedAnalysis(emailId: string, run: () => Promise<Analysis | null>) {
  const held = analysisCache.get(emailId);
  if (held && Date.now() - held.at <= ANALYSIS_TTL_MS) return held.value;

  const value = run();
  analysisCache.set(emailId, { at: Date.now(), value });
  if (analysisCache.size > ANALYSIS_MAX) {
    // Map keeps insertion order, so the oldest entry is the first one.
    analysisCache.delete(analysisCache.keys().next().value!);
  }
  return value;
}

/**
 * Adds `shipment_documents` and the SI-vs-BL verdict to one message.
 *
 * Used by the inbox list as well as the opened email: the list needs `status`
 * to show the "Mismatch" / "Needs review" badge on a row. A message with no
 * attachments costs nothing, and the rest are cached, so a page pays for its
 * shipping emails once.
 */
export async function withShipmentAnalysis(token: string, email: Email): Promise<Email> {
  if (!email.attachments.length) return email;
  const analysis = await cachedAnalysis(email.email_id, () => analyse(token, email));
  return analysis ? { ...email, ...analysis } : email;
}

async function analyse(token: string, email: Email): Promise<Analysis | null> {

  const analysed = (
    await mapPool(email.attachments, CONCURRENCY, (a) => analyseOne(token, email.email_id, a))
  ).filter((x): x is Analysed => x !== null);
  if (!analysed.length) return null;

  const out: Analysis = { shipment_documents: analysed.map((x) => x.doc) };

  // The built-in assessment covers every case, including a missing or unusable
  // side. The model, when the gateway is up, only replaces the field-by-field
  // comparison of a clean pair, so a mismatch is never silently shown as nothing.
  const builtIn = assessShipmentDocuments(out.shipment_documents!, {
    expectPair: email.category === "bl_comparison",
    bodyClaimsAttachment: bodyClaimsAttachment(email.body),
  });

  // One of each, or there is no pair to compare. Two BLs and no SI is a
  // question for a person, not something to guess at.
  const sis = analysed.filter((x) => x.doc.kind === "SI");
  const bls = analysed.filter((x) => x.doc.kind === "BL");
  const modelled =
    sis.length === 1 && bls.length === 1 && sis[0].doc.readable && bls[0].doc.readable
      ? await compare(sis[0], bls[0])
      : null;

  const comparison = modelled ?? builtIn;
  return comparison ? { ...out, ...comparison } : out;
}
