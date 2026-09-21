import { displayName } from "@/lib/format";
import type { Email } from "@/lib/types";
import { Attachments } from "./attachments";
import { Avatar } from "./avatar";
import { EmailBody } from "./email-body";
import { LocalTime } from "./local-time";

/** Middle pane: the full email. */
export function EmailViewer({ email }: { email: Email }) {
  const sender = displayName(email.from);

  return (
    <article className="px-4 py-6 sm:px-10 sm:py-8">
      <h1 className="mb-5 text-[21px] leading-snug font-semibold">{email.subject}</h1>

      <div className="mb-6 flex items-center gap-3 border-b border-line pb-[22px]">
        <Avatar name={sender} size={38} variant="sender" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-semibold">{sender}</p>
          <p className="truncate text-[12.5px] text-ink-soft">{email.from.email}</p>
        </div>
        <LocalTime
          iso={email.received_at}
          format="full"
          className="shrink-0 text-[12.5px] text-ink-soft"
        />
      </div>

      <dl className="mb-6 space-y-1 text-xs text-ink-soft">
        <div className="flex gap-2">
          <dt className="w-14 shrink-0">Email ID</dt>
          <dd>
            <code className="text-ink">{email.email_id}</code>
          </dd>
        </div>
        {email.to.length > 0 && (
          <div className="flex gap-2">
            <dt className="w-14 shrink-0">To</dt>
            <dd className="min-w-0 break-words text-ink">
              {email.to.map((t) => t.email).join(", ")}
            </dd>
          </div>
        )}
      </dl>

      <EmailBody body={email.body} type={email.body_type} />

      <Attachments attachments={email.attachments} documents={email.shipment_documents} />
    </article>
  );
}
