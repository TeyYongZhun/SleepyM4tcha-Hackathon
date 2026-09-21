import { useSyncExternalStore } from "react";
import { addNotification, updateLatest } from "./notifications";
import { currentScope, onScopeChange } from "./store-scope";

/**
 * Watches a reply the person is writing in Gmail and reports what became of it.
 *
 * This lives outside React on purpose. It used to run inside the Reply bar and was cancelled
 * when that unmounted, so opening the compose window and then clicking another email in the
 * list killed the watch: the reply went out and nothing ever said so. Sending happens in
 * another window, on their schedule, and has nothing to do with which email is on screen here.
 *
 * One watch at a time. Starting a second replaces the first, which is what pressing Reply
 * again means.
 */

/** How often the Sent mail is checked while the Gmail window is open. */
const POLL_MS = 2000;
/** Slower pace once the window can no longer be read and only the Sent check is left. */
const POLL_IDLE_MS = 5000;
/** Focus landing back here sooner than this is the window opening, not the person returning. */
const RETURN_GUARD_MS = 1500;
/**
 * Only the demo decides anything from this tab regaining focus, and only after the person has
 * actually been away in the compose window for at least this long. Glancing back while Gmail is
 * still loading is not a reply: without a floor here the toast announced one before they had
 * seen the compose window, let alone pressed Send.
 */
const MIN_AWAY_MS = 6000;
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Traces what the watch is doing, in development only. Whether a reply was sent is decided from
 * signals that cannot be seen from the outside -- a pop-up handle the browser may have disowned,
 * focus moving between windows, Gmail's Sent mail arriving seconds late -- so when it reaches
 * the wrong answer there is otherwise nothing to look at. Open the console and press Reply.
 */
const debug =
  process.env.NODE_ENV === "production"
    ? () => {}
    : (...args: unknown[]) => console.info("[reply]", ...args);

// --- which reply is being watched, for the bar's spinner -------------------------------------

let watching: string | null = null;
let cancelCurrent: (() => void) | null = null;
const listeners = new Set<() => void>();

function setWatching(emailId: string | null) {
  if (watching === emailId) return;
  watching = emailId;
  listeners.forEach((l) => l());
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

// A watch belongs to the account that started it. Signing out and into another account without
// the page reloading -- Sign out, then Try the demo, does exactly that -- ends it: the server can
// no longer look in the first account's Sent mail, and a watch left running fell back to the
// demo's rules and reported a reply into the new account's bell that it had never written.
// Deferred, because the account changes while the dashboard is rendering.
onScopeChange(() => {
  queueMicrotask(() => cancelCurrent?.());
});

/**
 * The email whose reply is being watched, or null. Lets the bar show its spinner on the right
 * email, including when they navigate away and come back to it.
 */
export function useWatchedReply(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => watching,
    () => null, // nothing is in flight during a server render
  );
}

// --- the watch ------------------------------------------------------------------------------

