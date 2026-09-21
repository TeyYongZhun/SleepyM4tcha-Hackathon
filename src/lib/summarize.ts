import "server-only";
import { bodyText } from "./text";
import type { Email } from "./types";

/**
 * The TL;DR in the summary panel: a headline and a short summary of what the email says.
 * It is written when an email is opened, for every source (demo, seeded backend, Gmail), and
 * replaces the summary text the classifier / demo rules attached (a fixed headline per
 * category and the first 280 characters of the body).
 *
 * It is an extractive summariser, so it needs no API key and nothing leaves this server: the
 * email is cleaned of quoted history and signatures, split into sentences, each sentence is
 * scored for how much it matters in a logistics email (requests, deadlines, references,
 * shipping terms, overlap with the subject, position), and the best few are kept in their
 * original order. The headline comes from the subject.
 *
 * Only the summary text is replaced; category, confidence, fields and the SI-vs-BL verdict
 * stay as the pipeline produced them.
 */

const SUMMARY_CHARS = 280;
const HEADLINE_CHARS = 110;

interface Tldr {
  headline: string;
  summary: string;
}

const GREETING = /^(hi|hello|dear|good (morning|afternoon|evening)|hey)\b[^.!?]{0,40}[,:]?$/i;
/** Where quoted history or a signature starts: nothing after it is part of this message. */
const CUT_LINE =
  /^(on .{5,120} wrote:|-{2,}\s*(original|forwarded) message|_{5,}|from:\s.+@|sent from my )/i;
const SIGN_OFF = /^(best regards|kind regards|warm regards|regards|thanks|thank you|sincerely|cheers)[,.!]?$/i;

const ACTION_WORDS =
  /\b(please|kindly|request(?:ed|ing)?|confirm|need(?:ed|s)?|require[ds]?|urgent(?:ly)?|asap|advise|provide|send|arrange|amend|revise[ds]?|update[ds]?|pending|delay(?:ed)?|deadline|cut-?off|mismatch|discrepanc\w+|error|missing|correct(?:ed|ion)?|overdue|unpaid|payment)\b/i;
const LOGISTICS_WORDS =
  /\b(bill of lading|b\/l|bl|shipping instruction|si|container|vessel|voyage|invoice|charges?|freight|customs|eta|etd|port|booking|hs code|shipper|consignee|notify|weight|cargo|demurrage|detention|release|draft)\b/i;
/** Booking / BL / invoice style references: letters and digits mixed, or a long number. */
const REFERENCE = /\b(?=[A-Z0-9-]*\d)(?=[A-Z0-9-]*[A-Z])[A-Z0-9-]{6,}\b|\b\d{6,}\b/;
const STOP = new Set(
  "the a an and or of to for in on at is are was were be by with from re fw fwd this that it as we you your our please".split(
    " ",
  ),
);

