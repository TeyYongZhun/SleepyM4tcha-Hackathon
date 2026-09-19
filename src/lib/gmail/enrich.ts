import { buildDemoSummary, classifyDemoEmail } from "../demo/classify";
import { parseEmailBody } from "../demo/parse";
import type { Email } from "../types";

/**
 * STAND-IN. Gmail knows nothing about categories, summaries or SI/BL fields, so
 * until the real classifier exists this reuses the demo's keyword rules. When
 * the real backend/AI step is ready, replace the body of `enrich` with a call
 * to it (or drop it and set BACKEND_API_URL); nothing else needs to change.
 */

function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

export function enrich(email: Email): Email {
  const body = email.body_type === "html" ? htmlToText(email.body) : email.body;
  const { category, reason } = classifyDemoEmail({
    from: email.from.email,
    subject: email.subject,
    body,
  });
  return {
    ...email,
    category,
    shipment_info: parseEmailBody(email.subject, body),
    summary: buildDemoSummary(
      { subject: email.subject, body },
      category,
      reason,
      email.attachments.length,
    ),
  };
}
