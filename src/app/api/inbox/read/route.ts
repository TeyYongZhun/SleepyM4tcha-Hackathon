import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { usesGmail } from "@/lib/emails";
import { GmailError } from "@/lib/gmail/api";
import { markMessageRead } from "@/lib/gmail";
import { rememberOpened } from "@/lib/gmail/read-memory";

let warned = false;

/**
 * POST /api/inbox/read  { id }
 * Marks a Gmail message read, so its dot stays gone. The list clears its own dot at once
 * (optimistic); this is what makes it stick. Two places are told:
 *   - this server's own memory, always -- it works whatever Gmail allows, and survives
 *     sign-outs, other browsers and restarts;
 *   - Gmail itself (drops the UNREAD label), which needs the gmail.modify permission and so
 *     only works after signing in again once. If Gmail refuses, the memory above still holds.
 * No-op for demo/mock/backend sources -- they have no real "read" state to persist.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.error) return new Response("Not signed in", { status: 401 });

  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id) return new Response("Missing id", { status: 400 });

  if (await usesGmail()) {
    rememberOpened(session.user.id, id);
    try {
      await markMessageRead(session.accessToken!, session.user.id, id);
    } catch (e) {
      // Already remembered above, so the person sees no difference; just say why Gmail wasn't told
      if (e instanceof GmailError && e.status === 403) {
        if (!warned) {
          warned = true;
          console.warn(
            "[inbox/read] Gmail would not mark the message read (403): this sign-in predates the " +
              "gmail.modify permission. Sign out and back in once to grant it.",
          );
        }
      } else {
        console.error("[inbox/read]", e);
      }
    }
  }

  return new Response(null, { status: 204 });
}
