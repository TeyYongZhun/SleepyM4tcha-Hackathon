import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { usesGmail } from "@/lib/emails";
import { gmailGet } from "@/lib/gmail/api";
import type { GmailMessage } from "@/lib/gmail/parse";

/** How many of the newest inbox messages to look at. A bounce arrives at the top. */
const LOOK_BACK = 5;
/** Who a delivery failure comes from. Gmail uses mailer-daemon@googlemail.com. */
const DAEMON = /\b(mailer-daemon|postmaster)@/i;

/**
 * GET /api/reply-bounce[?to=<address>]  ->  { supported, ids }
 *
 * The ids of recent inbox messages that are a delivery failure -- what arrives when the
 * address doesn't exist. With `to`, only failures naming that address; without it, every
 * recent one.
 *
 * That split is what the caller needs: it snapshots the ids before the reply is composed,
 * when the address it will actually go to isn't known yet (Gmail lets the recipient be edited
 * in the compose window), then checks against the address it really went to. Counting only
 * ids outside the snapshot keeps an older bounce for the same dead address from being blamed
 * on this reply.
 *
 * `supported` is false for accounts not reading real Gmail (the demo and backend inboxes):
 * their senders are invented, so nothing there can bounce.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.error) return new Response("Not signed in", { status: 401 });
  if (!(await usesGmail()) || !session.accessToken) return Response.json({ supported: false });

  const to = req.nextUrl.searchParams.get("to")?.trim() ?? "";
  if (to && !/^[^\s"'(){}<>,:;]+@[^\s"'(){}<>,:;]+$/.test(to)) {
    return new Response("Bad request", { status: 400 });
  }

  const token = session.accessToken;
  try {
    const list = await gmailGet<{ messages?: { id: string }[] }>(token, "/messages", {
      labelIds: "INBOX",
      maxResults: String(LOOK_BACK),
    });

    const needle = to.toLowerCase();
    const matched = await Promise.all(
      (list.messages ?? []).map(async ({ id }) => {
        // `full` so the snippet is definitely there (the docs don't promise it for `metadata`),
        // with a field mask so a bounce carrying the whole original message stays a small read.
        const msg = await gmailGet<GmailMessage & { snippet?: string }>(
          token,
          `/messages/${encodeURIComponent(id)}`,
          { format: "full", fields: "snippet,payload/headers" },
        ).catch(() => null);
        if (!msg) return null;

        const from = msg.payload?.headers?.find((h) => h.name.toLowerCase() === "from")?.value ?? "";
        if (!DAEMON.test(from)) return null;
        if (!needle) return id; // snapshot: every delivery failure already sitting there
        // The report names the address it couldn't reach ("wasn't delivered to x@y.com because
        // the address couldn't be found"), which is what ties the failure to this reply.
        return (msg.snippet ?? "").toLowerCase().includes(needle) ? id : null;
      }),
    );

    return Response.json(
      { supported: true, ids: matched.filter((id): id is string => id !== null) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    console.error("[reply-bounce]", e);
    return new Response("Could not check Gmail", { status: 502 });
  }
}
