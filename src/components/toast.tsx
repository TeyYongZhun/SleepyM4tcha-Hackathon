"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import {
  latestNotificationId,
  useNotifications,
  type Notification,
} from "@/lib/notifications";
import { NOTIFICATION } from "./notification-view";

/** How long a settled toast stays up, while this tab is being looked at. */
const DISMISS_AFTER_MS = 3000;
/**
 * The countdown steps this often. Fine enough that the bar can be drawn straight from what is
 * left, with no CSS transition filling in between: a transition would still be animating
 * towards empty when the count ran out, so the toast vanished with the bar around a third
 * full. Now the bar reaching the end and the toast closing are the same instant.
 */
const TICK_MS = 100;

/**
 * Shows the newest notification as a bubble in the top corner. Mounted once for the whole
 * dashboard and driven by the notification store, so anything worth recording is also
 * announced -- a reply going out, a flag cleared -- without each feature growing its own
 * toast. It sits clear of the sticky navbar, which is one 4rem row from lg up and wraps to
 * two below that.
 */
export function ToastHost() {
  const items = useNotifications();
  // The newest notification already dealt with, seeded from what was stored before this page
  // loaded so only things that happen from now on are announced.
  const [seen, setSeen] = useState<string | null>(latestNotificationId);

  const latest = items[0];
  if (!latest || latest.id === seen) return null;
  // Keyed on pending too, so when a reply settles the toast restarts with a full countdown
  // rather than inheriting whatever was left of one that never ran.
  return (
    <Toast
      key={`${latest.id}:${latest.pending ? "waiting" : "settled"}`}
      item={latest}
      onDismiss={() => setSeen(latest.id)}
    />
  );
}

/**
 * Closes itself a few seconds after it has finished saying what it has to say -- a reply still
 * waiting on delivery holds, and only starts counting once it settles. The count runs only
 * while this tab is actually on screen: a reply's result usually lands while the person is
 * still over in Gmail, and a toast that expired there would never be seen. Whatever it said is
 * kept in the notifications bell either way.
 */
function Toast({ item, onDismiss }: { item: Notification; onDismiss: () => void }) {
  const { kind, subject, pending } = item;
  const [left, setLeft] = useState(DISMISS_AFTER_MS);

  useEffect(() => {
    if (pending) return;
    const id = setInterval(() => {
      if (!document.hidden) setLeft((n) => Math.max(0, n - TICK_MS));
    }, TICK_MS);
    return () => clearInterval(id);
  }, [pending]);

  useEffect(() => {
    if (!pending && left <= 0) onDismiss();
  }, [pending, left, onDismiss]);

  const v = NOTIFICATION[kind];
  const Icon = v.icon;

  // Portalled so no pane's overflow or transform can clip or trap it
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-end px-4 pt-[7.25rem] lg:pt-[4.75rem]">
      <div
        role="status"
        aria-live="polite"
        className="toast-in pointer-events-auto w-full max-w-[340px] overflow-hidden rounded-xl border border-line bg-overlay shadow-lg"
      >
        <div className="flex items-start gap-2.5 p-3.5">
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${v.tone}`}
          >
            <Icon size={16} aria-hidden />
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold">{v.title}</p>
            <p className="mt-0.5 text-[12px] leading-relaxed break-words text-ink-soft">
              {v.text(subject)}
            </p>
            {/* Only a sent reply is ever pending, while we watch for it coming back undelivered */}
            {pending && (
              <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-ink-soft">
                <Loader2 size={12} className="animate-spin" aria-hidden />
                Confirming it reached the recipient…
              </p>
            )}
          </div>
        </div>

        {/* The countdown, drawn rather than written: width, not an animation, so it pauses
            with the count when the tab is hidden. Nothing to show while it is still waiting. */}
        {!pending && (
          <div aria-hidden className="h-[3px] bg-line/40">
            <div
              className={`h-full ${v.bar}`}
              style={{ width: `${(left / DISMISS_AFTER_MS) * 100}%` }}
            />
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
