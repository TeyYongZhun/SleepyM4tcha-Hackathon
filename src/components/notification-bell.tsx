"use client";

import { useRef } from "react";
import { Bell } from "lucide-react";
import {
  clearNotifications,
  markAllRead,
  useNotifications,
} from "@/lib/notifications";
import { useDetailsDismiss } from "@/lib/use-details-dismiss";
import { LocalTime } from "./local-time";
import { NOTIFICATION } from "./notification-view";

/** Recent activity: reply results, kept after their toasts have gone, and review flags cleared. */
export function NotificationBell() {
  const items = useNotifications();
  const menu = useRef<HTMLDetailsElement>(null);
  useDetailsDismiss(menu);

  const unread = items.filter((n) => !n.read).length;

  return (
    <details ref={menu} className="relative">
      <summary
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        title="Notifications"
        // Opening is when they have been seen, so clear the dot then rather than on dismiss
        onClick={() => {
          if (!menu.current?.open) markAllRead();
        }}
        className="relative flex h-9 w-9 list-none items-center justify-center rounded-lg text-ink-soft transition hover:bg-paper-2 hover:text-ink [&::-webkit-details-marker]:hidden"
      >
        <Bell size={18} aria-hidden />
        {unread > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-copper px-1 text-[9.5px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </summary>

      <div className="absolute right-0 z-20 mt-1 w-[320px] rounded-lg border border-line bg-overlay shadow-lg">
        <div className="flex items-center justify-between border-b border-line px-3 py-2">
          <p className="text-[13px] font-semibold">Notifications</p>
          {items.length > 0 && (
            <button
              type="button"
              onClick={clearNotifications}
              className="text-[11.5px] font-semibold text-ink-soft hover:text-ink"
            >
              Clear all
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <p className="px-3 py-6 text-center text-[12.5px] text-ink-soft">
            Nothing yet. Replies you send and flags you clear show up here.
          </p>
        ) : (
          <ul className="max-h-[320px] overflow-y-auto py-1">
            {items.map((n) => {
              const v = NOTIFICATION[n.kind];
              const Icon = v.icon;
              return (
                <li key={n.id} className="flex items-start gap-2.5 px-3 py-2.5">
                  <span
                    className={`mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${v.tone}`}
                  >
                    <Icon size={13} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-semibold">{v.title}</p>
                    <p className="mt-0.5 text-[11.5px] leading-relaxed break-words text-ink-soft">
                      {v.text(n.subject)}
                    </p>
                    <LocalTime
                      iso={new Date(n.at).toISOString()}
                      format="short"
                      className="mt-1 block text-[11px] text-ink-soft"
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </details>
  );
}
