import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import type { Attachment, Email, ShipmentDocument } from "../types";
import { buildDemoSummary, classifyDemoEmail } from "./classify";
import { assessShipmentDocuments, bodyClaimsAttachment } from "./compare";
import { analyzeAttachments } from "./extract";
import { parseEmailBody } from "./parse";
import { DUMMY_DIR, type DemoSource, demoSource } from "./source";

/** Shape of the JSON files in the active `inbox/` folder */
interface DummyEmail {
  email_id: string;
  from: string;
  subject: string;
  body: string;
  /** Paths relative to the data root, e.g. "attachments/email_001_SI.txt" */
  attachments: string[];
}

const MIME: Record<string, string> = {
  txt: "text/plain",
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

async function toAttachment(rel: string, src: DemoSource): Promise<Attachment> {
  const filename = path.basename(rel);
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  // Only shown next to the filename, and an imported file's size would cost a fetch to
  // learn, so it is left at 0 rather than reading every attachment to render the list.
  const size = src.imported
    ? 0
    : ((await fs.stat(path.join(DUMMY_DIR, rel)).catch(() => null))?.size ?? 0);
  return {
    id: rel,
    filename,
    mime_type: MIME[ext] ?? "application/octet-stream",
    size,
    url: `${src.urlBase}/${rel}`,
  };
}

async function adapt(raw: DummyEmail, src: DemoSource): Promise<Email> {
  const attachments = await Promise.all(raw.attachments.map((rel) => toAttachment(rel, src)));
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

let cache: { version: number; emails: Promise<Email[]> } | undefined;

/**
 * All demo emails, in email_id order. Read once per server instance, and again whenever an
 * import changes the data under it (see `DemoSource.version`).
 */
export async function loadDemoEmails(): Promise<Email[]> {
  const src = await demoSource();
  if (!cache || cache.version !== src.version) {
    const emails = (async () => {
      const files = await src.listInbox();
      return Promise.all(
        files.map(async (f) => adapt(JSON.parse(await src.readInbox(f)) as DummyEmail, src)),
      );
    })();
    cache = { version: src.version, emails };
    // A failed read (an imported inbox is fetched over the network) must not be kept: the next
    // request tries again instead of failing until the data changes.
    emails.catch(() => {
      if (cache?.emails === emails) cache = undefined;
    });
  }
  return cache.emails;
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
