"use client";

import { useParams } from "next/navigation";

/** Placeholder rows while a page of the inbox is on its way. */
export function SkeletonRows({ count = 9 }: { count?: number }) {
  return (
    <div data-loading aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-lg px-2.5 py-2">
          <div className="flex items-center justify-between gap-3">
            <div className="h-3 w-32 animate-pulse rounded bg-paper-2" />
            <div className="h-2.5 w-10 animate-pulse rounded bg-paper-2" />
          </div>
          <div className="mt-2 h-3 w-[85%] animate-pulse rounded bg-paper-2" />
          <div className="mt-2 h-4 w-20 animate-pulse rounded-full bg-paper-2" />
        </div>
      ))}
    </div>
  );
}

/**
 * The list pane before its first page has arrived, in the same frame as InboxPane so nothing
 * moves when the rows land. Like the list, it steps aside on small screens while an email is
 * open.
 */
export function InboxSkeleton({ title }: { title?: string }) {
  const { emailId } = useParams<{ emailId?: string }>();
  return (
    <section
      aria-label="Loading the inbox"
      aria-busy="true"
      className={`min-h-0 w-full flex-col border-line bg-surface lg:flex lg:w-[22.5rem] lg:shrink-0 lg:border-r ${
        emailId ? "hidden" : "flex"
      }`}
    >
      <div className="flex h-10 shrink-0 items-center gap-2 px-[18px] pt-2">
        {title ? (
          <p className="text-sm font-semibold">
            {title} <span className="font-normal text-ink-soft">· Loading…</span>
          </p>
        ) : (
          <div className="h-3.5 w-36 animate-pulse rounded bg-paper-2" />
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden px-2 pt-1 pb-3">
        <SkeletonRows />
      </div>
      <div className="shrink-0 border-t border-line px-3 py-3.5 text-[12px] text-ink-soft">Loading…</div>
    </section>
  );
}
