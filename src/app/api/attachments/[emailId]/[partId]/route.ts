import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { fetchAttachment } from "@/lib/gmail";
import { GmailError } from "@/lib/gmail/api";

/**
 * GET /api/attachments/:emailId/:partId
 * Fetches one attachment from Gmail on demand (as the signed-in user) and passes
 * it through. Nothing is written to disk, so it works on Vercel.
 */

// Shown in the page (image / PDF / text preview). Anything else is forced to download.
const PREVIEWABLE =
  /^(application\/pdf|image\/(png|jpe?g|gif|webp|avif|bmp|svg\+xml)|text\/(plain|csv))$/;

const text = (body: string, status: number) => new Response(body, { status });

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/attachments/[emailId]/[partId]">,
) {
  const session = await auth();
  if (!session?.accessToken || session.error) return text("Not signed in", 401);
  // The demo inbox's files are static (public/dummy) and never come through here
  if (session.demo) return text("Not found", 404);

  const { emailId, partId } = await ctx.params;
  // Ids are interpolated into a Gmail URL: accept only what Gmail actually issues
  if (!/^[0-9a-f]+$/i.test(emailId) || !/^\d+(\.\d+)*$/.test(partId)) {
    return text("Bad request", 400);
  }

  let file;
  try {
    file = await fetchAttachment(session.accessToken, emailId, partId);
  } catch (e) {
    console.error("[attachments]", e);
    return text("Could not fetch the attachment from Gmail", e instanceof GmailError && e.status === 401 ? 401 : 502);
  }
  if (!file) return text("Not found", 404);

  const mime = /^[\w.+-]+\/[\w.+-]+$/.test(file.mime_type) ? file.mime_type : "application/octet-stream";
  const inline = PREVIEWABLE.test(mime);
  const ascii = file.filename.replace(/[^\x20-\x7e]|["\\]/g, "_");

  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(file.data.length),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      // Files come from arbitrary senders and are served from our origin: never let
      // one run as a page (SVG/HTML scripts). Chrome's PDF viewer breaks under a sandbox CSP.
      "X-Content-Type-Options": "nosniff",
      ...(mime === "application/pdf" ? {} : { "Content-Security-Policy": "sandbox" }),
      // A message's attachments don't change; keep them out of shared caches
      "Cache-Control": "private, max-age=3600",
    },
  });
}
