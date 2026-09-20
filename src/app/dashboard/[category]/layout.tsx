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

  // Page 1 only; the pane asks for later pages when you press Older
  const first = await getInboxPage(meta.slug, 1);

  return (
    <div className="flex h-full min-h-0">
      {/* key: a different tab is a different list, so start it fresh on page 1 */}
      <InboxPane
        key={meta.slug}
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