export function startReplyWatch(win: Window, emailId: string, to: string): void {
  cancelCurrent?.();
  let cancelled = false;
  let wake: (() => void) | null = null;
  let cameBack = false;
  const startedAt = Date.now();
  /** Whose notifications this reply's result goes to, whoever is signed in by then. */
  const owner = currentScope();
  /** When this tab lost focus to the compose window, or 0 while they are still here. */
  let awaySince = 0;
  const onLeave = () => {
    awaySince ||= Date.now();
  };
  // Coming back to this tab is the likeliest moment the reply was just sent: look right away
  // (a background tab also gets its timers slowed down a lot by the browser)
  const onReturn = () => {
    if (document.visibilityState !== "visible") return onLeave();
    // A return only counts as "they went and replied" if they were gone long enough to have
    // done it. Opening the window can bounce focus straight back here, and people click back
    // while Gmail is still loading; neither is a sent reply.
    if (
      awaySince &&
      Date.now() - awaySince > MIN_AWAY_MS &&
      Date.now() - startedAt > RETURN_GUARD_MS
    ) {
      cameBack = true;
    }
    awaySince = 0;
    wake?.();
  };
  window.addEventListener("blur", onLeave);
  window.addEventListener("focus", onReturn);
  document.addEventListener("visibilitychange", onReturn);

  const stop = () => {
    cancelled = true;
    window.removeEventListener("blur", onLeave);
    window.removeEventListener("focus", onReturn);
    document.removeEventListener("visibilitychange", onReturn);
    if (cancelCurrent === stop) {
      cancelCurrent = null;
      setWatching(null);
    }
  };
  cancelCurrent = stop;
  setWatching(emailId);
  debug("watching", { emailId, to });

  const finish = () => stop();

  void (async () => {
    const started = startedAt;
    let canCheck = true; // false once the server says this account has no Gmail to look in
    let trustClosed = true; // false once the handle proves unreliable (see HANDLE_PROBE_MS)
    /** When they finished with the compose window, whichever way it was noticed. */
    let settledAt = 0;
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
      if (res.status === 401) return null; // signed out: there is no Sent mail to look in any more
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as { supported: boolean; ids?: string[] };
    };

    const poll = async (): Promise<"new" | "none" | "unsupported" | "gone" | "error"> => {
      try {
        const data = await listIds("reply-status");
        if (!data) return "gone";
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
        if (!data?.supported) return "none";
        const ids = data.ids ?? [];
        if (!bounced) {
          bounced = new Set(ids);
          return "none";
        }
        const arrived = ids.filter((id) => !bounced!.has(id));
        if (!arrived.length || !address) return "none";

        for (const id of arrived) {
          const res = await fetch(`/api/reply-bounce?${new URLSearchParams({ id, to: address })}`);
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
    const first = await poll();
    if (first === "gone") return finish();
    if (first === "unsupported") canCheck = false;
    else await pollBounce();
    if (cancelled) return;
    debug(canCheck ? "watching Sent mail" : "no Sent mail to check (demo/backend)");

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
      if (closed && Date.now() - started < HANDLE_PROBE_MS) {
        if (trustClosed) debug("pop-up handle disowned: `closed` is no longer evidence");
        trustClosed = false;
      }
      debug("tick", {
        at: `${Math.round((Date.now() - started) / 1000)}s`,
        closed,
        trustClosed,
        cameBack,
        awayFor: awaySince ? `${Math.round((Date.now() - awaySince) / 1000)}s` : "here",
        canCheck,
      });

      if (canCheck) {
        const result = await poll();
        if (cancelled) return;
        debug("Sent check:", result);
        // It could look in Sent mail when it started, so being told it can't now -- or being
        // signed out -- means the account changed under it. Stop: carrying on switched to the
        // demo's rules below and reported a reply nobody sent, to whoever was signed in next.
        if (result === "unsupported" || result === "gone") {
          debug("the account changed under the watch; stopping");
          return finish();
        }
        if (result === "new") {
          try {
            win.close(); // best effort: a disowned window can't be closed from here
          } catch {
            // nothing to do; they can close it themselves
          }
          // Report that it left the account straight away, naming wherever it actually went,
          // then keep the toast open while we watch for it coming back undelivered.
          const address = sentTo || to;
          addNotification("sent", address, true, owner);

          const until = Date.now() + DELIVERY_WINDOW_MS;
          while (!cancelled && Date.now() < until) {
            await sleep(BOUNCE_POLL_MS);
            if (cancelled) return;
            if ((await pollBounce(address)) === "new") {
              updateLatest("bounced", address, owner);
              return finish();
            }
          }
          // Nothing came back in the window, so the receiving server took it. That is the
          // furthest mail can be followed from outside: nobody rejected it.
          updateLatest("delivered", address, owner);
          return finish();
        }
      }

      if (!canCheck) {
        // The demo and backend inboxes have no sent mail to look in, and their senders are
        // invented addresses anyway, so there is nothing to verify against. Finishing with
        // the compose window -- closing it, or coming back here -- is taken as sent, which
        // is what the demo is there to show. It runs through the same two steps so the demo
        // looks like the real thing, just on a timer rather than on Gmail.
        //
        // `closed` is only believed while the handle is still worth believing, exactly as on
        // the Gmail path: a browser that disowns the pop-up reports it closed the moment it
        // opens, which announced a sent reply before Gmail had finished loading.
        if ((closed && trustClosed) || cameBack) {
          debug("reporting sent (demo):", closed ? "window closed" : "came back to this tab");
          addNotification("sent", to, true, owner);
          await sleep(DEMO_DELIVERY_MS);
          if (cancelled) return;
          updateLatest("delivered", to, owner);
          return finish();
        }
      } else if ((closed && trustClosed) || cameBack) {
        // They have finished with the compose window: it shut, or they came back here having
        // been away long enough to have written something. The same two signals the demo uses,
        // because the Gmail path needs a way to conclude too -- waiting only on the window
        // shutting left it silent whenever the browser disowned the handle, which is most of
        // the time with Gmail, and silence is the one answer that helps nobody.
        //
        // What they mean differs, though. The demo takes them as "sent" because it has nothing
        // to check against; here they only mean "stop expecting one", and a reply that really
        // went out is still found by the Sent check below in the meantime.
        settledAt ||= Date.now();
        // Sent mail can lag a few seconds behind the click, so give it a moment either way
        if (Date.now() - settledAt > CONFIRM_MS) {
          debug("concluding not sent:", closed ? "window closed" : "came back to this tab");
          addNotification("not-sent", to, false, owner);
          return finish();
        }
      }
    }
    // Ran out of time with the compose window still open and nothing in Sent. Say so rather
    // than leaving the spinner on an answer that is never coming.
    debug("gave up waiting");
    addNotification("not-sent", to, false, owner);
    finish();
  })();
}
