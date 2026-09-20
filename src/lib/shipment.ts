import type {
  Email,
  ReviewReason,
  ShipmentDocument,
  ShipmentFieldKey,
  ShipmentFields,
} from "./types";

/**
 * The fields every Shipping Instruction must carry, in display order.
 * `siRequired` / `blRequired` say whether a blank counts as "Missing" for that
 * document type (HS Code / OC No. aren't expected on a B/L; the B/L number
 * isn't expected on an SI).
 */
export const SHIPMENT_FIELDS: {
  key: ShipmentFieldKey;
  label: string;
  siRequired: boolean;
  blRequired: boolean;
}[] = [
  { key: "shipper", label: "Shipper / Exporter", siRequired: true, blRequired: true },
  { key: "consignee", label: "Consignee", siRequired: true, blRequired: true },
  { key: "notify_party", label: "Notify Party", siRequired: true, blRequired: true },
  { key: "port_of_loading", label: "Port of Loading", siRequired: true, blRequired: true },
  { key: "port_of_discharge", label: "Discharge Port", siRequired: true, blRequired: true },
  { key: "containers", label: "Containers / Packages", siRequired: true, blRequired: true },
  { key: "gross_weight", label: "Gross Weight", siRequired: true, blRequired: true },
  { key: "vessel", label: "Vessel Name", siRequired: true, blRequired: true },
  { key: "voyage", label: "Voyage No.", siRequired: true, blRequired: true },
  { key: "goods_description", label: "Description of Goods", siRequired: true, blRequired: true },
  { key: "hs_code", label: "HS Code", siRequired: true, blRequired: false },
  { key: "booking_ref", label: "Booking Ref", siRequired: true, blRequired: true },
  { key: "oc_no", label: "OC No.", siRequired: true, blRequired: false },
  { key: "freight", label: "Freight", siRequired: true, blRequired: true },
  { key: "bl_number", label: "B/L No.", siRequired: false, blRequired: true },
];

/** Plain-English reason a pair needs a person. Shared by the checklist and the summary panel. */
export const REVIEW_REASON_TEXT: Record<ReviewReason, string> = {
  missing_attachment: "only one of the SI / BL was received",
  unreadable: "a document could not be read (empty, corrupt, or a scan with no text)",
  wrong_doc_type: "an attachment is not an SI or BL",
  missing_value: "a compared field is blank on one side",
};

/** Same reasons in a few words, for list rows where the sentence above won't fit. */
export const REVIEW_REASON_SHORT: Record<ReviewReason, string> = {
  missing_attachment: "Missing attachment",
  unreadable: "Unreadable file",
  wrong_doc_type: "Wrong document type",
  missing_value: "Missing value",
};

/** Display label for a field key, falling back to the key itself. */
export function labelFor(key: ShipmentFieldKey): string {
  return SHIPMENT_FIELDS.find((f) => f.key === key)?.label ?? key;
}

export type DocPresence = "present" | "absent" | "unreadable";

export interface DocCheck {
  presence: DocPresence;
  document?: ShipmentDocument;
  /** Required fields that are filled in / total required (only when readable) */
  filled: number;
  required: number;
  missing: string[];
}

/** Result of checking one set of fields against the required list. */
export interface FieldCheck {
  filled: number;
  required: number;
  missing: string[];
}

export interface StructureCheck extends FieldCheck {
  /** Where the fields were checked: the SI attachment, or the email text when there's no SI. */
  source: "SI" | "email" | "none";
  complete: boolean;
}

export interface ShipmentSummary {
  si: DocCheck;
  bl: DocCheck;
  /** Shipment info written in the email body itself (shipper, consignee, ports...) */
  email: { fields: ShipmentFields; hasInfo: boolean };
  /** Attachments that were read but are neither SI nor BL (invoice, packing list...) */
  otherDocuments: ShipmentDocument[];
  structure: StructureCheck;
  /** Body mentions an SI/BL that isn't attached */
  mentionedButMissing: ("SI" | "BL")[];
}

function checkFields(fields: ShipmentFields, kind: "SI" | "BL"): FieldCheck {
  const required = SHIPMENT_FIELDS.filter((f) => (kind === "SI" ? f.siRequired : f.blRequired));
  const missing = required.filter((f) => !fields[f.key]?.trim()).map((f) => f.label);
  return { filled: required.length - missing.length, required: required.length, missing };
}

function check(docs: ShipmentDocument[], kind: "SI" | "BL"): DocCheck {
  const ofKind = docs.filter((d) => d.kind === kind);
  const doc = ofKind.find((d) => d.readable) ?? ofKind[0];
  if (!doc) return { presence: "absent", filled: 0, required: 0, missing: [] };
  if (!doc.readable) {
    return { presence: "unreadable", document: doc, filled: 0, required: 0, missing: [] };
  }
  return { presence: "present", document: doc, ...checkFields(doc.fields, kind) };
}

/** Everything the summary panel's document section needs, derived from the email. */
export function summarizeShipment(email: Email): ShipmentSummary {
  const docs = email.shipment_documents ?? [];
  const si = check(docs, "SI");
  const bl = check(docs, "BL");

  // Supplied with the email (backend, or the demo loader); nothing is parsed here
  const emailFields = email.shipment_info ?? {};
  // The OC number is in nearly every subject line, so it alone doesn't mean the body holds an SI
  const hasInfo = Object.keys(emailFields).filter((k) => k !== "oc_no").length >= 3;

  let structure: StructureCheck;
  if (si.presence === "present") {
    structure = { source: "SI", complete: si.missing.length === 0, ...si };
  } else if (hasInfo) {
    const c = checkFields(emailFields, "SI");
    structure = { source: "email", complete: c.missing.length === 0, ...c };
  } else {
    structure = { source: "none", complete: false, filled: 0, required: 0, missing: [] };
  }

  const text = email.subject + "\n" + email.body;
  const mentionedButMissing: ("SI" | "BL")[] = [];
  // When the instruction is written into the body, the SI isn't "missing"
  if (si.presence === "absent" && !hasInfo && /\bSI\b|shipping instruction/i.test(text)) {
    mentionedButMissing.push("SI");
  }
  if (bl.presence === "absent" && /\bB\/?L\b|bill of lading/i.test(text)) {
    mentionedButMissing.push("BL");
  }

  return {
    si,
    bl,
    email: { fields: emailFields, hasInfo },
    otherDocuments: docs.filter((d) => d.kind === "OTHER" && d.readable),
    structure,
    mentionedButMissing,
  };
}
