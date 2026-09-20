"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCheck,
  CheckCircle2,
  Paperclip,
  RefreshCw,
  UserCheck,
} from "lucide-react";
import { getCategoryBySlug, type CategorySlug } from "@/lib/categories";
import { PAGE_SIZE } from "@/lib/paging";
import { setRead, useReadIds } from "@/lib/read-state";
import { useResolvedIds } from "@/lib/resolved";
import { REVIEW_REASON_SHORT } from "@/lib/shipment";
import type { EmailCategory, ReviewReason } from "@/lib/types";
import { CategoryBadge } from "./category-badge";
import { LocalTime } from "./local-time";

/** Just what a list row needs, so the pane stays light with hundreds of emails. */
export interface InboxRow {
  id: string;
  from: string;
  subject: string;
  category: EmailCategory;
  attachmentCount: number;
  receivedAt?: string;
  unread?: boolean;
  /**
   * Set only when the email needs a person. "unknown" = it does, but the source
   * gave no reason. Absent = fine, or not known: only sources that read the
   * attachments up front can say.
   */
  reviewReason?: ReviewReason | "unknown";
  /**
   * Set only when the SI and BL disagree: the fields that differ, by display
   * name (empty if the source didn't say which). Absent = agree, or not known.
   */
  mismatchedFields?: string[];
  /**
   * Set only when the SI and BL were compared and every field agreed. Absent
   * (with reviewReason and mismatchedFields also absent) means there's no BL
   * attached yet to check -- just a request for one.
   */
  matched?: boolean;
  /**
   * Set once a person has cleared a mismatch or a needs-review case by hand.
   * Takes over from whichever of the above got it there -- a resolved row
   * shows under Resolved instead of Mismatch/Needs review from then on.
   * The server never sets it: the pane fills it in from the browser's resolved
   * list (lib/resolved.ts), which the Resolve button in the summary panel writes.
   */
  resolved?: boolean;
}

/** One page of the inbox, as /api/inbox returns it. */
export interface InboxPageData {
  rows: InboxRow[];
  page: number;
  /** Messages in this list (in the category, or in the whole inbox for Gmail), if known */
  total?: number;
  hasNext: boolean;
  /** rows are already only this tab's category (false: the pane filters them) */
  filtered: boolean;
}

/**
 * Left pane. Stays mounted while you move between emails (it lives in the
 * category layout), and highlights whichever email the URL points at.
 * On small screens it hides while an email is open.
 *
 * It shows one page (50 messages) and starts on page 1. Older / Newer fetch another
 * page from /api/inbox on demand. For Gmail the page holds every category, so the tab
 * filters the messages on screen; other sources send the tab's messages only.
 *
 * The tab filter (Gmail only) and the BL Comparison status filter both apply to
 * whichever raw page is loaded, so a page can come back with nothing to show even
 * though a later (or earlier) one has matches. Rather than leave that blank, the
 * pane keeps stepping to the next page in the same direction until it finds one
 * that isn't, or runs out -- see the auto-skip effect below.
 */
