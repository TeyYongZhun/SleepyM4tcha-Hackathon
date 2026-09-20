import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { generateDraft } from "@/lib/draft";
import { getEmail } from "@/lib/emails";

/**
 * POST /api/draft  { emailId }  ->  { body, source }
 * The reply draft for one email, used when the "AI Draft" switch is on. It only writes text:
 * nothing is sent or saved.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.error) return new Response("Not signed in", { status: 401 });

  const { emailId } = (await req.json().catch(() => ({}))) as { emailId?: unknown };
  if (typeof emailId !== "string" || !emailId) return new Response("Missing emailId", { status: 400 });

  try {
    const email = await getEmail(emailId);
    if (!email) return new Response("Email not found", { status: 404 });
    // The demo user's name is fake, so don't sign a draft with it
    const signOff = session.demo ? "" : (session.user.name ?? "");
    return Response.json(await generateDraft(email, signOff), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    console.error("[draft]", e);
    return new Response("Could not draft a reply", { status: 502 });
  }
}
