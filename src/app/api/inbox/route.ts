import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { getCategoryBySlug } from "@/lib/categories";
import { getInboxPage, toInboxRow } from "@/lib/emails";
import { GmailError } from "@/lib/gmail/api";

/**
 * GET /api/inbox?page=N&category=<slug>
 * One page (50) of the inbox as list rows, whichever source the account uses. The list
 * calls this when you press Older / Newer; nothing is fetched ahead of time.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.error) return new Response("Not signed in", { status: 401 });

  const params = req.nextUrl.searchParams;
  const category = getCategoryBySlug(params.get("category") ?? "all");
  if (!category) return new Response("Unknown category", { status: 400 });
  const page = Number(params.get("page")) || 1;
  // Refresh button: read this page from the source again instead of from anything held.
  // The other sources hold nothing between requests, so it changes nothing for them.
  const refresh = params.get("refresh") === "1";

  try {
    const result = await getInboxPage(category.slug, page, { refresh });
    return Response.json(
      {
        rows: result.emails.map(toInboxRow),
        page: result.page,
        total: result.total,
        hasNext: result.hasNext,
        filtered: result.filtered,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    console.error("[inbox]", e);
    const quota = e instanceof GmailError && e.quota;
    return new Response(
      quota
        ? "Gmail is rate limiting this account. Wait a minute and try again."
        : "Could not load this page",
      { status: quota ? 429 : 502 },
    );
  }
}