export function InboxPane({
  slug,
  title,
  initial,
}: {
  slug: CategorySlug;
  title: string;
  initial: InboxPageData;
}) {
  const { emailId } = useParams<{ emailId?: string }>();
  const activeId = emailId ? decodeURIComponent(emailId) : undefined;
  const router = useRouter();

  const [view, setView] = useState<InboxPageData>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  // Which way the auto-skip effect below should keep stepping, and whether it's
  // already walked every page in that direction for the current filter and found
  // nothing (so it stops retrying instead of bouncing back and forth forever).
  const seekDir = useRef<1 | -1>(1);
  const exhausted = useRef(false);

  /**
   * Clears the dot at once and remembers it in this browser, so it stays gone after a
   * reload whatever the source; then tells the server, which for Gmail clears the real
   * UNREAD label (the other sources have nothing to update).
   */
  function markRead(id: string) {
    setRead(id, true);
    fetch("/api/inbox/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {}); // best-effort; already remembered locally
  }

  async function goTo(page: number, dir?: 1 | -1, reload = false) {
    if (dir) seekDir.current = dir;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/inbox?page=${page}&category=${slug}${reload ? "&refresh=1" : ""}`,
      );
      if (!res.ok) throw new Error((await res.text()) || `Failed (${res.status})`);
      setView((await res.json()) as InboxPageData);
      scroller.current?.scrollTo({ top: 0 });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  /**
   * Back to the newest 50 messages, read from the source again rather than from anything held.
   * Page 1 is the only page new mail can arrive on, and refreshing some page deep in the
   * inbox would leave the new messages unseen anyway.
   *
   * `router.refresh()` afterwards updates what the server rendered around the list -- the
   * category tab counts, and the open email. The list is already up to date by then, so that
   * reads what this just fetched instead of fetching again.
   */
  async function refresh() {
    exhausted.current = false;
    seekDir.current = 1;
    await goTo(1, undefined, true);
    router.refresh();
  }

  const resolvedIds = useResolvedIds();
  const readIds = useReadIds();
  const rows = view.rows.map((r) => ({
    ...r,
    resolved: r.resolved || resolvedIds.has(r.id),
    unread: r.unread && !readIds.has(r.id),
  }));

  // Opening an email any other way than clicking its row (a link, a reload, the
  // back button) counts as reading it too.
  useEffect(() => {
    if (activeId && rows.some((r) => r.id === activeId && r.unread)) markRead(activeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, view]);

  const category = getCategoryBySlug(slug)?.category;
  const filterHere = !view.filtered && !!category;
  const inCategory = filterHere ? rows.filter((r) => r.category === category) : rows;

  // Only BL Comparison carries a verdict worth filtering on -- the other tabs
  // never set mismatchedFields/reviewReason, so a status filter there would do nothing.
  const [status, setStatus] = useState<StatusFilter>("all");
  const showStatusFilter = slug === "bl-comparison";
  const shown = showStatusFilter ? inCategory.filter((r) => matchesStatus(r, status)) : inCategory;

  /** A pill was clicked: search again from page 1, forward. */
  function changeStatus(next: StatusFilter) {
    setStatus(next);
    exhausted.current = false;
    seekDir.current = 1;
    if (view.page !== 1) goTo(1);
  }

  // Keeps stepping to the next page (in whichever direction we were already moving)
  // while the loaded page has nothing this tab/filter wants, so "No messages" only
  // ever shows once every page has been checked -- never for a gap with a match
  // just beyond it. Gives up once it has walked off either end, and settles back
  // on page 1 rather than stranding the view on whatever empty page it reached.
  useEffect(() => {
    if (loading || shown.length > 0 || exhausted.current) return;
    const dir = seekDir.current;
    if (dir === 1 ? view.hasNext : view.page > 1) {
      goTo(view.page + dir);
    } else {
      exhausted.current = true;
      if (view.page !== 1) goTo(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, status, loading, resolvedIds]);

  const first = (view.page - 1) * PAGE_SIZE + 1;
  const range = `${first}-${first + view.rows.length - 1}`;
  const count = filterHere
    ? `${shown.length} on this page`
    : view.rows.length === 0
      ? "0 messages"
      : `${range}${view.total ? ` of ${view.total.toLocaleString()}` : ""}`;

  return (
    <section
      aria-label={`${title} messages`}
      className={`min-h-0 w-full flex-col border-line bg-surface lg:flex lg:w-[22.5rem] lg:shrink-0 lg:border-r ${
        activeId ? "hidden" : "flex"
      }`}
    >
      <div className="shrink-0 px-[18px] pt-3 pb-1">
        <div className="flex items-center gap-2">
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
            {title} <span className="font-normal text-ink-soft">· {count}</span>
          </h2>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            aria-label="Refresh inbox"
            title="Refresh inbox"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-soft transition hover:bg-paper-2 hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : undefined} aria-hidden />
          </button>
        </div>
        {showStatusFilter && (
          <div className="mt-2">
            <StatusFilterButtons value={status} onChange={changeStatus} />
          </div>
        )}
      </div>

      {/* Still scrolls (wheel, touch, keys); the scrollbar itself is hidden.
          `relative` matters: the rows contain absolutely-positioned sr-only text, which
          otherwise escapes this scroller and makes the whole page scroll. */}
      <div
        ref={scroller}
        aria-busy={loading}
        className={`no-scrollbar relative min-h-0 flex-1 overflow-y-auto px-2 pt-1 pb-3 transition-opacity ${
          loading ? "opacity-50" : ""
        }`}
      >
        {shown.length === 0 && (
          <p className="px-5 py-10 text-center text-[13.5px] text-ink-soft">
            {filterHere ? "No messages in this filter on this page." : "No messages in this filter."}
          </p>
        )}
        {shown.map((row) => {
          const selected = row.id === activeId;
          return (
            <Link
              key={row.id}
              href={`/dashboard/${slug}/${encodeURIComponent(row.id)}`}
              aria-current={selected ? "page" : undefined}
              onClick={() => row.unread && markRead(row.id)}
              className={`block rounded-lg px-2.5 py-2 transition hover:bg-paper-2 ${
                selected ? "bg-paper-2" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[13px] font-semibold text-ink">{row.from}</span>
                <LocalTime
                  iso={row.receivedAt}
                  format="short"
                  className="shrink-0 text-[11px] text-ink-soft"
                />
              </div>
              <p className="truncate text-[12.5px] leading-snug text-ink">{row.subject}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <CategoryBadge category={row.category} />
                {row.resolved ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-mute-bg px-2 py-0.5 text-[10px] font-semibold text-mute">
                    <CheckCheck size={11} aria-hidden />
                    Resolved
                  </span>
                ) : (
                  <>
                    {row.mismatchedFields && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-bad-bg px-2 py-0.5 text-[10px] font-semibold text-bad">
                        <AlertTriangle size={11} aria-hidden />
                        Mismatch{mismatchSummary(row.mismatchedFields)}
                      </span>
                    )}
                    {row.matched && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-good-bg px-2 py-0.5 text-[10px] font-semibold text-good">
                        <CheckCircle2 size={11} aria-hidden />
                        Match
                      </span>
                    )}
                    {row.reviewReason && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warn-bg px-2 py-0.5 text-[10px] font-semibold text-warn">
                        <UserCheck size={11} aria-hidden />
                        Needs review
                        {row.reviewReason !== "unknown" && <> · {REVIEW_REASON_SHORT[row.reviewReason]}</>}
                      </span>
                    )}
                  </>
                )}
                {row.attachmentCount > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-[11px] text-ink-soft">
                    <Paperclip size={13} aria-hidden />
                    <span className="sr-only">{row.attachmentCount} attachments</span>
                  </span>
                )}
                {row.unread && (
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-copper" aria-label="Unread" />
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Always shown, so a list that fits on one page reads as one page: both buttons
          are simply disabled (Newer on page 1, Older when there's no next page) */}
      <div className="shrink-0 border-t border-line px-3 py-2">
        {error && (
          <p role="alert" className="mb-1.5 text-[12px] text-bad">
            {error}
          </p>
        )}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] text-ink-soft" aria-live="polite">
            {loading ? "Loading…" : `Page ${view.page}`}
          </span>
          <div className="flex gap-1.5">
            <PagerButton
              disabled={loading || view.page <= 1}
              onClick={() => {
                exhausted.current = false;
                goTo(view.page - 1, -1);
              }}
            >
              <ArrowLeft size={15} strokeWidth={2.25} aria-hidden /> Newer
            </PagerButton>
            <PagerButton
              disabled={loading || !view.hasNext}
              onClick={() => {
                exhausted.current = false;
                goTo(view.page + 1, 1);
              }}
            >
              Older <ArrowRight size={15} strokeWidth={2.25} aria-hidden />
            </PagerButton>
          </div>
        </div>
      </div>
    </section>
  );
}

