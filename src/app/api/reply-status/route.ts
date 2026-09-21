import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { usesGmail } from "@/lib/emails";
import { gmailGet } from "@/lib/gmail/api";
import type { GmailMessage } from "@/lib/gmail/parse";

/** How many of the newest sent messages to list. Nobody sends more than this between polls. */
const LOOK_BACK = 6;

/** The address out of a To header: `"A B" <a@b.com>, c@d.com` -> `a@b.com`. */
function firstAddress(header: string): string {
  const one = header.split(",")[0]?.trim() ?? "";
  return (/<([^>]+)>/.exec(one)?.[1] ?? one).trim();
}

/**
 * Watches the signed-in user's Sent mail for a reply going out. Two shapes:
 *
 *   GET /api/reply-status          -> { supported, ids }  the newest sent message ids
 *   GET /api/reply-status?id=<id>  -> { supported, to }   that message's recipient
 *
 * Split deliberately. The caller polls the first every couple of seconds and compares ids
 * against a snapshot taken before the reply was composed, so anything outside it is the reply.
 * That is one cheap list call. Only when a genuinely new id turns up does it ask for the
 * recipient, which is one more call, once. Reading every listed message on every poll instead
 * re-fetched the same handful of unchanged messages several times a second for as long as the
 * compose window stayed open, which is what exhausted the Gmail rate limit.
 *
 * Identity, not timing: "anything sent recently" would match the previous reply to the same
 * email and report a second reply that was never written. Not filtered to the address being
 * replied to either -- that is editable in Gmail's compose window, so a reply sent elsewhere
 * is still this reply, and `to` reports where it actually went.
 *
 * `supported` is false for accounts not reading real Gmail (the demo and backend inboxes).
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.error) return new Response("Not signed in", { status: 401 });
  if (!(await usesGmail()) || !session.accessToken) return Response.json({ supported: false });

  const token = session.accessToken;
  const id = req.nextUrl.searchParams.get("id");
  const noStore = { headers: { "Cache-Control": "private, no-store" } };

  try {
    if (id) {
      const msg = await gmailGet<GmailMessage>(token, `/messages/${encodeURIComponent(id)}`, {
        format: "metadata",
        metadataHeaders: "To",
      });
      const header = msg.payload?.headers?.find((h) => h.name.toLowerCase() === "to")?.value ?? "";
      return Response.json({ supported: true, to: firstAddress(header) }, noStore);
    }

    const list = await gmailGet<{ messages?: { id: string }[] }>(token, "/messages", {
      labelIds: "SENT",
      maxResults: String(LOOK_BACK),
      fields: "messages/id",
    });
    return Response.json(
      { supported: true, ids: (list.messages ?? []).map((m) => m.id) },
      noStore,
    );
  } catch (e) {
    console.error("[reply-status]", e);
    return new Response("Could not check Gmail", { status: 502 });
  }
}
