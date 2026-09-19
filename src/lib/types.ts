/**
 * Frontend data model. When the backend is integrated, adapt its response to
 * these types in `lib/emails.ts` (single place) so the UI doesn't change.
 */

export type EmailCategory =
  | "relevant"
  | "spam"
  | "human_intervention"
  | "unrelated";

export interface UserInfo {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
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
}
