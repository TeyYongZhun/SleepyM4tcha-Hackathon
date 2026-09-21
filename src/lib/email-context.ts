import { labelFor, reviewReasonText } from "./shipment";
import type { Email, ShipmentFieldKey } from "./types";

/** What the pipeline already worked out about an email, as text for a prompt (drafts, summaries). */

export const CATEGORY_NAME: Record<Email["category"], string> = {
  bl_comparison: "BL comparison",
  si_request: "SI request",
  invoice_query: "Invoice query",
  general: "General",
  spam: "Spam",
};

export function defectLabels(email: Email): string[] {
  return (email.defect_fields ?? []).map((f) => labelFor(f as ShipmentFieldKey));
}

export function emailContext(email: Email): string {
  const lines = [`Category: ${CATEGORY_NAME[email.category]}`];
  if (email.status === "MISMATCH") {
    lines.push(`SI vs BL check: MISMATCH in ${defectLabels(email).join(", ") || "some fields"}`);
  } else if (email.status === "NEEDS_REVIEW") {
    lines.push(
      `SI vs BL check: could not be completed (${
        reviewReasonText(email) || "needs review"
      })`,
    );
  } else if (email.status === "OK") {
    lines.push("SI vs BL check: the SI and BL match");
  }
  if (email.attachments.length) {
    lines.push(`Attachments received: ${email.attachments.map((a) => a.filename).join(", ")}`);
  }
  return lines.join("\n");
}
