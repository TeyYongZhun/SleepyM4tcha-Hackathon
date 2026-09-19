import { adaptAddress, MIME_BY_EXT } from "../api/adapters";
import type { Attachment, Email } from "../types";

/** The parts of a Gmail API `messages.get?format=full` response that we read. */
export interface GmailPart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { size?: number; attachmentId?: string; data?: string };
  parts?: GmailPart[];
}

export interface GmailMessage {
  id: string;
  internalDate?: string;
  labelIds?: string[];
  snippet?: string;
  payload?: GmailPart;
}

/** Where the attachment route (app/api/attachments) serves a part from. */
export const attachmentUrl = (messageId: string, partId: string) =>
  `/api/attachments/${messageId}/${encodeURIComponent(partId)}`;

const header = (part: GmailPart, name: string) =>
  part.headers?.find((h) => h.name.toLowerCase() === name)?.value;

/** Gmail sometimes labels a PDF `application/octet-stream`; trust the extension then. */
export function mimeOf(part: GmailPart): string {
  const mime = part.mimeType?.toLowerCase();
  if (mime && mime !== "application/octet-stream") return mime;
  const ext = part.filename?.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? mime ?? "application/octet-stream";
}

export function findPart(root: GmailPart | undefined, partId: string): GmailPart | undefined {
  if (!root) return undefined;
  if (root.partId === partId) return root;
  for (const p of root.parts ?? []) {
    const hit = findPart(p, partId);
    if (hit) return hit;
  }
  return undefined;
}

function decode(part: GmailPart): string {
  const bytes = Buffer.from(part.body?.data ?? "", "base64url");
  const charset = header(part, "content-type")?.match(/charset="?([\w-]+)"?/i)?.[1] ?? "utf-8";
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return bytes.toString("utf8"); // unknown charset label
  }
}

/** "A <a@x>, "B, Co" <b@x>" -> one string per address (commas inside quotes are kept). */
function splitAddresses(value?: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (const ch of value ?? "") {
    if (ch === '"') quoted = !quoted;
    if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

interface Walked {
  html?: string;
  text?: string;
  files: GmailPart[];
  /** Inline images by Content-ID, so `cid:` references in the HTML can be pointed at them. */
  cids: Map<string, GmailPart>;
}

function walk(part: GmailPart, acc: Walked) {
  const mime = part.mimeType?.toLowerCase() ?? "";
  const hasData = !!(part.body?.attachmentId || part.body?.data);
  const cid = header(part, "content-id")?.replace(/^<|>$/g, "");
  if (cid && hasData) acc.cids.set(cid, part);

  if (part.parts?.length) part.parts.forEach((p) => walk(p, acc));
  else if (part.filename && hasData) acc.files.push(part);
  else if (mime === "text/html" && part.body?.data) acc.html ??= decode(part);
  else if (mime === "text/plain" && part.body?.data) acc.text ??= decode(part);
}

/** One Gmail message -> the UI's Email. Category and summary are filled in later (enrich.ts). */
export function parseMessage(msg: GmailMessage): Email {
  const root = msg.payload ?? {};
  const acc: Walked = { files: [], cids: new Map() };
  walk(root, acc);

  const attachments: Attachment[] = acc.files
    .filter((p) => p.partId)
    .map((p) => ({
      id: p.partId!,
      filename: p.filename!,
      mime_type: mimeOf(p),
      size: p.body?.size ?? 0,
      url: attachmentUrl(msg.id, p.partId!),
    }));

  let body = acc.html ?? acc.text ?? msg.snippet ?? "";
  if (acc.html) {
    body = body.replace(/cid:([^"'\s)>]+)/gi, (whole, raw: string) => {
      let id = raw;
      try {
        id = decodeURIComponent(raw);
      } catch {}
      const part = acc.cids.get(id);
      return part?.partId ? attachmentUrl(msg.id, part.partId) : whole;
    });
  }

  const ms = Number(msg.internalDate);
  const dateHeader = new Date(header(root, "date") ?? "");
  const received_at =
    Number.isFinite(ms) && ms > 0
      ? new Date(ms).toISOString()
      : Number.isNaN(dateHeader.getTime())
        ? undefined
        : dateHeader.toISOString();

  return {
    email_id: msg.id,
    from: adaptAddress(header(root, "from") ?? ""),
    to: splitAddresses(header(root, "to")).map(adaptAddress),
    subject: header(root, "subject") || "(no subject)",
    body,
    body_type: acc.html ? "html" : "text",
    received_at,
    unread: msg.labelIds?.includes("UNREAD"),
    attachments,
    category: "unrelated", // placeholder until enrich()
  };
}
