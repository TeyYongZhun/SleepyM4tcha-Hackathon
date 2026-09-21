import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import type { Attachment, Email, ShipmentDocument } from "../types";
import { buildDemoSummary, classifyDemoEmail } from "./classify";
import { assessShipmentDocuments, bodyClaimsAttachment } from "./compare";
import { analyzeAttachments } from "./extract";
import { parseEmailBody } from "./parse";

/** Shape of the JSON files in public/dummy/inbox */
interface DummyEmail {
  email_id: string;
  from: string;
  subject: string;
  body: string;
  /** Paths relative to public/dummy, e.g. "attachments/email_001_SI.txt" */
  attachments: string[];
}

const DUMMY_DIR = path.join(process.cwd(), "public", "dummy");

const MIME: Record<string, string> = {
  txt: "text/plain",
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

async function toAttachment(rel: string): Promise<Attachment> {
  const filename = path.basename(rel);
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const stat = await fs.stat(path.join(DUMMY_DIR, rel)).catch(() => null);
  return {
    id: rel,
    filename,
    mime_type: MIME[ext] ?? "application/octet-stream",
    size: stat?.size ?? 0,
    url: `/dummy/${rel}`,
  };
}

async function adapt(raw: DummyEmail): Promise<Email> {
  const attachments = await Promise.all(raw.attachments.map(toAttachment));
  const { category, reason, confidence } = classifyDemoEmail(raw);
  const email: Email = {
    email_id: raw.email_id,
    from: { email: raw.from },
    to: [],
    subject: raw.subject,
    body: raw.body,
    body_type: "text",
    attachments,
    category,
    // Demo only: real data arrives with these already extracted
    shipment_info: parseEmailBody(raw.subject, raw.body),
    summary: buildDemoSummary(raw, category, reason, confidence),
  };

  // The list needs to know which emails want a person, and why, so it reads the
  // attachments of every BL comparison up front (each file is parsed once and
  // cached; opening the email reuses it). Only the verdict goes on the row:
  // the field-by-field rows belong to the detail view.
  const docs = await analyzeAttachments(attachments);
  const verdict = shipmentVerdict(email, docs);
  return verdict
    ? {
        ...email,
        status: verdict.status,
        review_reason: verdict.review_reason,
        defect_fields: verdict.defect_fields,
      }
    : email;
}

/** SI-vs-BL verdict. Only BL comparisons are meant to carry a pair to check. */
function shipmentVerdict(email: Email, docs: ShipmentDocument[]) {
  if (email.category !== "bl_comparison") return null;
  return assessShipmentDocuments(docs, {
    expectPair: true,
    bodyClaimsAttachment: bodyClaimsAttachment(email.body),
  });
}

let cache: Promise<Email[]> | undefined;

/** All dummy emails, in email_id order. Read once per server instance. */
export function loadDemoEmails(): Promise<Email[]> {
  cache ??= (async () => {
    const dir = path.join(DUMMY_DIR, "inbox");
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json")).sort();
    return Promise.all(
      files.map(async (f) =>
        adapt(JSON.parse(await fs.readFile(path.join(dir, f), "utf8")) as DummyEmail),
      ),
    );
  })();
  return cache;
}

/**
 * One email with its attachments read and analysed (SI/BL fields).
 * Done per email on demand: parsing every PDF up front would slow the list.
 */
export async function loadDemoEmail(emailId: string): Promise<Email | undefined> {
  const email = (await loadDemoEmails()).find((e) => e.email_id === emailId);
  if (!email) return undefined;
  const shipment_documents = await analyzeAttachments(email.attachments);
  // Without this the checklist has no verdict to show and a mismatch looks like a match
  return { ...email, shipment_documents, ...shipmentVerdict(email, shipment_documents) };
}
