import { auth } from "@/auth";
import { usesGmail } from "@/lib/emails";
import { gmailGet } from "@/lib/gmail/api";
import type { GmailMessage } from "@/lib/gmail/parse";

/** How many of the newest sent messages to look at. Nobody sends more than this between polls. */
const LOOK_BACK = 6;

/** The address out of a To header: `"A B" <a@b.com>, c@d.com` -> `a@b.com`. */
function firstAddress(header: string): string {
  const one = header.split(",")[0]?.trim() ?? "";
  return (/<([^>]+)>/.exec(one)?.[1] ?? one).trim();
}

/**
 * GET /api/reply-status  ->  { supported, messages: [{ id, to }] }
 *
 * The newest messages in the signed-in user's Sent mail, each with the address it went to.
 * The caller snapshots the ids before the reply is composed and treats any id outside that
 * snapshot as the reply going out. Identity, not timing: "anything sent recently" would match
 * the previous reply to the same email and report a second reply that was never written.
 *
 * Deliberately not filtered to the address being replied to. The recipient is editable in
 * Gmail's compose window, so a reply sent to a corrected or entirely different address is
 * still this reply -- filtering on the original address would miss it and wrongly report that
 * nothing was sent. `to` says where it actually went, which is also the address any delivery
 * failure will be about.
 *
 * `supported` is false for accounts not reading real Gmail (the demo and backend inboxes),
 * which have no sent mail to look in.
 *
 * The newest few are listed by label and read here, rather than asked for with a `q=` search:
 * search runs off an index that trails a send by several seconds, which is exactly the window
 * this is polled in.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user || session.error) return new Response("Not signed in", { status: 401 });
  if (!(await usesGmail()) || !session.accessToken) return Response.json({ supported: false });

  const token = session.accessToken;
  try {
    const list = await gmailGet<{ messages?: { id: string }[] }>(token, "/messages", {
      labelIds: "SENT",
      maxResults: String(LOOK_BACK),
    });

    const messages = await Promise.all(
      (list.messages ?? []).map(async ({ id }) => {
        const msg = await gmailGet<GmailMessage>(token, `/messages/${encodeURIComponent(id)}`, {
          format: "metadata",
          metadataHeaders: "To",
        }).catch(() => null);
        const header =
          msg?.payload?.headers?.find((h) => h.name.toLowerCase() === "to")?.value ?? "";
        return { id, to: firstAddress(header) };
      }),
    );

    return Response.json(
      { supported: true, messages },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    console.error("[reply-status]", e);
    return new Response("Could not check Gmail", { status: 502 });
  }
}
