"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Reply, Sparkles } from "lucide-react";
import { setAiDraft, useAiDraft } from "@/lib/ai-draft";
import { showDraftLoading } from "@/lib/draft-loading";
import { addNotification, updateLatest } from "@/lib/notifications";

/** How often the Sent mail is checked while the Gmail window is open. */
const POLL_MS = 2000;
/** Slower pace once the window can no longer be read and only the Sent check is left. */
const POLL_IDLE_MS = 5000;
/** Focus landing back here sooner than this is the window opening, not the person returning. */
const RETURN_GUARD_MS = 1500;
/**
 * How long to wait for a delivery failure after the reply goes out, before calling it
 * delivered. A bounce from an address that doesn't exist is usually rejected by the receiving
 * server on the spot, so it comes back within seconds; waiting longer than this would hold up
 * every successful reply for the sake of a rare late one.
 */
const DELIVERY_WINDOW_MS = 12_000;
const BOUNCE_POLL_MS = 2000;
/** The demo has nothing to wait on, so it just pauses long enough to be read. */
const DEMO_DELIVERY_MS = 2500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/**
 * A window that reports itself closed this soon after opening was either shut straight away
 * (the person changed their mind) or was disowned by the browser, which makes `closed` read
 * true even though the window is open. Either way its `closed` flag is worthless from then on.
 */
