import { kindFromFilename } from "./parse";
import type {
  ComparisonStatus,
  ReviewReason,
  ShipmentDocument,
  ShipmentFieldComparison,
  ShipmentFieldKey,
  ShipmentFields,
} from "../types";

/**
 * SI-vs-BL comparison for sources with no backend (the demo inbox, and Gmail
 * when the gateway isn't running). It mirrors sdoc_comparator/src/compare.py
 * -- same seven fields, same normalisation, same verdicts -- so the demo shows
 * what the model would. Change one, change the other.
 */

/** The fields that must agree, in display order (COMPARISON_FIELDS in label_vocab.py). */
const COMPARED: ShipmentFieldKey[] = [
  "shipper",
  "consignee",
  "notify_party",
  "port_of_loading",
  "port_of_discharge",
  "containers",
  "gross_weight",
];

/** Blank-form placeholders that mean "no value was given": "____MT", "TBA", "N/A"... */
const PLACEHOLDER =
  /^[^\p{L}\p{N}]*(?:_{2,}\s*[A-Za-z]{0,4}|TBA|TBC|TBD|N\/?A|NIL|NONE|TO BE (?:ADVISED|CONFIRMED|DETERMINED))[^\p{L}\p{N}]*$/iu;

/** Makes values comparable despite formatting noise. "" means nothing usable was left. */
function cleanValue(field: ShipmentFieldKey, raw: string | undefined): string {
  if (!raw) return "";
  let value = raw.normalize("NFKC").trim();
  if (PLACEHOLDER.test(value)) return "";

  if (field === "gross_weight") {
    // "131,058 KG" / "131058" / "131,058.000" -> "131058"
    const m = value.match(/\d[\d,]*(?:\.\d+)?/);
    if (!m) return "";
    const n = m[0].replace(/,/g, "");
    return n.includes(".") ? n.replace(/0+$/, "").replace(/\.$/, "") : n;
  }

  if (field === "containers") {
    // "6 x 40'HC" -> the count
    return value.match(/\d+/)?.[0] ?? value.replace(/\s+/g, " ").toLowerCase();
  }

  // "NANTONG, CHINA (CNNTG)" -> drop the trailing 5-letter UN/LOCODE
  if (field === "port_of_loading" || field === "port_of_discharge") {
    value = value.replace(/\(\s*[A-Za-z]{5}\s*\)/g, " ");
  }

  // Names, addresses, ports: ignore case, punctuation and line-break separators
  return value
    .replace(/[.'`]/g, "")
    .replace(/[^\p{L}\p{N}_]+/gu, " ")
    .trim()
    .toLowerCase();
}

export interface PairComparison {
  status: ComparisonStatus;
  review_reason: ReviewReason | null;
  /** Keys of the fields that differ; only filled when `status` is "MISMATCH". */
  defect_fields: ShipmentFieldKey[];
  shipment_comparison: ShipmentFieldComparison[];
}

function compareFields(si: ShipmentFields, bl: ShipmentFields): PairComparison {
  const rows: ShipmentFieldComparison[] = COMPARED.map((field) => {
    const a = cleanValue(field, si[field]);
    const b = cleanValue(field, bl[field]);
    return {
      field,
      si_value: a ? (si[field] as string) : "",
      bl_value: b ? (bl[field] as string) : "",
      status: !a || !b ? "unsure" : a === b ? "match" : "mismatch",
    };
  });

  // Any blank field needs a person, even when other fields also differ
  // (the rows still show those differences).
  const unsure = rows.some((r) => r.status === "unsure");
  const mismatched = rows.filter((r) => r.status === "mismatch").map((r) => r.field);
  return {
    status: unsure ? "NEEDS_REVIEW" : mismatched.length ? "MISMATCH" : "OK",
    review_reason: unsure ? "missing_value" : null,
    defect_fields: mismatched,
    shipment_comparison: rows,
  };
}

/** "attached", "attachments", "enclosed"...: the sender says a file came with the email. */
const ATTACHMENT_CLAIM = /\battached\b|\battaching\b|\battachments?\b|\benclosed\b/i;

/**
 * Just what the sender wrote. Mail from outside opens with a security banner
 * ("...be careful with any links or attachments") and closes with a signature,
 * and neither says anything about this email's own attachments. The same idea
 * as clean_body() in sdoc_classifier/src/cleaning.py, in a simpler form.
 */
function senderText(body: string): string {
  const [newest] = body.split(/\n\s*[_\-=]{5,}\s*\n|\n\s*From:/i);
  const [message] = newest.split(/\n\s*(?:(?:best|kind|warm)\s+)?regards\s*[,.!]?\s*\n|\n\s*(?:DID|Website)\s*:/i);
  const [first, ...rest] = message.trim().split(/\n\s*\n/);
  const banner = first.length < 400 && /originated outside|external (e-?mail|sender)|exercise caution/i.test(first);
  return (banner ? rest : [first, ...rest]).join("\n\n");
}

export function bodyClaimsAttachment(body: string): boolean {
  return ATTACHMENT_CLAIM.test(senderText(body));
}

const needsReview = (reason: ReviewReason): PairComparison => ({
  status: "NEEDS_REVIEW",
  review_reason: reason,
  defect_fields: [],
  shipment_comparison: [],
});

/** What a file claims to be: its content when that says SI or BL, else its filename. */
const claimedKind = (d: ShipmentDocument) =>
  d.kind !== "OTHER" ? d.kind : kindFromFilename(d.filename);

export interface AssessOptions {
  /** The email is a BL comparison, so a missing side is itself a problem for a person. */
  expectPair?: boolean;
  bodyClaimsAttachment?: boolean;
}

/**
 * The verdict for a message's documents, or null when there is nothing to say.
 * Reasons mirror sdoc_comparator (analyze_pair): a missing side, a file that
 * can't be read, a file that isn't the SI/BL its name claims, then the
 * field-by-field comparison. Two of one kind is left to a person, and the
 * checklist already says so.
 */
export function assessShipmentDocuments(
  docs: ShipmentDocument[],
  { expectPair = false, bodyClaimsAttachment: claims = false }: AssessOptions = {},
): PairComparison | null {
  const sis = docs.filter((d) => claimedKind(d) === "SI");
  const bls = docs.filter((d) => claimedKind(d) === "BL");

  if (sis.length === 1 && bls.length === 1) {
    const [si] = sis;
    const [bl] = bls;
    // No fields to compare: an empty extraction would only report "everything is missing"
    if (!si.readable || !bl.readable) return needsReview("unreadable");
    if (si.kind !== "SI" || bl.kind !== "BL") return needsReview("wrong_doc_type");
    return compareFields(si.fields, bl.fields);
  }

  if (expectPair) {
    const oneSide = (sis.length === 1 && bls.length === 0) || (sis.length === 0 && bls.length === 1);
    // Nothing attached at all only counts when the email says something was
    if (oneSide || (sis.length === 0 && bls.length === 0 && claims)) {
      return needsReview("missing_attachment");
    }
  }
  return null;
}
