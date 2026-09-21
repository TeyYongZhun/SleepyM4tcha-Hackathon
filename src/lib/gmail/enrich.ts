import { adaptCategory } from "../api/adapters";
import { gatewayAvailable, gatewayFailed } from "../api/gateway-health";
import { buildDemoSummary, classifyDemoEmail } from "../demo/classify";
import { parseEmailBody } from "../demo/parse";
import { bodyText } from "../text";
import type { Email, EmailSummary } from "../types";

/**
 * Gmail knows nothing about categories, summaries or SI/BL fields, so this adds
 * them. With CLASSIFIER_API_URL set it asks the real model (the same one that
 * serves the seeded inbox, via POST /classify); otherwise, or whenever that
 * call fails, it falls back to the demo's keyword rules.
 *
 * The fallback is the point: reading your mail must not stop working because a
 * Python service is down. A wrong-ish category is recoverable, an empty inbox
 * is not.
 */

/** Unset, or an empty value in .env.local, means "use the keyword rules". */
const CLASSIFIER_API_URL = process.env.CLASSIFIER_API_URL?.replace(/\/+$/, "") || undefined;

/**
 * Short: an awake gateway answers in well under a second, and a page of messages is classified
 * before its list is shown. A gateway that is asleep never answers, so this is what the first
 * messages after it goes quiet wait before the rules take over (see api/gateway-health).
 */
const TIMEOUT_MS = 3_000;

/** One warning per process, not one per message, or a page floods the log 50 times. */
let warned = false;
function warnOnce(reason: unknown) {
  if (warned) return;
  warned = true;
  console.warn(
    `[gmail] classifier at ${CLASSIFIER_API_URL} unreachable (${reason}); ` +
      `falling back to keyword rules for this inbox`,
  );
}

type Classified = Pick<Email, "category" | "summary">;

/** null = could not classify remotely; the caller falls back. */
async function classifyRemotely(email: Email, body: string): Promise<Classified | null> {
  // Down a moment ago: don't make this message wait out a timeout to find out again
  if (!CLASSIFIER_API_URL || !gatewayAvailable()) return null;
  let status: number | undefined;
  try {
    const res = await fetch(`${CLASSIFIER_API_URL}/classify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        email_id: email.email_id,
        from: email.from.email,
        subject: email.subject,
        body,
        attachments: email.attachments.map((a) => a.filename),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    status = res.status;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return {
      // The service sends ground-truth labels ("BL_COMPARISON"); adaptCategory
      // normalises them, so the alias table has one home.
      category: adaptCategory(data.category, email.email_id),
      summary: data.summary as EmailSummary,
    };
  } catch (e) {
    gatewayFailed(status);
    warnOnce(e instanceof Error ? e.message : String(e));
    return null;
  }
}

/** Keyword rules: used when no classifier is configured, or it did not answer. */
function classifyLocally(email: Email, body: string): Classified {
  const { category, reason, confidence } = classifyDemoEmail({
    from: email.from.email,
    subject: email.subject,
    body,
  });
  return {
    category,
    summary: buildDemoSummary(
      { subject: email.subject, body },
      category,
      reason,
      confidence,
    ),
  };
}

export async function enrich(email: Email): Promise<Email> {
  const body = bodyText(email.body, email.body_type);
  const classified = (await classifyRemotely(email, body)) ?? classifyLocally(email, body);
  return {
    ...email,
    ...classified,
    shipment_info: parseEmailBody(email.subject, body),
  };
}
