import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { InboxPane } from "@/components/inbox-pane";
import { getCategoryBySlug } from "@/lib/categories";
import { getInboxPage, toInboxRow } from "@/lib/emails";

export default async function CategoryLayout({
  children,
  params,
}: LayoutProps<"/dashboard/[category]">) {
  const { category } = await params;
  const meta = getCategoryBySlug(category);
  if (!meta) notFound();

  // Page 1 only; the pane asks for later pages when you press Older. Every tab shows the same
  // newest page, so switching tabs can reuse what was read a moment ago, while a page load or
  // reload always asks Gmail (that is how new mail shows up). The two are told apart by how the
  // browser made the request: switching tabs is a client-side navigation, a fetch (dest
  // "empty"); a load or reload is a document request. (Next doesn't pass its own RSC header
  // through to server components, so this is what there is.) A browser that sends neither
  // header just never reuses, which is the safe side.
  const clientNav = (await headers()).get("sec-fetch-dest") === "empty";
  const first = await getInboxPage(meta.slug, 1, { reuse: clientNav });

  return (
    <div className="flex h-full min-h-0">
      {/* key: a different tab is a different list, so start it fresh on page 1. The demo's data
          version is in it too: importing, clearing or bringing the sample back replaces every
          email, and the list must not carry on showing the old ones. */}
      <InboxPane
        key={`${meta.slug}:${first.version ?? 0}`}
        slug={meta.slug}
        title={meta.slug === "all" ? "Inbox" : meta.label}
        initial={{
          rows: first.emails.map(toInboxRow),
          page: first.page,
          total: first.total,
          hasNext: first.hasNext,
          filtered: first.filtered,
        }}
      />
      {children}
    </div>
  );
}