const HANDLE_PROBE_MS = 8000;
/** After the window closes, how long to keep looking before concluding nothing was sent. */
const CONFIRM_MS = 20_000;
/** Stop watching after this, in case the compose window is simply left open. */
const GIVE_UP_MS = 15 * 60_000;
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
 * Gmail's window can't be read from here, so whether the reply went out is decided by one
 * authoritative signal only: /api/reply-status finding the message in the person's Sent mail.
 * The window's `closed` flag says when to stop waiting, never whether anything was sent --
 * browsers also set it on a window they have disowned, which produced false failures.
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
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelWatch = useRef<(() => void) | null>(null);

  // Leaving the page ends the watch
  useEffect(() => () => cancelWatch.current?.(), []);

  function watch(win: Window) {
    cancelWatch.current?.();
    let cancelled = false;
    let wake: (() => void) | null = null;
    let cameBack = false;
    const startedAt = Date.now();
    // Coming back to this tab is the likeliest moment the reply was just sent: look right away
    // (a background tab also gets its timers slowed down a lot by the browser)
    const onReturn = () => {
      if (document.visibilityState !== "visible") return;
      // Opening the window can bounce focus straight back here; that isn't a return
      if (Date.now() - startedAt > RETURN_GUARD_MS) cameBack = true;
      wake?.();
    };
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    const stop = () => {
      cancelled = true;
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
      setWaiting(false);
    };
    cancelWatch.current = stop;

    const finish = () => stop();

    void (async () => {
      const started = startedAt;
      let canCheck = true; // false once the server says this account has no Gmail to look in
      let trustClosed = true; // false once the handle proves unreliable (see HANDLE_PROBE_MS)
      let closedAt = 0;
      /**
       * What was already in Sent before they composed. Anything outside it is this reply.
       * Without it, the previous reply to the same email would be read as a new one the moment
       * Reply was pressed again.
       */
      let baseline: Set<string> | null = null;
      /** Delivery failures already sitting in the inbox before they composed. */
      let bounced: Set<string> | null = null;
      /** Where the reply actually went, which is not necessarily who the email came from. */
      let sentTo = "";

      /**
       * Both checks work the same way, and both are careful to cost one request while nothing
       * is happening: list the newest ids, compare them against a snapshot, and only open an
       * id that wasn't in it. They also call it new only once a snapshot exists, so a failed
       * first call can't turn every message already there into a hit.
       */
      const listIds = async (route: "reply-status" | "reply-bounce") => {
        const res = await fetch(`/api/${route}`);
        if (!res.ok) throw new Error(String(res.status));
        return (await res.json()) as { supported: boolean; ids?: string[] };
      };

      const poll = async (): Promise<"new" | "none" | "unsupported" | "error"> => {
        try {
          const data = await listIds("reply-status");
          if (!data.supported) return "unsupported";
          const ids = data.ids ?? [];
          if (!baseline) {
            baseline = new Set(ids);
            return "none";
          }
          // Newest first, so the first unseen one is the message they just sent
          const fresh = ids.find((id) => !baseline!.has(id));
          if (!fresh) return "none";

          // Worth a second call now, once: which address did it actually go to?
          const res = await fetch(`/api/reply-status?${new URLSearchParams({ id: fresh })}`);
          if (!res.ok) return "error"; // leave it unseen and try again next round
          sentTo = ((await res.json()) as { to?: string }).to ?? "";
          return "new";
        } catch {
          return "error"; // network blip: try again next round
        }
      };

      /** Without an address: the snapshot. With one: has a failure for it arrived since? */
      const pollBounce = async (address?: string): Promise<"new" | "none" | "error"> => {
        try {
          const data = await listIds("reply-bounce");
          if (!data.supported) return "none";
          const ids = data.ids ?? [];
          if (!bounced) {
            bounced = new Set(ids);
            return "none";
          }
          const arrived = ids.filter((id) => !bounced!.has(id));
          if (!arrived.length || !address) return "none";

          for (const id of arrived) {
            const res = await fetch(
              `/api/reply-bounce?${new URLSearchParams({ id, to: address })}`,
            );
            if (!res.ok) return "error"; // still unseen, so it gets looked at again
            if (((await res.json()) as { match?: boolean }).match) return "new";
            // Ordinary mail that happened to land: don't reopen it every couple of seconds
            bounced.add(id);
          }
          return "none";
        } catch {
          return "error";
        }
      };

      // Snapshot both before they have had any chance to compose
      if ((await poll()) === "unsupported") canCheck = false;
      else await pollBounce();
      if (cancelled) return;

      while (!cancelled && Date.now() - started < GIVE_UP_MS) {
        await new Promise<void>((resolve) => {
          wake = resolve;
          // Once the window can't be read, only the Sent check is left: ease off, because
          // that one runs until the give-up time rather than stopping when the window shuts.
          setTimeout(resolve, trustClosed ? POLL_MS : POLL_IDLE_MS);
        });
        if (cancelled) return;

        const closed = win.closed;
        // Shut at once, or a handle the browser has disowned. Either way the flag is no longer
        // evidence of anything, so from here only a positive Sent hit can decide this.
        if (closed && Date.now() - started < HANDLE_PROBE_MS) trustClosed = false;

        if (canCheck) {
          const result = await poll();
          if (cancelled) return;
          if (result === "unsupported") canCheck = false;
          else if (result === "new") {
            try {
              win.close(); // best effort: a disowned window can't be closed from here
            } catch {
              // nothing to do; they can close it themselves
            }
            // Report that it left the account straight away, naming wherever it actually went,
            // then keep the toast open while we watch for it coming back undelivered.
            const address = sentTo || to;
            addNotification("sent", address, true);

            const until = Date.now() + DELIVERY_WINDOW_MS;
            while (!cancelled && Date.now() < until) {
              await sleep(BOUNCE_POLL_MS);
              if (cancelled) return;
              if ((await pollBounce(address)) === "new") {
                updateLatest("bounced", address);
                return finish();
              }
            }
            // Nothing came back in the window, so the receiving server took it. That is the
            // furthest mail can be followed from outside: nobody rejected it.
            updateLatest("delivered", address);
            return finish();
          }
        }

        if (!canCheck) {
          // The demo and backend inboxes have no sent mail to look in, and their senders are
          // invented addresses anyway, so there is nothing to verify against. Finishing with
          // the compose window -- closing it, or coming back here -- is taken as sent, which
          // is what the demo is there to show. It runs through the same two steps so the demo
          // looks like the real thing, just on a timer rather than on Gmail.
          if (closed || cameBack) {
            addNotification("sent", to, true);
            await sleep(DEMO_DELIVERY_MS);
            if (cancelled) return;
            updateLatest("delivered", to);
            return finish();
          }
        } else if (closed && trustClosed) {
          // The window is genuinely gone. Keep looking a while longer -- sent mail can lag a
          // few seconds behind the click -- then report what was found.
          closedAt ||= Date.now();
          if (Date.now() - closedAt > CONFIRM_MS) {
            addNotification("not-sent", to);
            return finish();
          }
        }
      }
      finish();
    })();
  }

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

    setWaiting(true);
    watch(win);
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
