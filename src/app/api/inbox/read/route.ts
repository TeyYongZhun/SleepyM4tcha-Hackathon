import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { usesGmail } from "@/lib/emails";
import { GmailError } from "@/lib/gmail/api";
import { markMessageRead } from "@/lib/gmail";

/**
 * POST /api/inbox/read  { id }
 * Marks a message read. The list clears its own unread dot right away
 * (optimistic); this is what makes it stick after a reload. No-op for
 * demo/mock/backend sources -- they have no real "read" state to persist.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.error) return new Response("Not signed in", { status: 401 });

  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id) return new Response("Missing id", { status: 400 });

  if (await usesGmail()) {
    try {
      await markMessageRead(session.accessToken!, session.user.id, id);
    } catch (e) {
      console.error("[inbox/read]", e);
      const quota = e instanceof GmailError && e.quota;
      return new Response("Could not mark read", { status: quota ? 429 : 502 });
    }
  }

  return new Response(null, { status: 204 });
}
