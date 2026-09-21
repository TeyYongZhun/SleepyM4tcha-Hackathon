"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { CATEGORIES, type CategorySlug, type InboxCounts } from "@/lib/categories";
import { useDetailsDismiss } from "@/lib/use-details-dismiss";
import { Avatar } from "./avatar";
import { ExportButton } from "./export-button";
import { ClearDataButton, DemoDataButton } from "./demo-data-menu";
import { ImportButton } from "./import-dialog";
import { Logo } from "./logo";
import { NotificationBell } from "./notification-bell";
import { ThemeToggle } from "./theme-toggle";
import { useUserInfo } from "./user-provider";

/**
 * A Gmail inbox is counted in the background, so the totals arrive in stages: ask, show
 * what's there, and ask again a couple of seconds later until it says it is finished. The
 * first ask, and coming back to the tab, ask for a recount so new mail is counted straight
 * away; after that it checks back every half minute (the server recounts at least once a minute).
 */
function useLiveCounts(enabled: boolean): InboxCounts | null {
  const [snap, setSnap] = useState<InboxCounts | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async (fresh = false) => {
      clearTimeout(timer);
      let done = false;
      try {
        const res = await fetch(`/api/inbox/counts${fresh ? "?fresh=1" : ""}`, { cache: "no-store" });
        if (res.ok && res.status !== 204) {
          const next = (await res.json()) as InboxCounts;
          if (!alive) return;
          setSnap(next);
          done = next.done;
        }
      } catch {} // offline or restarting: try again on the next tick
      if (alive) timer = setTimeout(tick, done ? 30_000 : 2_000);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") tick(true);
    };
    tick(true);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled]);
  return snap;
}

export function Navbar({
  counts,
  liveCounts = false,
  signOutSlot,
}: {
  /** Exact totals per category, when the source holds everything already (not Gmail) */
  counts?: Record<CategorySlug, number>;
  /** Gmail: count the inbox in the background and show the totals as they come in */
  liveCounts?: boolean;
  signOutSlot: React.ReactNode;
}) {
  const live = useLiveCounts(liveCounts);
  const user_info = useUserInfo();
  const active = useSelectedLayoutSegment() ?? "all";
  const displayName = user_info.name ?? user_info.email ?? "Account";
  const firstName = displayName.split(/\s+/)[0];
  const menu = useRef<HTMLDetailsElement>(null);
  useDetailsDismiss(menu);

  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-line bg-overlay">
      <div className="flex flex-wrap items-center gap-x-6 px-4 sm:px-6">
        <Link href="/dashboard" className="flex h-16 shrink-0 items-center">
          <Logo />
        </Link>

        <nav
          aria-label="Email filters"
          className="order-last -mx-4 flex w-[calc(100%+2rem)] gap-1 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:w-[calc(100%+3rem)] sm:px-6 lg:order-none lg:mx-0 lg:w-auto lg:flex-1 lg:justify-center lg:px-0 lg:pb-0"
        >
          {CATEGORIES.map((c) => {
            const isActive = active === c.slug;
            return (
              <Link
                key={c.slug}
                href={`/dashboard/${c.slug}`}
                aria-current={isActive ? "page" : undefined}
                className={`flex shrink-0 items-center gap-[7px] rounded-lg px-3.5 py-2 text-[13.5px] font-semibold whitespace-nowrap transition ${
                  isActive ? "bg-btn text-on-btn" : "text-ink-soft hover:bg-paper-2"
                }`}
              >
                {c.label}
                {(counts ?? live?.counts) && (
                  <span
                    className={`text-[11.5px] font-semibold tabular-nums opacity-75 ${
                      live && !live.done ? "animate-pulse" : ""
                    }`}
                  >
                    {(counts ?? live!.counts)[c.slug]}
                    {live?.capped && "+"}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1 lg:ml-0">
          <ExportButton />
          <NotificationBell />
          <ThemeToggle />
        <details ref={menu} className="group relative">
          <summary className="flex h-16 cursor-pointer list-none items-center gap-2 rounded-lg px-2 [&::-webkit-details-marker]:hidden">
            <Avatar name={displayName} src={user_info.image} size={28} />
            <span className="hidden max-w-40 truncate text-[13.5px] font-medium text-ink sm:block">
              {firstName}
            </span>
            <ChevronDown size={13} className="text-ink-soft" aria-hidden />
          </summary>
          <div className="absolute right-0 z-20 w-60 rounded-lg border border-line bg-overlay p-2 shadow-lg">
            <div className="border-b border-line px-3 pb-2">
              <p className="truncate text-sm font-medium text-ink">{user_info.name}</p>
              <p className="truncate text-xs text-ink-soft">{user_info.email}</p>
            </div>
            <div className="pt-1">
              {/* Only the demo browses sample data, so only it has anything to replace */}
              {user_info.demo && (
                <>
                  <ImportButton />
                  <ClearDataButton />
                  <DemoDataButton />
                </>
              )}
              {signOutSlot}
            </div>
          </div>
        </details>
        </div>
      </div>
    </header>
  );
}
