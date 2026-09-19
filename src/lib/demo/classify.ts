import type { EmailCategory, EmailSummary } from "../types";

/**
 * DEMO ONLY. The dummy inbox has no labels, so these keyword rules stand in
 * for the real backend classifier/summariser. Not used for real accounts.
 */

const SPAM_SENDER =
  /@(crypto-invest|secure-mailbox|webmail-verify|parcel-track|logistics-deals|prize-claims)\./i;
const SPAM_TEXT =
  /bitcoin|congratulations|gift card|verify (your )?account|click here|storage (is )?full|exceeded its storage|unpaid customs|guaranteed|claim (your|prize)|suspension|exclusive offer|hot singles|weird trick|bank details|undelivered messages/i;
const SHIPMENT =
  /\b5[A-Z]{3}-\d{5}\b|\bSI\b|\bB\/?L\b|bill of lading|shipping instruction|invoice|vessel|container|billing|\bGR\b|charges|booking|freight|draft/i;
const NEEDS_HUMAN =
  /missing|cancel|approval required|discrepan|mismatch|dispute|confirm the amount|please advise|\bquery\b|urgent|not match|amend|correction|overdue/i;

const REASONS: Record<EmailCategory, string> = {
  spam: "Sender/wording matches known phishing or promotional patterns.",
  unrelated: "No booking, B/L or invoice reference found; looks like internal or general chatter.",
  human_intervention:
    "Shipment email that mentions a missing item, amendment, cancellation, query or approval.",
  relevant: "Shipment email with booking, SI or B/L references and no open issue detected.",
};

export function classifyDemoEmail(e: {
  from: string;
  subject: string;
  body: string;
}): { category: EmailCategory; reason: string } {
  const text = `${e.subject}\n${e.body}`;
  let category: EmailCategory;
  if (SPAM_SENDER.test(e.from) || SPAM_TEXT.test(text)) category = "spam";
  else if (!SHIPMENT.test(text)) category = "unrelated";
  else if (NEEDS_HUMAN.test(text)) category = "human_intervention";
  else category = "relevant";
  return { category, reason: REASONS[category] };
}

const HEADLINE: Record<EmailCategory, string> = {
  spam: "Likely spam / phishing",
  unrelated: "Not shipment related",
  human_intervention: "Needs a human to review",
  relevant: "Shipment update",
};

/** Cheap regex extraction of the fields that matter for shipment emails. */
export function buildDemoSummary(
  e: { subject: string; body: string },
  category: EmailCategory,
  reason: string,
  attachmentCount: number,
): EmailSummary {
  const text = `${e.subject}\n${e.body}`;
  const fields: { label: string; value: string }[] = [];
  const add = (label: string, value?: string) => {
    if (value) fields.push({ label, value: value.trim() });
  };

  add("Booking", text.match(/\b5[A-Z]{3}-\d{5}\b/)?.[0]);
  add("Carrier ref", text.match(/\b[A-Z]{4}[A-Z0-9]{0,4}\d{6,}\b/)?.[0]);
  add("Invoice", text.match(/\binvoice\s+(\d{6,})/i)?.[1]);
  add("Vessel", text.match(/\b(?:V\.|voyage\s)([A-Z0-9]{4,})/i)?.[1]);
  add("POL", e.body.match(/POL:\s*(.+?)\s+POD:/)?.[1]);
  add("POD", e.body.match(/POD:\s*(.+?)(?:\s+Shipper:|\s*$|\n)/)?.[1]);
  if (attachmentCount) add("Attachments", String(attachmentCount));

  // First real sentence(s), skipping the greeting line
  const body = e.body
    .replace(/^\s*(hi|hello|dear)\b[^\n]*\n+/i, "")
    .split(/\n\s*\n|Best Regards|Regards|Thank you/i)[0]
    .replace(/\s+/g, " ")
    .trim();

  return {
    headline: HEADLINE[category],
    summary: body.slice(0, 280) || e.subject,
    reason,
    fields,
  };
}
