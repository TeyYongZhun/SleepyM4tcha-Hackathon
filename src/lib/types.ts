/**
 * Frontend data model. When the backend is integrated, adapt its response to
 * these types in `lib/emails.ts` (single place) so the UI doesn't change.
 */

/**
 * The five shipping-document categories the classifier predicts. Same labels as
 * sdoc_classifier/data/ground_truth.json (BL_COMPARISON, SI_REQUEST, ...),
 * lower-cased: the backend sends them verbatim and `adaptCategory` normalises.
 */
export type EmailCategory =
  | "bl_comparison"
  | "si_request"
  | "invoice_query"
  | "general"
  | "spam";

/**
 * Verdict of the SI-vs-BL comparison. Only meaningful for `bl_comparison`
 * emails; a separate axis from the category, exactly as in ground_truth.json.
 */
export type ComparisonStatus = "OK" | "MISMATCH" | "NEEDS_REVIEW";

/** One field checked on the SI against the same field on the BL. */
export interface ShipmentFieldComparison {
  field: ShipmentFieldKey;
  si_value: string;
  bl_value: string;
  /** "unsure" = a value was blank or a placeholder, so no verdict was possible. */
  status: "match" | "mismatch" | "unsure";
}

/** Why a pair could not be checked and needs a person (NEEDS_REVIEW only). */
export type ReviewReason =
  | "missing_attachment"
  | "unreadable"
  | "wrong_doc_type"
  | "missing_value";

export interface UserInfo {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  /** The demo login, which browses sample data instead of a real mailbox */
  demo?: boolean;
}

export interface EmailAddress {
  name?: string;
  email: string;
}

export interface Attachment {
  id: string;
  filename: string;
  mime_type: string;
  /** bytes */
  size: number;
  /** Public URL, or a `data:` URL / proxied URL from the backend. */
  url: string;
}

/** Placeholder shape for the right-hand panel. Replace once the backend spec is known. */
export interface EmailSummary {
  headline: string;
  summary: string;
  /** 0..1 */
  confidence?: number;
  /** Why it was put in this category */
  reason?: string;
  fields?: { label: string; value: string }[];
  actions?: string[];
  /** e.g. "Urgent", "Neutral", "Informational" */
  sentiment?: string;
}

/** Canonical shipment-document fields (the SI structure, plus the B/L number). */
export type ShipmentFieldKey =
  | "shipper"
  | "consignee"
  | "notify_party"
  | "port_of_loading"
  | "port_of_discharge"
  | "containers"
  | "gross_weight"
  | "vessel"
  | "voyage"
  | "goods_description"
  | "hs_code"
  | "booking_ref"
  | "oc_no"
  | "freight"
  | "bl_number";

export type ShipmentFields = Partial<Record<ShipmentFieldKey, string>>;

/** One attachment that was read and identified as a shipping document. */
export interface ShipmentDocument {
  /** SI = shipping instruction, BL = bill of lading, OTHER = invoice, packing list, etc. */
  kind: "SI" | "BL" | "OTHER";
  filename: string;
  /** false when the file couldn't be opened/parsed (corrupt, unsupported) */
  readable: boolean;
  fields: ShipmentFields;
}

export interface Email {
  email_id: string;
  from: EmailAddress;
  to: EmailAddress[];
  subject: string;
  /** Raw body. Interpreted according to `body_type`. */
  body: string;
  body_type: "html" | "text";
  /** ISO 8601. Optional: the dummy data has no dates. */
  received_at?: string;
  attachments: Attachment[];
  unread?: boolean;
  category: EmailCategory;
  summary?: EmailSummary;
  /** Shipment details stated in the email itself (body), already extracted. */
  shipment_info?: ShipmentFields;
  /** Analysed attachments (SI / BL). Absent = not analysed. */
  shipment_documents?: ShipmentDocument[];
  /** SI-vs-BL verdict. Absent = not compared (not a BL_COMPARISON email, or no document pair). */
  status?: ComparisonStatus;
  /** Set only when `status` is "NEEDS_REVIEW". */
  review_reason?: ReviewReason | null;
  /** Canonical field keys that differ between SI and BL (`status` = "MISMATCH"). */
  defect_fields?: string[];
  /**
   * Field-by-field SI-vs-BL result. For backend-served emails this is the only
   * source of SI/BL values -- `shipment_documents` is not sent, because the
   * comparison already carries the extracted values behind its verdict.
   */
  shipment_comparison?: ShipmentFieldComparison[];
}
