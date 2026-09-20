import type {
  Attachment,
  ComparisonStatus,
  Email,
  EmailAddress,
  EmailCategory,
  EmailSummary,
  ReviewReason,
  ShipmentDocument,
  ShipmentFieldComparison,
  ShipmentFields,
} from "../types";

/**
 * Turns the backend's JSON into the types the UI renders (`lib/types.ts`).
 * This is the ONLY place that should know the backend's field names. When the
 * real response shape is known, change the reads below; nothing else moves.
 *
 * It is deliberately forgiving (a few common spellings are accepted) so a
 * slightly different backend still renders while the contract settles.
 */

type Raw = Record<string, unknown>;

const isObj = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === "string" && v !== "" ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);

export function adaptAddress(v: unknown): EmailAddress {
  if (typeof v === "string") {
    // "Name <a@b.com>" or a bare address
    const m = v.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
    return m ? { name: m[1].trim() || undefined, email: m[2].trim() } : { email: v.trim() };
  }
  if (isObj(v)) return { name: str(v.name), email: str(v.email) ?? str(v.address) ?? "" };
  return { email: "" };
}

export const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  txt: "text/plain",
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function adaptAttachment(v: unknown): Attachment | null {
  // A bare URL/path string, or an object
  const raw: Raw = typeof v === "string" ? { url: v } : isObj(v) ? v : {};
  const url = str(raw.url) ?? str(raw.href) ?? str(raw.data_url);
  if (!url) return null;
  const filename = str(raw.filename) ?? str(raw.name) ?? url.split("/").pop()!.split("?")[0];
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return {
    id: str(raw.id) ?? url,
    filename,
    mime_type: str(raw.mime_type) ?? str(raw.content_type) ?? MIME_BY_EXT[ext] ?? "application/octet-stream",
    size: num(raw.size) ?? 0,
    url,
  };
}

/**
 * The backend sends ground_truth.json's labels verbatim ("BL_COMPARISON"), which
 * the normalisation below lower-cases into these keys. Spellings the models or a
 * human might plausibly produce are mapped too, so a near-miss still lands right.
 */
const CATEGORY_ALIASES: Record<string, EmailCategory> = {
  bl_comparison: "bl_comparison",
  bl: "bl_comparison",
  si_request: "si_request",
  si: "si_request",
  invoice_query: "invoice_query",
  invoice: "invoice_query",
  general: "general",
  spam: "spam",
};

const COMPARISON_STATUSES: readonly ComparisonStatus[] = ["OK", "MISMATCH", "NEEDS_REVIEW"];
const REVIEW_REASONS: readonly ReviewReason[] = [
  "missing_attachment",
  "unreadable",
  "wrong_doc_type",
  "missing_value",
];

const ROW_STATUSES = ["match", "mismatch", "unsure"] as const;

/**
 * Validated rather than cast: a malformed row would otherwise reach React and
 * crash the render instead of surfacing as a bad response. Unusable rows are
 * dropped, so a partly-broken comparison still shows the rows that are fine.
 */
function adaptComparison(v: unknown, emailId: string): ShipmentFieldComparison[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const rows = v.flatMap((raw) => {
    if (!isObj(raw)) return [];
    const field = str(raw.field);
    const status = ROW_STATUSES.find((s) => s === raw.status);
    if (!field || !status) {
      console.warn(`[api] email ${emailId}: dropping malformed comparison row`, raw);
      return [];
    }
    return [
      {
        field: field as ShipmentFieldComparison["field"],
        si_value: str(raw.si_value) ?? "",
        bl_value: str(raw.bl_value) ?? "",
        status,
      },
    ];
  });
  return rows.length ? rows : undefined;
}

function adaptCategory(v: unknown, emailId: string): EmailCategory {
  const key = typeof v === "string" ? v.trim().toLowerCase().replace(/[\s-]+/g, "_") : "";
  const hit = CATEGORY_ALIASES[key];
  if (!hit) console.warn(`[api] email ${emailId}: unknown category ${JSON.stringify(v)}, showing as "general"`);
  return hit ?? "general";
}

/** Unknown values become undefined rather than reaching the UI as a bad string. */
function adaptStatus(v: unknown, emailId: string): ComparisonStatus | undefined {
  if (v == null) return undefined;
  const key = String(v).trim().toUpperCase().replace(/[\s-]+/g, "_");
  const hit = COMPARISON_STATUSES.find((s) => s === key);
  if (!hit) console.warn(`[api] email ${emailId}: unknown status ${JSON.stringify(v)}, ignoring`);
  return hit;
}

function adaptReviewReason(v: unknown, emailId: string): ReviewReason | undefined {
  if (v == null) return undefined;
  const key = String(v).trim().toLowerCase().replace(/[\s-]+/g, "_");
  const hit = REVIEW_REASONS.find((r) => r === key);
  if (!hit) console.warn(`[api] email ${emailId}: unknown review_reason ${JSON.stringify(v)}, ignoring`);
  return hit;
}

export function adaptEmail(raw: unknown): Email {
  if (!isObj(raw)) throw new Error("Expected an email object from the backend");
  const email_id = str(raw.email_id) ?? str(raw.id);
  if (!email_id) throw new Error("Backend email has no email_id");

  return {
    email_id,
    from: adaptAddress(raw.from),
    to: Array.isArray(raw.to) ? raw.to.map(adaptAddress) : raw.to ? [adaptAddress(raw.to)] : [],
    subject: str(raw.subject) ?? "(no subject)",
    body: str(raw.body) ?? "",
    body_type: raw.body_type === "html" ? "html" : "text",
    received_at: str(raw.received_at) ?? str(raw.date),
    unread: typeof raw.unread === "boolean" ? raw.unread : undefined,
    attachments: (Array.isArray(raw.attachments) ? raw.attachments : [])
      .map(adaptAttachment)
      .filter((a): a is Attachment => a !== null),
    category: adaptCategory(raw.category, email_id),
    // The backend sends these already extracted; they're displayed as-is
    summary: isObj(raw.summary) ? (raw.summary as unknown as EmailSummary) : undefined,
    shipment_info: isObj(raw.shipment_info) ? (raw.shipment_info as ShipmentFields) : undefined,
    shipment_documents: Array.isArray(raw.shipment_documents)
      ? (raw.shipment_documents as ShipmentDocument[])
      : undefined,
    status: adaptStatus(raw.status, email_id),
    review_reason: adaptReviewReason(raw.review_reason, email_id),
    defect_fields: Array.isArray(raw.defect_fields)
      ? raw.defect_fields.filter((f): f is string => typeof f === "string")
      : undefined,
    shipment_comparison: adaptComparison(raw.shipment_comparison, email_id),
  };
}

/** A list endpoint may return a bare array or wrap it: `{ emails: [...] }` / `{ data: [...] }`. */
export function adaptEmailList(raw: unknown): Email[] {
  const list = Array.isArray(raw)
    ? raw
    : isObj(raw) && Array.isArray(raw.emails)
      ? raw.emails
      : isObj(raw) && Array.isArray(raw.data)
        ? raw.data
        : null;
  if (!list) throw new Error("Expected a list of emails from the backend");
  return list.map(adaptEmail);
}
