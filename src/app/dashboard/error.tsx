"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, Clock, RotateCw, ShieldAlert } from "lucide-react";

/**
 * Catches anything thrown while rendering `/dashboard/[category]/...` --
 * chiefly `getInboxPage()` / `getEmail()` (src/lib/emails.ts), which have no
 * try/catch of their own. Without this, a Gmail failure (wrong scope, rate
 * limit, expired token) hits Next's default crash screen instead of a message
 * that says what happened.
 *
 * Does NOT wrap dashboard/layout.tsx itself (Next only wraps a segment's
 * children, not the segment's own layout, to avoid the boundary needing the
 * thing that might be broken) -- so the navbar above this still renders, and
 * its own "Sign out" is still reachable even here.
 *
 * `error.message` is what a GmailError's message looks like
 * (src/lib/gmail/api.ts): "Gmail API /messages failed (403): ...". Parsed
 * loosely, because in a production build Next redacts Server Component error
 * messages by default and this degrades to the generic case instead of
 * guessing wrong -- the parsing is a nicety for local/dev, not load-bearing.
 */

type Kind = "scope" | "quota" | "generic";

function classify(message: string): Kind {
  if (/\b429\b/.test(message) || /quota|rate.?limit/i.test(message)) return "quota";
  if (/\b40[13]\b/.test(message) || /insufficient|scope|permission/i.test(message)) return "scope";
  return "generic";
}

const COPY: Record<Kind, { icon: typeof AlertTriangle; title: string; detail: string }> = {
  scope: {
    icon: ShieldAlert,
    title: "Gmail access isn't granted yet",
    detail:
      "Sign-in succeeded, but this account hasn't approved (or Google hasn't finished enabling) " +
      "the Gmail permission. Sign out, then sign in again and accept the Gmail prompt.",
  },
  quota: {
    icon: Clock,
    title: "Gmail is rate limiting this account",
    detail: "Wait a minute and try again -- this clears on its own once the limit resets.",
  },
  generic: {
    icon: AlertTriangle,
    title: "Couldn't load your inbox",
    detail: "Something went wrong reaching Gmail. Try again, or sign out and back in.",
  },
};

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest correlates this to the server-side log entry (Next.js convention).
    console.error("[dashboard]", error.digest ?? error.message, error);
  }, [error]);

  const kind = classify(error.message);
  const { icon: Icon, title, detail } = COPY[kind];

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-4 bg-paper px-6 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-bad-bg text-bad">
        <Icon size={22} aria-hidden />
      </span>
      <div className="max-w-sm space-y-1.5">
        <p className="text-[15px] font-semibold text-ink">{title}</p>
        <p className="text-[13px] text-ink-soft">{detail}</p>
      </div>
      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-1.5 rounded-lg bg-btn px-4 py-2 text-[13px] font-semibold text-on-btn btn-lift hover:bg-btn-hover"
        >
          <RotateCw size={14} aria-hidden />
          Try again
        </button>
        <Link
          href="/api/auth/signout"
          className="rounded-lg border border-line px-4 py-2 text-[13px] font-semibold text-ink transition hover:bg-paper-2"
        >
          Sign out
        </Link>
      </div>
    </div>
  );
}
