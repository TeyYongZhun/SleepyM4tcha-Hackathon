import type { Email } from "./types";

/**
 * The hackathon's submission format: one entry per email id, in the shape of
 * ground_truth.json, so it can be scored against it directly (score_cli.py / POST /submit).
 */
export interface SubmissionEntry {
  /** BL_COMPARISON | SI_REQUEST | INVOICE_QUERY | GENERAL | SPAM */
  category: string;
  /** OK | MISMATCH | NEEDS_REVIEW */
  status: "OK" | "MISMATCH" | "NEEDS_REVIEW";
  /** Only for NEEDS_REVIEW: missing_attachment | unreadable | wrong_doc_type | missing_value */
  review_reason: string | null;
  /** Only for MISMATCH: the fields that differ, in ground_truth.json's spelling */
  defect_fields: string[];
  /** True exactly when status is MISMATCH */
  has_defect: boolean;
}

export type Submission = Record<string, SubmissionEntry>;

/**
 * The app's names for the compared fields -> the names ground_truth.json uses. The other
 * five (shipper, consignee, notify_party, port_of_loading, port_of_discharge) are spelt the same.
 */
const TO_GROUND_TRUTH: Record<string, string> = {
  containers: "container_count",
  gross_weight: "gross_weight_kg",
};

/**
 * One email as a submission entry, from what the app has already worked out for it.
 *
 * Only a BL Comparison email is ever compared, so every other category is a plain "OK" with
 * nothing to report, exactly as in ground_truth.json. A BL Comparison with no verdict at all
 * (nothing attached, nothing claimed) is likewise "OK". Reasons and fields are only reported
 * for the status they belong to: a needs-review pair was never fully compared, so it has no
 * defects.
 */
export function toSubmissionEntry(e: Email): SubmissionEntry {
  const category = e.category.toUpperCase();
  if (e.category !== "bl_comparison") {
    return { category, status: "OK", review_reason: null, defect_fields: [], has_defect: false };
  }
  const status = e.status ?? "OK";
  return {
    category,
    status,
    review_reason: status === "NEEDS_REVIEW" ? (e.review_reason ?? null) : null,
    defect_fields:
      status === "MISMATCH" ? (e.defect_fields ?? []).map((f) => TO_GROUND_TRUTH[f] ?? f) : [],
    has_defect: status === "MISMATCH",
  };
}

export function toSubmission(emails: Email[]): Submission {
  return Object.fromEntries(emails.map((e) => [e.email_id, toSubmissionEntry(e)]));
}
