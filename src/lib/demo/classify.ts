import type { EmailCategory, EmailSummary } from "../types";

/**
 * DEMO ONLY. The dummy inbox ships without labels, so these keyword rules stand
 * in for the real classifier whenever no backend is configured. They are tuned
 * against sdoc_classifier/data/ground_truth.json and currently agree with it on
 * all 520 demo emails -- but they are fitted to those templates, so treat that
 * as "the fallback demo looks right", not as a general-purpose classifier. The
 * real model lives in sdoc_classifier/ and is served via BACKEND_API_URL.
 */

const SPAM_SENDER =
  /@(crypto-invest|secure-mailbox|webmail-verify|parcel-track|logistics-deals|prize-claims)\./i;
const SPAM_TEXT =
  /bitcoin|congratulations|gift card|verify (your )?account|click here|storage (is )?full|exceeded its storage|unpaid customs|guaranteed|claim (your|prize)|suspension|exclusive offer|hot singles|weird trick|bank details|undelivered messages|won a|lottery|90% off/i;

/** Automated notices and office chatter. Checked early: "Billing Process Completed" is a bot notice, not an invoice query. */
const NOTICE =
  /\bRPA\b|UPDATE SUMMARY|Berthing|Pending BL Release|Outstanding BL|Miss Connection|Approval Required|Time Off|\bReminder\b|holiday|office (will )?(resume|close)|automated notification|no action required/i;

/**
 * Both coded subject formats look alike (`X - ... - ... - ...`); the first field
 * decides. "SI" means an SI request; a short upper-case department code
 * (AIE, AFEMY, AFPTME, AFRT, ...) means a BL to check.
 */
const CODED_SI = /^\s*(?:(?:RE|FW|FWD)[ :]\s*)*SI\s*-/i;
const CODED_DEPT = /^\s*(?:(?:RE|FW|FWD)[ :]\s*)*[A-Z]{2,8}\s*-(?:[^-]*-){3}/;

const SUBJ_SI = /REQUEST SI|SI NEEDED|CUST SI|SI REQUEST/i;
const SUBJ_BL = /TO CONFIRM DOCS|REQUEST BL DRAFT|draft b\/?l|amend b\/?l|bl draft/i;
const BODY_SI =
  /shipping instruction|raise the si|issue the si|prepare the si|submit the si|si for booking/i;
const BODY_BL =
  /bill of lading|draft b\/?l|verify the b\/?l|compare the si|check the details and confirm|confirm the docs/i;
const INVOICE =
  /\binvoice\b|billing|credit note|\bTHC\b|local charges|detention|demurrage|\bD ?& ?D\b|freight|payment|\bGR\b|telex release|statement|charges/i;

const REASONS: Record<EmailCategory, string> = {
  spam: "Sender/wording matches known phishing or promotional patterns.",
  bl_comparison: "Refers to a draft bill of lading to be checked against the shipping instruction.",
  si_request: "Asks for a shipping instruction to be prepared, issued or submitted.",
  invoice_query: "About billing, charges, credit notes or payment.",
  general: "Automated notice or general chatter; no SI, B/L or invoice action found.",
};

export function classifyDemoEmail(e: {
  from: string;
  subject: string;
  body: string;
}): { category: EmailCategory; reason: string } {
  // '' never fires next to '_', and these subjects use '_' as the separator
  // ("SI NEEDED_ 5APH-26773"), so normalise before matching.
  const subject = e.subject.replace(/_/g, " ");
  const text = `${subject}
${e.body}`;
  let category: EmailCategory;
  if (SPAM_SENDER.test(e.from) || SPAM_TEXT.test(text)) category = "spam";
  else if (NOTICE.test(subject)) category = "general";
  else if (CODED_SI.test(subject) || SUBJ_SI.test(subject)) category = "si_request";
  else if (SUBJ_BL.test(subject)) category = "bl_comparison";
  else if (CODED_DEPT.test(subject)) category = "bl_comparison";
  else if (BODY_SI.test(text)) category = "si_request";
  else if (BODY_BL.test(text)) category = "bl_comparison";
  else if (INVOICE.test(text)) category = "invoice_query";
  else category = "general";
  return { category, reason: REASONS[category] };
}

const HEADLINE: Record<EmailCategory, string> = {
  spam: "Likely spam / phishing",
  bl_comparison: "Draft B/L to check against the SI",
  si_request: "Shipping instruction requested",
  invoice_query: "Billing / charges query",
  general: "General notice",
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
