import "server-only";
import type { Email } from "../types";
import { PAGE_SIZE } from "../paging";
import { GmailError, gmailGet, gmailPost, mapPool } from "./api";
import { enrich } from "./enrich";
import { findPart, mimeOf, parseMessage, type GmailMessage } from "./parse";

/**
 * Gmail as the email source: the signed-in user's inbox, read with their own
 * access token (Auth.js keeps it fresh). Server-side only.
 */

// The gmailGet pacing keeps this under Gmail's quota; concurrency only hides latency.
const CONCURRENCY = 8;


// Messages already loaded, per user. Going back to a page (or opening an email from
// it) costs no Gmail calls; after STORE_TTL_MS they are refetched so unread state
// doesn't go stale.
const STORE_TTL_MS = 10 * 60_000;
const STORE_MAX = 1000;
type Store = Map<string, { at: number; email: Email }>;
type Cursor = { at: number; tokens: (string | undefined)[]; total?: number };

// On globalThis, not module scope: the pages and the /api/inbox route are bundled
// separately and would each get their own copy, so they would never share a cache.
const g = globalThis as unknown as { __wayboxGmail?: { stores: Map<string, Store>; cursors: Map<string, Cursor> } };
const { stores, cursors } = (g.__wayboxGmail ??= { stores: new Map(), cursors: new Map() });

function storeFor(userKey: string) {
  let store = stores.get(userKey);
  if (!store) stores.set(userKey, (store = new Map()));
  if (store.size > STORE_MAX) {
    const now = Date.now();
    for (const [id, held] of store) if (now - held.at > STORE_TTL_MS) store.delete(id);
    if (store.size > STORE_MAX) store.clear();
  }
  return store;
}

const fresh = (held?: { at: number }) => !!held && Date.now() - held.at <= STORE_TTL_MS;

async function fetchMessage(token: string, id: string): Promise<Email | null> {
  try {
    const msg = await gmailGet<GmailMessage>(token, `/messages/${encodeURIComponent(id)}`, {
      format: "full",
    });
    return enrich(parseMessage(msg));
  } catch (e) {
    if (e instanceof GmailError && e.status === 404) return null; // deleted since listing
    throw e;
  }
}

// Gmail pages are cursor-based: page N is reached with the token returned by page N-1.
// tokens[i] is the token that opens page i+1 (page 1 needs none). Kept per user so
// "next page" is one list call; a cold instance or an unseen page walks forward using
// list calls only (ids, no message bodies), which are cheap.
const CURSOR_TTL_MS = 10 * 60_000;

async function listPage(token: string, pageToken?: string) {
  const page = await gmailGet<{ messages?: { id: string }[]; nextPageToken?: string }>(
    token,
    "/messages",
    {
      labelIds: "INBOX",
      maxResults: String(PAGE_SIZE),
      fields: "messages/id,nextPageToken",
      ...(pageToken ? { pageToken } : {}),
    },
  );
  return { ids: (page.messages ?? []).map((m) => m.id), next: page.nextPageToken };
}

export interface InboxPage {
  emails: Email[];
  /** 1-based; may be lower than requested if that page is past the end */
  page: number;
  /** Messages in the whole inbox, when Gmail reported it */
  total?: number;
  hasNext: boolean;
}

/** One page (newest first) of the inbox: lists ids, then loads only the messages not held yet. */
export async function getInboxPage(
  token: string,
  userKey: string,
  requested: number,
  retried = false,
): Promise<InboxPage> {
  let page = Math.max(1, Math.floor(requested) || 1);
  let cur = cursors.get(userKey);
  if (!cur || Date.now() - cur.at > CURSOR_TTL_MS) {
    cur = { at: Date.now(), tokens: [undefined] };
    cursors.set(userKey, cur);
  }

  let ids: string[];
  let next: string | undefined;
  try {
    while (cur.tokens.length < page) {
      const r = await listPage(token, cur.tokens[cur.tokens.length - 1]);
      if (!r.next) {
        page = cur.tokens.length; // past the end: show the last page instead
        break;
      }
      cur.tokens.push(r.next);
    }
    ({ ids, next } = await listPage(token, cur.tokens[page - 1]));
    if (next && cur.tokens.length === page) cur.tokens.push(next);
  } catch (e) {
    // A stale page token: forget the cursor and walk again from page 1, once
    if (e instanceof GmailError && e.status === 400 && !retried) {
      cursors.delete(userKey);
      return getInboxPage(token, userKey, requested, true);
    }
    throw e;
  }

  // "1-50 of 1,234": one cheap call, remembered with the cursor. Not worth failing the page.
  if (cur.total === undefined) {
    cur.total = await gmailGet<{ messagesTotal?: number }>(token, "/labels/INBOX", {
      fields: "messagesTotal",
    })
      .then((l) => l.messagesTotal)
      .catch(() => undefined);
  }

  const store = storeFor(userKey);
  const todo = ids.filter((id) => !fresh(store.get(id)));
  await mapPool(todo, CONCURRENCY, async (id) => {
    const email = await fetchMessage(token, id);
    if (email) store.set(id, { at: Date.now(), email });
  });

  const emails = ids.flatMap((id) => store.get(id)?.email ?? []);
  console.info(`[gmail] page ${page}: ${emails.length} messages (${todo.length} fetched)`);
  return { emails, page, total: cur.total, hasNext: !!next };
}

/** One message by id (opening an email directly, e.g. from a bookmark). */
export async function getMessage(
  token: string,
  userKey: string,
  id: string,
): Promise<Email | undefined> {
  const store = storeFor(userKey);
  const held = store.get(id);
  if (fresh(held)) return held!.email;
  const email = await fetchMessage(token, id);
  if (!email) return undefined;
  store.set(id, { at: Date.now(), email });
  return email;
}

/**
 * Clears Gmail's UNREAD label, so it stays read the next time the inbox is
 * loaded (not just in the current tab), and updates the held copy so a
 * same-session reload of this page shows it as read without an extra fetch.
 */
export async function markMessageRead(token: string, userKey: string, id: string): Promise<void> {
  await gmailPost(token, `/messages/${encodeURIComponent(id)}/modify`, { removeLabelIds: ["UNREAD"] });
  const held = storeFor(userKey).get(id);
  if (held) held.email = { ...held.email, unread: false };
}

export interface AttachmentFile {
  data: Buffer;
  filename: string;
  mime_type: string;
}

/** One attachment's bytes, straight from Gmail. Nothing is stored. */
export async function fetchAttachment(
  token: string,
  messageId: string,
  partId: string,
): Promise<AttachmentFile | null> {
  let msg: GmailMessage;
  try {
    msg = await gmailGet<GmailMessage>(token, `/messages/${encodeURIComponent(messageId)}`, {
      format: "full",
    });
  } catch (e) {
    if (e instanceof GmailError && e.status === 404) return null;
    throw e;
  }

  // Look the part up by partId (stable). Gmail's attachmentId can change between calls.
  const part = findPart(msg.payload, partId);
  if (!part || (!part.filename && !part.body?.attachmentId)) return null;

  let b64 = part.body?.data;
  if (!b64 && part.body?.attachmentId) {
    const att = await gmailGet<{ data?: string }>(
      token,
      `/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(part.body.attachmentId)}`,
    );
    b64 = att.data;
  }
  if (!b64) return null;

  return {
    data: Buffer.from(b64, "base64url"),
    filename: part.filename || "attachment",
    mime_type: mimeOf(part),
  };
}
