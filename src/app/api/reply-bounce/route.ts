import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { usesGmail } from "@/lib/emails";
import { gmailGet } from "@/lib/gmail/api";
import type { GmailMessage } from "@/lib/gmail/parse";

/** How many of the newest inbox messages to list. A bounce arrives at the top. */
const LOOK_BACK = 5;
/** Who a delivery failure comes from. Gmail uses mailer-daemon@googlemail.com. */
const DAEMON = /\b(mailer-daemon|postmaster)@/i;

/**
 * Watches the inbox for the reply coming straight back, which is what arrives when the address
 * doesn't exist. Two shapes, for the same reason as /api/reply-status:
 *
 *   GET /api/reply-bounce                    -> { supported, ids }    newest inbox message ids
 *   GET /api/reply-bounce?id=<id>&to=<addr>  -> { supported, match }  is that one a failure for addr
 *
 * The caller snapshots the ids before the reply is composed -- when the address it will go to
 * isn't known yet, since Gmail lets the recipient be edited -- then polls the cheap list and
 * only opens ids that weren't in the snapshot. Counting only new ids also keeps an older
 * bounce for the same dead address from being blamed on this reply.
 *
 * `supported` is false for accounts not reading real Gmail (the demo and backend inboxes):
 * their senders are invented, so nothing there can bounce.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.error) return new Response("Not signed in", { status: 401 });
  if (!(await usesGmail()) || !session.accessToken) return Response.json({ supported: false });

  const token = session.accessToken;
  const params = req.nextUrl.searchParams;
  const id = params.get("id");
  const to = params.get("to")?.trim().toLowerCase() ?? "";
  const noStore = { headers: { "Cache-Control": "private, no-store" } };

  if (id && !/^[^\s"'(){}<>,:;]+@[^\s"'(){}<>,:;]+$/.test(to)) {
    return new Response("Bad request", { status: 400 });
  }

  try {
    if (id) {
      // `full` so the snippet is definitely there (the docs don't promise it for `metadata`),
      // with a field mask so a bounce carrying the whole original message stays a small read.
      const msg = await gmailGet<GmailMessage & { snippet?: string }>(
        token,
        `/messages/${encodeURIComponent(id)}`,
        { format: "full", fields: "snippet,payload/headers" },
      );
      const from = msg.payload?.headers?.find((h) => h.name.toLowerCase() === "from")?.value ?? "";
      // The report names the address it couldn't reach ("wasn't delivered to x@y.com because
      // the address couldn't be found"), which is what ties the failure to this reply.
      const match = DAEMON.test(from) && (msg.snippet ?? "").toLowerCase().includes(to);
      return Response.json({ supported: true, match }, noStore);
    }

    const list = await gmailGet<{ messages?: { id: string }[] }>(token, "/messages", {
      labelIds: "INBOX",
      maxResults: String(LOOK_BACK),
      fields: "messages/id",
    });
    return Response.json(
      { supported: true, ids: (list.messages ?? []).map((m) => m.id) },
      noStore,
    );
  } catch (e) {
    console.error("[reply-bounce]", e);
    return new Response("Could not check Gmail", { status: 502 });
  }
}