/** The message itself: quoted lines dropped, cut at the first sign-off or quoted history. */
function cleanBody(text: string): string {
  const kept: string[] = [];
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (CUT_LINE.test(line) || SIGN_OFF.test(line)) break;
    if (line.startsWith(">")) continue;
    kept.push(line);
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function splitSentences(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z0-9"“(])/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length >= 20 && !GREETING.test(s));
}

const words = (s: string) => s.toLowerCase().match(/[a-z0-9]+/g) ?? [];

const ACRONYMS = new Set(
  "BL SI PO OC FOB CIF CFR ETA ETD HS MT LCL FCL VGM EDI AWB HBL MBL CY CFS".split(" "),
);
/** A booking / OC number such as 5RSG-00133. */
const BOOKING = /\b(\d?[A-Z]{2,5}-\d{4,})\b/;

const isMostlyUpper = (s: string) => {
  const letters = s.replace(/[^A-Za-z]/g, "");
  return letters.length > 0 && letters.replace(/[^A-Z]/g, "").length / letters.length >= 0.6;
};

function sentenceCase(s: string): string {
  return s
    .toLowerCase()
    .split(" ")
    .map((w, i) => {
      if (ACRONYMS.has(w.replace(/[^a-z/&]/g, "").toUpperCase())) return w.toUpperCase();
      return i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w;
    })
    .join(" ");
}

/**
 * The subject as a headline. Mail systems here send coded, all-caps subjects
 * ("TO CONFIRM DOCS _ 5RSG-00133 _ CALLAO_PERU _ ..."): for those the leading phrase is the
 * point, so it becomes "To confirm docs · 5RSG-00133". Ordinary subjects are kept as written.
 */
function headlineFrom(subject: string): string {
  const clean = subject
    .replace(/^\s*((re|fw|fwd)\s*[:_]\s*)+/i, "")
    .replace(/\s+/g, " ")
    .trim();

  let headline = clean;
  if (isMostlyUpper(clean)) {
    // Fields are separated by " _ " or " - "; take the first one that is a phrase, not a date or code
    const phrase = clean
      .split(/\s+[-–—]\s+|\s*_\s+|\s+_\s*/)
      .map((seg) =>
        seg
          .split(" ")
          .filter((w) => !/\d/.test(w))
          .join(" ")
          .trim(),
      )
      .find((seg) => (seg.match(/[A-Za-z]{2,}/g) ?? []).length >= 2);
    if (phrase) {
      const ref = BOOKING.exec(clean)?.[1];
      headline = sentenceCase(phrase) + (ref ? ` · ${ref}` : "");
    }
  }
  return headline.length > HEADLINE_CHARS
    ? `${headline.slice(0, HEADLINE_CHARS - 1).trimEnd()}…`
    : headline;
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max * 0.6))}…`;
}

/** Leading politeness and hedges: "Please", "Kindly", "Pls assist to", "Could you please". */
const POLITE =
  /^(?:(?:please|kindly|pls|(?:could|can|would) you)\b[\s,]*)+(?:(?:assist|help)(?: us)?(?: to| in| with)?\s+)?/i;
/** A sentence that hands something over: "Attached are…", "Please find attached…". */
const DELIVERY =
  /^(?:(?:please|kindly)\s+)?(?:find(?:\s+the)?(?:\s+attached)?|attached(?:\s+(?:are|is|herewith))?|enclosed(?:\s+(?:are|is))?|see attached)\s+/i;
const URGENT = /\b(?:asap|urgent(?:ly)?|immediately)\b/i;

/** "Pls assist to send the draft BL asap." -> "Send the draft BL (urgent)". */
function normalizeAsk(sentence: string): string {
  let t = sentence.replace(POLITE, "").replace(/[.!?]+$/, "");
  const urgent = URGENT.test(t);
  t = t
    .replace(URGENT, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[,\s]+$/, "")
    .trim();
  t = t.charAt(0).toUpperCase() + t.slice(1);
  return urgent ? `${t} (urgent)` : t;
}

/** ALL-CAPS runs of words ("PAPERONE DIGITAL COPIER PAPER") read as shouting in a title. */
function tameCaps(s: string): string {
  return s.replace(/\b[A-Z][A-Z&.'-]{2,}(?: [A-Z][A-Z&.'-]{2,})+\b/g, (run) =>
    run.split(" ").every((w) => ACRONYMS.has(w))
      ? run
      : run.toLowerCase().replace(/(^|[ (-])([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase()),
  );
}

/**
 * The headline as a one-line gist: what is being asked, and what it is about. The request
 * ("Please check the details and confirm") is turned into an instruction, and the specifics
 * come from the sentence that hands something over ("Attached are the SI and draft BL for OC
 * 5RSG-00133"): "Check the SI and draft BL for OC 5RSG-00133 and confirm". Null when the email
 * has neither, and the caller falls back to the subject.
 */
function gistHeadline(sentences: string[]): string | null {
  const request = sentences.find(
    (s) => !DELIVERY.test(s) && (POLITE.test(s) || /\b(?:need|require)s?\b/i.test(s)),
  );
  const delivery = sentences.find((s) => DELIVERY.test(s));
  const object = delivery?.replace(DELIVERY, "").replace(/[.!]+$/, "").trim();

  let gist = request ? normalizeAsk(request) : "";
  if (gist && object) {
    // "Check the details and confirm" says nothing on its own: name what the details are
    const named = gist.replace(/\bthe details\b/i, object);
    gist = named !== gist ? named : `${gist} · ${object.replace(/^the\s+/i, "")}`;
  } else if (!gist && object) {
    gist = `Review ${object}`;
  }
  if (!gist) return null;

  // Keep the key reference in the title ("Invoice 480221") if the wording above dropped it
  if (!REFERENCE.test(gist)) {
    const m = /(?:\b([A-Za-z]{3,})\s+)?(\b(?=[A-Z0-9-]*\d)(?=[A-Z0-9-]*[A-Z])[A-Z0-9-]{6,}\b|\b\d{6,}\b)/.exec(
      sentences.join(" "),
    );
    if (m) gist += ` · ${m[1] && !STOP.has(m[1].toLowerCase()) ? `${m[1]} ` : ""}${m[2]}`;
  }
  return clip(tameCaps(gist), HEADLINE_CHARS);
}

export function extractiveTldr(subject: string, text: string): Tldr {
  const seen = new Set<string>();
  const sentences = splitSentences(cleanBody(text)).filter((s) => {
    const k = s.toLowerCase();
    return seen.has(k) ? false : (seen.add(k), true);
  });
  const headline = gistHeadline(sentences) ?? (headlineFrom(subject) || "(no subject)");
  const subjectWords = new Set(words(subject).filter((w) => !STOP.has(w) && w.length > 2));

  const candidates = sentences.map((s, index) => {
    let score = 0;
    if (ACTION_WORDS.test(s)) score += 2;
    if (REFERENCE.test(s)) score += 1.5;
    if (LOGISTICS_WORDS.test(s)) score += 1;
    score += Math.min(2, words(s).filter((w) => subjectWords.has(w)).length * 0.5);
    score += index === 0 ? 1.5 : index === 1 ? 0.75 : 0; // the point usually comes first
    if (s.length > 220) score -= 0.5;
    return { s, index, score };
  });

  if (candidates.length === 0) return { headline, summary: headline };

  // Best sentences first, as many as fit, then back into reading order
  const chosen: typeof candidates = [];
  let used = 0;
  for (const c of [...candidates].sort((a, b) => b.score - a.score || a.index - b.index)) {
    if (chosen.length >= 3) break;
    if (chosen.length > 0 && used + c.s.length + 1 > SUMMARY_CHARS) continue;
    chosen.push(c);
    used += c.s.length + 1;
  }
  const summary = chosen
    .sort((a, b) => a.index - b.index)
    .map((c) => c.s)
    .join(" ");
  return { headline, summary: clip(summary, SUMMARY_CHARS) };
}

/** The email with its TL;DR (headline + summary) written from what it actually says. */
export function withSummary(email: Email): Email {
  const tldr = extractiveTldr(email.subject, bodyText(email.body, email.body_type));
  return { ...email, summary: { ...email.summary, ...tldr } };
}