/** " · Consignee, Notify Party", or just a count once naming them would crowd the row. */
function mismatchSummary(fields: string[]): string {
  if (fields.length === 0) return "";
  return fields.length <= 2 ? ` · ${fields.join(", ")}` : ` · ${fields.length} fields`;
}

type StatusFilter = "all" | "mismatch" | "review" | "draft" | "match" | "resolved";

// Same tones as the row badges below, so a selected pill previews what it filters to.
const STATUS_FILTERS: { value: StatusFilter; label: string; tone: string }[] = [
  { value: "all", label: "All", tone: "border-ink bg-ink text-paper" },
  { value: "match", label: "Match", tone: "border-transparent bg-good-bg text-good" },
  { value: "mismatch", label: "Mismatch", tone: "border-transparent bg-bad-bg text-bad" },
  { value: "draft", label: "Draft BL", tone: "border-transparent bg-info-bg text-info" },
  { value: "review", label: "Needs review", tone: "border-transparent bg-warn-bg text-warn" },
  { value: "resolved", label: "Resolved", tone: "border-transparent bg-mute-bg text-mute" },
];

function matchesStatus(row: InboxRow, status: StatusFilter): boolean {
  switch (status) {
    case "resolved":
      return !!row.resolved;
    // Resolved overrides the others: once a person clears it, it's out of
    // Mismatch/Needs review and only counted under Resolved from then on.
    case "mismatch":
      return !!row.mismatchedFields && !row.resolved;
    case "review":
      return !!row.reviewReason && !row.resolved;
    case "match":
      return !!row.matched && !row.resolved;
    // No verdict yet: nothing to check the request against, so it's still just a draft ask.
    case "draft":
      return !row.mismatchedFields && !row.reviewReason && !row.matched && !row.resolved;
    default:
      return true;
  }
}

function StatusFilterButtons({
  value,
  onChange,
}: {
  value: StatusFilter;
  onChange: (v: StatusFilter) => void;
}) {
  return (
    <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-1">
      {STATUS_FILTERS.map((f) => (
        <button
          key={f.value}
          type="button"
          aria-pressed={value === f.value}
          onClick={() => onChange(f.value)}
          className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold transition ${
            value === f.value ? f.tone : "border-line text-ink-soft hover:bg-paper-2"
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

function PagerButton({
  disabled,
  onClick,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[12.5px] font-semibold text-ink transition enabled:hover:bg-paper-2 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
