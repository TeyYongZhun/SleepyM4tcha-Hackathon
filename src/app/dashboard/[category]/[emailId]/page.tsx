import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/auth";
import { EmailViewer } from "@/components/email-viewer";
import { ReplyBar } from "@/components/reply-bar";
import { ResizableSplit } from "@/components/resizable-split";
import { SummaryPanel } from "@/components/summary-panel";
import { getCategoryBySlug } from "@/lib/categories";
import { getEmail } from "@/lib/emails";
import { gmailReplyUrl } from "@/lib/reply";

export default async function EmailPage({
  params,
}: PageProps<"/dashboard/[category]/[emailId]">) {
  const { category, emailId } = await params;
  const meta = getCategoryBySlug(category);
  const email = meta && (await getEmail(decodeURIComponent(emailId)));
  if (!meta || !email) notFound();

  // The demo user's address is fake, so only a real Google sign-in picks the Gmail account
  const session = await auth();
  const replyUrl = gmailReplyUrl(email, session?.demo ? null : session?.user?.email);

  return (
    // Below lg the two panes stack and scroll together; from lg each pane scrolls on its own
    // and the divider between them can be dragged.
    <ResizableSplit
      left={
        <>
          <Link
            href={`/dashboard/${meta.slug}`}
            className="inline-flex items-center gap-1.5 px-4 pt-4 text-sm text-ink-soft hover:text-ink sm:px-10 lg:hidden"
          >
            <ArrowLeft size={16} aria-hidden />
            Back to {meta.label}
          </Link>
          <EmailViewer email={email} />
        </>
      }
      leftFooter={<ReplyBar href={replyUrl} emailId={email.email_id} to={email.from.email} />}
      right={<SummaryPanel email={email} />}
    />
  );
}
