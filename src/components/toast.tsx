"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import {
  latestNotificationId,
  useNotifications,
  type Notification,
} from "@/lib/notifications";
import { NOTIFICATION } from "./notification-view";

/** How long a settled toast stays up, in seconds, while this tab is being looked at. */
const DISMISS_AFTER = 6;

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
  return <Toast item={latest} onDismiss={() => setSeen(latest.id)} />;
}

/**
 * It clears itself after a few seconds, but only counts down while this tab is actually on
 * screen -- a reply's result usually lands while the person is still over in Gmail, and a
 * toast that expired there would never be seen. A bounce stays until dismissed, because it is
 * the one outcome that needs them to do something.
 */
function Toast({ item, onDismiss }: { item: Notification; onDismiss: () => void }) {
  const { kind, subject, pending } = item;

  useEffect(() => {
    if (pending || kind === "bounced") return;
    let left = DISMISS_AFTER;
    const id = setInterval(() => {
      if (document.hidden) return;
      if (--left <= 0) {
        clearInterval(id);
        onDismiss();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [pending, kind, onDismiss]);

  const v = NOTIFICATION[kind];
  const Icon = v.icon;

  // Portalled so no pane's overflow or transform can clip or trap it
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-end px-4 pt-[7.25rem] lg:pt-[4.75rem]">
      <div
        role="status"
        aria-live="polite"
        className="toast-in pointer-events-auto flex w-full max-w-[340px] items-start gap-2.5 rounded-xl border border-line bg-overlay p-3.5 shadow-lg"
      >
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${v.tone}`}>
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

        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-m-1 shrink-0 rounded-md p-1 text-ink-soft transition hover:bg-paper-2 hover:text-ink"
        >
          <X size={14} aria-hidden />
        </button>
      </div>
    </div>,
    document.body,
  );
}
