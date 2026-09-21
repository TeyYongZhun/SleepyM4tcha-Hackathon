"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, MailX } from "lucide-react";

const SECONDS = 5;

/**
 * sent: the reply went out -- found in the user's Gmail Sent mail, or, on the demo and backend
 * inboxes, they finished with the compose window (there is no mailbox there to check against).
 * not-sent: the compose window closed and nothing turned up, so probably nothing was sent.
 * bounced: it went out, then came straight back -- the address doesn't exist (Gmail only).
 */
export type Outcome = "sent" | "not-sent" | "bounced";

const VIEW: Record<
  Outcome,
  { icon: typeof CheckCircle2; circle: string; bar: string; title: string }
> = {
  sent: {
    icon: CheckCircle2,
    circle: "bg-good-bg text-good",
    bar: "bg-good",
    title: "Reply sent",
  },
  "not-sent": {
    icon: AlertCircle,
    circle: "bg-warn-bg text-warn",
    bar: "bg-warn",
    title: "No reply sent",
  },
  bounced: {
    icon: MailX,
    circle: "bg-bad-bg text-bad",
    bar: "bg-bad",
    title: "Address doesn't exist",
  },
};

/**
 * Full-screen result of a reply, then back to the mailbox after 5 seconds (or straight away
 * with the button).
 *
 * The countdown only runs while this tab is actually on screen. The result is usually decided
 * while the person is still over in Gmail, and a timer that kept running there would send them
 * back to the mailbox before they ever saw this.
 */
export function ReplyResult({
  outcome,
  to,
  backHref,
  onStay,
  hold = false,
}: {
  outcome: Outcome;
  to: string;
  backHref: string;
  onStay: () => void;
  /** Delivery is still being checked: don't start counting down yet, the verdict may change. */
  hold?: boolean;
}) {
  const router = useRouter();
  const [left, setLeft] = useState(SECONDS);

  useEffect(() => {
    if (hold) return;
    const id = setInterval(() => {
      if (!document.hidden) setLeft((n) => Math.max(0, n - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [hold]);

  useEffect(() => {
    if (!hold && left <= 0) router.push(backHref);
  }, [hold, left, router, backHref]);

  const v = VIEW[outcome];
  const Icon = v.icon;
  const text =
    outcome === "bounced"
      ? `${to} doesn't exist. Gmail sent your reply, then returned it undelivered — check the address with the sender.`
      : outcome === "sent"
        ? `Your reply to ${to} was sent successfully.`
        : "Nothing new turned up in your sent mail. If you did send it, Gmail may still be catching up — check your Sent folder.";

  // In a portal so no ancestor (overflow, transforms) can trap or clip the full-screen overlay
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-paper/95 p-4 backdrop-blur-sm">
      <div
        role="alertdialog"
        aria-labelledby="reply-result-title"
        aria-describedby="reply-result-text"
        className="w-full max-w-[400px] rounded-2xl border border-line bg-overlay p-7 text-center shadow-[0_20px_50px_-20px_rgba(18,23,43,0.25)]"
      >
        <span
          className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full ${v.circle}`}
        >
          <Icon size={30} aria-hidden />
        </span>
        <h2 id="reply-result-title" className="text-[19px] font-semibold">
          {v.title}
        </h2>
        <p id="reply-result-text" className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft">
          {text}
        </p>

        {hold ? (
          <p className="mt-6 flex items-center justify-center gap-1.5 text-[12px] text-ink-soft">
            <Loader2 size={13} className="animate-spin" aria-hidden />
            Confirming it reached the recipient…
          </p>
        ) : (
          <>
            {/* Width, not a CSS animation: it pauses with the countdown when the tab is hidden */}
            <div aria-hidden className="mt-6 h-1.5 overflow-hidden rounded-full bg-line">
              <div
                className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${v.bar}`}
                style={{ width: `${(left / SECONDS) * 100}%` }}
              />
            </div>
            <p className="mt-2 text-[12px] text-ink-soft" aria-live="polite">
              Returning to your mailbox in {left}s
            </p>
          </>
        )}

        <div className="mt-5 flex items-center justify-center gap-2">
          {outcome !== "sent" && (
            <button
              type="button"
              onClick={onStay}
              className="rounded-md border border-line bg-surface px-3 py-2 text-[13px] font-semibold text-ink btn-lift hover:bg-paper-2"
            >
              Stay here
            </button>
          )}
          <button
            type="button"
            autoFocus
            onClick={() => router.push(backHref)}
            className="inline-flex items-center gap-1.5 rounded-md bg-btn px-3 py-2 text-[13px] font-semibold text-on-btn btn-lift hover:bg-btn-hover"
          >
            <ArrowLeft size={15} strokeWidth={2.25} aria-hidden />
            Back to mailbox now
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
