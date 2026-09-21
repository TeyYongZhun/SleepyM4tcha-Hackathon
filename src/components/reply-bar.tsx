"use client";

import { useState } from "react";
import { Loader2, Reply, Sparkles } from "lucide-react";
import { setAiDraft, useAiDraft } from "@/lib/ai-draft";
import { showDraftLoading } from "@/lib/draft-loading";
import { startReplyWatch, useWatchedReply } from "@/lib/reply-watch";

/** The Gmail compose window, opened as a compact popup rather than a full tab. */
const POPUP_W = 820;
const POPUP_H = 800;

/**
 * Pinned under the email: opens the reply in Gmail in a popup window. Sized to match the inbox
 * pager (bar padding, button padding, text, icon), so the two bottom bars line up.
 *
 * With "AI Draft" on, Reply first asks /api/draft for a reply and puts it in Gmail's compose
 * body. The window is opened straight from the click (browsers block a pop-up opened after an
 * await) and pointed at Gmail once the draft is back.
 *
 * What became of the reply is decided in `lib/reply-watch.ts`, which keeps watching after this
 * bar has gone: the reply is sent in another window, long after they may have clicked on to a
 * different email.
 */
export function ReplyBar({
  href,
  emailId,
  to,
}: {
  href: string;
  emailId: string;
  /** The address being replied to, and the fallback for what the result is reported against. */
  to: string;
}) {
  const aiDraft = useAiDraft();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The watch outlives this component, so whether to show the spinner is asked of it rather
  // than kept here: opening the compose window and then clicking another email used to cancel
  // the watch, and the reply went out with nothing left to notice it.
  const waiting = useWatchedReply() === emailId;

  async function onReply(e: React.MouseEvent<HTMLAnchorElement>) {
    // Let "open in new window/background tab" clicks behave like a normal link
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (busy) return;
    setError(null);

    // A compact popup window, centred over this one, so Send doesn't leave a Gmail mailbox
    // sitting in a full tab afterwards.
    const left = Math.round(window.screenX + (window.outerWidth - POPUP_W) / 2);
    const top = Math.round(window.screenY + (window.outerHeight - POPUP_H) / 2);
    const win = window.open(
      aiDraft ? "" : href,
      "_blank",
      `popup=yes,width=${POPUP_W},height=${POPUP_H},left=${left},top=${top}`,
    );
    if (!win) {
      setError("Allow pop-ups to open Gmail");
      return;
    }

    if (aiDraft) {
      showDraftLoading(win);
      setBusy(true);
      try {
        const res = await fetch("/api/draft", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ emailId }),
        });
        if (!res.ok) throw new Error(String(res.status));
        const { body } = (await res.json()) as { body: string };
        const url = new URL(href);
        url.searchParams.set("body", body);
        win.location.href = url.toString();
      } catch {
        // Still give them the reply window, just without a draft
        win.location.href = href;
        setError("Couldn't draft a reply");
      } finally {
        setBusy(false);
      }
    }

    startReplyWatch(win, emailId, to);
  }

  return (
    <>
      <div className="border-t border-line px-3 py-2">
        <div className="flex items-center justify-end gap-1.5">
          {error ? (
            <span role="alert" className="mr-auto truncate text-[12px] text-bad">
              {error}
            </span>
          ) : (
            waiting && (
              <span className="mr-auto flex items-center gap-1.5 truncate text-[12px] text-ink-soft">
                <Loader2 size={13} className="animate-spin" aria-hidden />
                Waiting for you to send in Gmail…
              </span>
            )
          )}
          <button
            type="button"
            role="switch"
            aria-checked={aiDraft}
            onClick={() => setAiDraft(!aiDraft)}
            title={aiDraft ? "Reply opens with an AI-written draft" : "Reply opens blank"}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12.5px] font-semibold btn-lift ${
              aiDraft
                ? "border-copper bg-copper/10 text-copper"
                : "border-line bg-surface text-ink hover:bg-paper-2"
            }`}
          >
            <Sparkles size={15} strokeWidth={2.25} aria-hidden />
            AI Draft
          </button>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onReply}
            aria-busy={busy}
            className="inline-flex items-center gap-1 rounded-md border border-transparent bg-btn px-2.5 py-1.5 text-[12.5px] font-semibold text-on-btn btn-lift hover:bg-btn-hover"
          >
            {busy ? (
              <Loader2 size={15} strokeWidth={2.25} className="animate-spin" aria-hidden />
            ) : (
              <Reply size={15} strokeWidth={2.25} aria-hidden />
            )}
            {busy ? "Drafting…" : "Reply"}
          </a>
        </div>
      </div>

    </>
  );
}
