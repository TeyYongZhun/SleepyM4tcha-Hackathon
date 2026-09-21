import { Suspense } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { InboxPane } from "@/components/inbox-pane";
import { InboxSkeleton } from "@/components/inbox-skeleton";
import { type CategorySlug, getCategoryBySlug } from "@/lib/categories";
import { getInboxPage, toInboxRow, usesGmail } from "@/lib/emails";

export default async function CategoryLayout({
  children,
  params,
}: LayoutProps<"/dashboard/[category]">) {
  const { category } = await params;
  const meta = getCategoryBySlug(category);
  if (!meta) notFound();
  const title = meta.slug === "all" ? "Inbox" : meta.label;

  // Page 1 only; the pane asks for later pages when you press Older. Every tab shows the same
  // newest page, so switching tabs can reuse what was read a moment ago, while a page load or
  // reload always asks Gmail (that is how new mail shows up). The two are told apart by how the
  // browser made the request: switching tabs is a client-side navigation, a fetch (dest
  // "empty"); a load or reload is a document request. (Next doesn't pass its own RSC header
  // through to server components, so this is what there is.) A browser that sends neither
  // header just never reuses, which is the safe side.
  const clientNav = (await headers()).get("sec-fetch-dest") === "empty";
  const gmail = await usesGmail();

  let list: React.ReactNode;
  if (gmail && clientNav) {
    // A Gmail tab switch: the browser already holds that page (lib/inbox-cache.ts) and shows it
    // at once, reading it again itself once it has aged. Reading it here as well made every
    // switch wait on Gmail -- and on a serverless host, whichever instance answered might never
    // have seen the page, and read every message on it and its attachments all over again.
    list = <InboxPane key={`${meta.slug}:0`} slug={meta.slug} title={title} initial={null} />;
  } else if (gmail) {
    // Loading or reloading a Gmail inbox reads it from Gmail, which takes a moment: the list
    // streams in on its own, so the email on the right (or the placeholder) doesn't wait for it.
    // Only here -- once shown, React keeps a fallback up for at least 300ms, which would make
    // every quick render slower than simply waiting for it.
    list = (
      <Suspense fallback={<InboxSkeleton title={title} />}>
        <CategoryInbox slug={meta.slug} title={title} clientNav={false} />
      </Suspense>
    );
  } else {
    // The other sources hold every email in memory already
    list = <CategoryInbox slug={meta.slug} title={title} clientNav={clientNav} />;
  }

  return (
    <div className="flex h-full min-h-0">
      {list}
      {children}
    </div>
  );
}

async function CategoryInbox({
  slug,
  title,
  clientNav,
}: {
  slug: CategorySlug;
  title: string;
  clientNav: boolean;
}) {
  const first = await getInboxPage(slug, 1, { reuse: clientNav });
  return (
    // key: a different tab is a different list, so start it fresh on page 1. The demo's data
    // version is in it too: importing, clearing or bringing the sample back replaces every
    // email, and the list must not carry on showing the old ones.
    <InboxPane
      key={`${slug}:${first.version ?? 0}`}
      slug={slug}
      title={title}
      initial={{
        rows: first.emails.map(toInboxRow),
        page: first.page,
        total: first.total,
        hasNext: first.hasNext,
        filtered: first.filtered,
      }}
    />
  );
}
